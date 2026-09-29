"use client";

import { chunkUnits, parseMarkers, tailOf, type Chunk, type ChunkUnit } from "./chunk";
import { acquireKey, NoKeyAvailableError, penalize } from "./keypool";
import { GLOSSARY_TERMS_PER_CHAPTER } from "./prompt";
import type { BookInfo, GlossaryEntry, ProviderConfig, StyleSettings } from "./types";

const CONCURRENCY = 3;

/** Everything needed to call the provider, minus the choice of key. */
export interface KeyRing {
  config: ProviderConfig;
  keys: string[];
  /** requests per minute allowed on each key; 0 = no client-side limit */
  rpm: number;
}

export interface BookContext {
  name?: string;
  info?: BookInfo;
}

interface StreamFailure {
  message: string;
  status: number;
  retryAfterMs?: number;
  quota?: "minute" | "day";
}

export function isAbort(e: unknown): boolean {
  return (e as { name?: string })?.name === "AbortError";
}

/** One request to an SSE route. Resolves with the failure, if any, instead of throwing. */
async function streamSse(
  endpoint: string,
  body: unknown,
  signal: AbortSignal,
  onDelta: (text: string) => void,
): Promise<StreamFailure | null> {
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (isAbort(e)) throw e;
    return { message: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ต", status: 503 };
  }

  if (!res.ok || !res.body) {
    let failure: StreamFailure = {
      message: `เรียก API ไม่สำเร็จ (${res.status})`,
      status: res.status,
    };
    try {
      const j = await res.json();
      if (j?.error) failure = { ...failure, message: j.error };
    } catch {
      /* keep default */
    }
    return failure;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let failure: StreamFailure | null = null;
  let finished = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        const lines = frame.split("\n");
        const eventLine = lines.find((l) => l.startsWith("event:"));
        const dataLine = lines.find((l) => l.startsWith("data:"));
        if (!dataLine) continue;

        const event = eventLine?.slice(6).trim() ?? "message";
        let payload: unknown;
        try {
          payload = JSON.parse(dataLine.slice(5).trim());
        } catch {
          continue;
        }

        if (event === "delta") onDelta(payload as string);
        else if (event === "error") failure = payload as StreamFailure;
        else if (event === "done") finished = true;
      }
    }
  } catch (e) {
    if (isAbort(e)) throw e;
    return { message: "การเชื่อมต่อหลุดระหว่างแปล", status: 503 };
  }

  if (failure) return failure;
  // A stream that ends without "done" was cut off (proxy timeout, sleep).
  if (!finished) return { message: "การเชื่อมต่อหลุดระหว่างแปล", status: 503 };
  return null;
}

const MAX_RATE_RETRIES = 24;
const MAX_SERVER_RETRIES = 6;

/**
 * Sends one request, choosing a key from the ring, and keeps going through
 * rate limits, exhausted keys and provider hiccups. `onReset` fires when a
 * half-streamed attempt is thrown away so the caller can clear partial text.
 */
export async function callWithRetry(opts: {
  /** SSE route to call; the translator's by default */
  endpoint?: string;
  ring: KeyRing;
  body: Record<string, unknown>;
  signal: AbortSignal;
  onDelta: (text: string) => void;
  onReset?: () => void;
  onNotice?: (message: string | null) => void;
}): Promise<void> {
  const { ring, signal } = opts;
  let rateRetries = 0;
  let serverRetries = 0;

  while (true) {
    const lease = await acquireKey(ring.keys, ring.rpm, signal, (ms) => {
      opts.onNotice?.(`รอคิวโควตา API ประมาณ ${Math.ceil(ms / 1000)} วินาที…`);
    });
    opts.onNotice?.(null);

    let received = false;
    let failure: StreamFailure | null;
    try {
      failure = await streamSse(
        opts.endpoint ?? "/api/translate",
        { ...opts.body, config: { ...ring.config, apiKey: lease.key } },
        signal,
        (text) => {
          received = true;
          opts.onDelta(text);
        },
      );
    } finally {
      lease.release();
    }

    if (!failure) return;
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    const { status } = failure;
    if (status === 429) {
      penalize(lease.key, failure.quota === "day" ? "day" : "rate", failure.retryAfterMs);
      rateRetries += 1;
      if (rateRetries > MAX_RATE_RETRIES) throw new Error(failure.message);
      opts.onNotice?.(
        ring.keys.length > 1
          ? "คีย์ติดลิมิต กำลังสลับไปใช้คีย์ถัดไป…"
          : "ติดลิมิตของ API กำลังรอแล้วลองใหม่อัตโนมัติ…",
      );
    } else if (status === 402) {
      penalize(lease.key, "day");
    } else if (status === 401 || status === 403) {
      penalize(lease.key, "invalid");
    } else if (status >= 500 || status === 408) {
      serverRetries += 1;
      if (serverRetries > MAX_SERVER_RETRIES) throw new Error(failure.message);
      // Exponential back-off: 2s, 4s, 8s … capped at 30s.
      penalize(
        lease.key,
        "server",
        failure.retryAfterMs ?? Math.min(30_000, 1000 * 2 ** serverRetries),
      );
      opts.onNotice?.("เซิร์ฟเวอร์ AI ไม่ว่าง กำลังลองใหม่…");
    } else {
      // 400, 404, 451 … retrying the same request will not change the answer.
      throw new Error(failure.message);
    }

    if (received) opts.onReset?.();
  }
}

/** Turns a key-pool or abort failure into the message the UI shows. */
export function messageOf(e: unknown): string {
  if (e instanceof NoKeyAvailableError) return e.message;
  if (e instanceof Error) return e.message;
  return "เกิดข้อผิดพลาดที่ไม่รู้จัก";
}

/* -------------------------------- glossary ------------------------------- */

export interface GlossaryResult {
  title: string;
  terms: GlossaryEntry[];
}

export async function runGlossaryPass(opts: {
  ring: KeyRing;
  style: StyleSettings;
  book?: BookContext;
  title: string;
  paragraphs: string[];
  /** terms already locked for this novel, so the model only reports new ones */
  known?: GlossaryEntry[];
  signal: AbortSignal;
  onNotice?: (message: string | null) => void;
}): Promise<GlossaryResult | null> {
  let raw = "";

  try {
    await callWithRetry({
      ring: opts.ring,
      signal: opts.signal,
      body: {
        mode: "glossary",
        style: opts.style,
        book: opts.book,
        glossary: opts.known ?? [],
        title: opts.title,
        // The route samples evenly across whatever it receives.
        paragraphs: opts.paragraphs.map((text, id) => ({ id, text })),
      },
      onDelta: (t) => {
        raw += t;
      },
      onReset: () => {
        raw = "";
      },
      onNotice: opts.onNotice,
    });
  } catch (e) {
    if (isAbort(e)) throw e;
    throw new Error(messageOf(e));
  }

  const jsonText = raw.replace(/^[\s\S]*?\{/, "{").replace(/\}[^}]*$/, "}");
  try {
    const parsed = JSON.parse(jsonText) as {
      title?: string;
      terms?: GlossaryEntry[];
    };
    return {
      title: (parsed.title ?? "").trim(),
      terms: (parsed.terms ?? [])
        .filter((t) => t?.source && t?.target)
        .slice(0, GLOSSARY_TERMS_PER_CHAPTER)
        .map((t) => ({
          source: String(t.source).trim(),
          target: String(t.target).trim(),
          note: t.note ? String(t.note).trim() : "",
        })),
    };
  } catch {
    return null;
  }
}

/* ------------------------------- translation ------------------------------ */

export interface TranslateJob {
  ring: KeyRing;
  style: StyleSettings;
  book?: BookContext;
  glossary: GlossaryEntry[];
  title: string;
  paragraphs: string[];
  /** paragraph ids that already have a translation and should be skipped */
  skip?: Set<number>;
  signal: AbortSignal;
  onParagraph: (id: number, text: string) => void;
  onChunkDone: (chunkIndex: number, total: number) => void;
  onError: (message: string) => void;
  /** transient status such as "waiting for quota"; null clears it */
  onNotice?: (message: string | null) => void;
}

export async function runTranslation(job: TranslateJob): Promise<void> {
  const todo: ChunkUnit[] = job.paragraphs
    .map((text, id) => ({ id, text }))
    .filter((u) => !job.skip?.has(u.id) && u.text.trim());
  const chunks = chunkUnits(todo);

  let total = chunks.length;
  let completed = 0;
  let cursor = 0;
  let fatal: string | null = null;

  const translated = new Map<number, string>();

  /** Finished prose from the opening section, used to hold the voice steady. */
  let styleSample: string | undefined;

  /** Source and translation leading up to a paragraph, for continuity. */
  const contextBefore = (firstId: number) => {
    const before: { id: number; text: string }[] = [];
    let chars = 0;
    for (let id = firstId - 1; id >= 0 && chars < 500; id--) {
      const text = job.paragraphs[id];
      if (!text) continue;
      before.unshift({ id, text });
      chars += text.length;
    }
    if (!before.length) return { previousSource: undefined, previousTarget: undefined };
    const targets = before
      .map((u) => ({ text: translated.get(u.id) ?? "" }))
      .filter((u) => u.text);
    return {
      previousSource: tailOf(before),
      previousTarget:
        targets.length === before.length ? tailOf(targets) || undefined : undefined,
    };
  };

  const runChunk = async (chunk: Chunk) => {
    const { previousSource, previousTarget } = contextBefore(chunk.units[0].id);

    let buffer = "";
    const emitted = new Map<number, string>();

    const flush = () => {
      const map = parseMarkers(buffer);
      const ids = [...map.keys()].sort((a, b) => a - b);
      ids.forEach((id, i) => {
        if (!chunk.units.some((u) => u.id === id)) return; // hallucinated marker
        const text = map.get(id)!;
        // The last marker is still mid-stream; emit it as a growing partial.
        const isLast = i === ids.length - 1;
        if (!text && !isLast) return;
        if (emitted.get(id) === text) return;
        emitted.set(id, text);
        translated.set(id, text);
        job.onParagraph(id, text);
      });
    };

    try {
      await callWithRetry({
        ring: job.ring,
        signal: job.signal,
        body: {
          mode: "translate",
          style: job.style,
          book: job.book,
          glossary: job.glossary,
          title: job.title,
          paragraphs: chunk.units,
          previousSource,
          previousTarget,
          styleSample,
        },
        onDelta: (t) => {
          buffer += t;
          flush();
        },
        onReset: () => {
          buffer = "";
          emitted.clear();
        },
        onNotice: job.onNotice,
      });
      flush();
    } catch (e) {
      if (isAbort(e)) return;
      fatal = messageOf(e);
      return;
    }

    completed += 1;
    job.onChunkDone(completed, total);
  };

  // The opening section runs on its own so its finished prose can anchor the
  // voice of everything after it. The rest go out in parallel and would each
  // otherwise settle on their own register, pronouns and naming.
  if (chunks.length && !job.signal.aborted) {
    await runChunk(chunks[0]);
    cursor = 1;

    const opening = chunks[0].units
      .map((u) => ({ text: translated.get(u.id) ?? "" }))
      .filter((u) => u.text);
    styleSample = tailOf(opening, 900) || undefined;
  }

  const drain = async (list: Chunk[]) => {
    const worker = async () => {
      while (!fatal && !job.signal.aborted) {
        const index = cursor++;
        if (index >= list.length) return;
        await runChunk(list[index]);
      }
    };
    await Promise.all(
      Array.from({ length: Math.max(1, Math.min(CONCURRENCY, list.length - cursor)) }, worker),
    );
  };

  await drain(chunks);

  // Models occasionally skip a marker. Give the dropped paragraphs one more,
  // smaller pass before calling the chapter finished.
  if (!fatal && !job.signal.aborted) {
    const dropped = todo.filter((u) => !translated.get(u.id)?.trim());
    if (dropped.length) {
      const retry = chunkUnits(dropped);
      total += retry.length;
      cursor = 0;
      await drain(retry);
    }
  }

  // Anything still missing gets a visible marker rather than silence.
  for (const unit of todo) {
    if (!translated.has(unit.id)) job.onParagraph(unit.id, "");
  }

  job.onNotice?.(null);
  if (fatal) job.onError(fatal);
}
