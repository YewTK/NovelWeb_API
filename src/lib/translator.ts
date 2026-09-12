"use client";

import { buildChunks, parseMarkers, tailOf, type Chunk } from "./chunk";
import type { GlossaryEntry, ProviderConfig, StyleSettings } from "./types";

const CONCURRENCY = 3;

type SseHandlers = {
  onDelta: (text: string) => void;
  onError: (message: string) => void;
};

async function streamSse(
  body: unknown,
  signal: AbortSignal,
  handlers: SseHandlers,
): Promise<void> {
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    let message = `เรียก API ไม่สำเร็จ (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) message = j.error;
    } catch {
      /* keep default */
    }
    handlers.onError(message);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      const eventLine = frame.split("\n").find((l) => l.startsWith("event:"));
      const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) continue;

      const event = eventLine?.slice(6).trim() ?? "message";
      const payload = JSON.parse(dataLine.slice(5).trim());

      if (event === "delta") handlers.onDelta(payload as string);
      else if (event === "error") handlers.onError((payload as { message: string }).message);
    }
  }
}

export interface GlossaryResult {
  title: string;
  terms: GlossaryEntry[];
}

export async function runGlossaryPass(opts: {
  config: ProviderConfig;
  style: StyleSettings;
  title: string;
  paragraphs: string[];
  /** terms already locked for this novel, so the model only reports new ones */
  known?: GlossaryEntry[];
  signal: AbortSignal;
}): Promise<GlossaryResult | null> {
  let raw = "";
  let failed: string | null = null;

  await streamSse(
    {
      mode: "glossary",
      config: opts.config,
      style: opts.style,
      glossary: opts.known ?? [],
      title: opts.title,
      paragraphs: opts.paragraphs.slice(0, 60).map((text, id) => ({ id, text })),
    },
    opts.signal,
    {
      onDelta: (t) => {
        raw += t;
      },
      onError: (m) => {
        failed = m;
      },
    },
  );

  if (failed) throw new Error(failed);

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
        .slice(0, 32)
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

export interface TranslateJob {
  config: ProviderConfig;
  style: StyleSettings;
  glossary: GlossaryEntry[];
  title: string;
  paragraphs: string[];
  /** paragraph ids that already have a translation and should be skipped */
  skip?: Set<number>;
  signal: AbortSignal;
  onParagraph: (id: number, text: string) => void;
  onChunkDone: (chunkIndex: number, total: number) => void;
  onError: (message: string) => void;
}

export async function runTranslation(job: TranslateJob): Promise<void> {
  const allChunks = buildChunks(job.paragraphs);
  const chunks = job.skip?.size
    ? allChunks.filter((c) => c.units.some((u) => !job.skip!.has(u.id)))
    : allChunks;

  const total = chunks.length;
  let completed = 0;
  let cursor = 0;
  let fatal: string | null = null;

  const translated = new Map<number, string>();

  /** Finished prose from the opening section, used to hold the voice steady. */
  let styleSample: string | undefined;

  const runChunk = async (chunk: Chunk) => {
    const prev = allChunks[chunk.index - 1];
    const previousSource = prev ? tailOf(prev.units) : undefined;
    const previousTarget = prev
      ? tailOf(
          prev.units
            .map((u) => ({ text: translated.get(u.id) ?? "" }))
            .filter((u) => u.text),
        ) || undefined
      : undefined;

    let buffer = "";
    const emitted = new Map<number, string>();

    const flush = () => {
      const map = parseMarkers(buffer);
      const ids = [...map.keys()].sort((a, b) => a - b);
      ids.forEach((id, i) => {
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

    await streamSse(
      {
        mode: "translate",
        config: job.config,
        style: job.style,
        glossary: job.glossary,
        title: job.title,
        paragraphs: chunk.units,
        previousSource,
        previousTarget,
        styleSample,
      },
      job.signal,
      {
        onDelta: (t) => {
          buffer += t;
          flush();
        },
        onError: (m) => {
          fatal = m;
        },
      },
    );

    flush();

    // Anything the model dropped gets a visible marker rather than silence.
    for (const unit of chunk.units) {
      if (!translated.has(unit.id)) {
        translated.set(unit.id, "");
        job.onParagraph(unit.id, "");
      }
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
    styleSample = tailOf(opening, 700) || undefined;
  }

  const worker = async () => {
    while (!fatal && !job.signal.aborted) {
      const index = cursor++;
      if (index >= chunks.length) return;
      await runChunk(chunks[index]);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, chunks.length - 1) }, worker),
  );

  if (fatal) job.onError(fatal);
}
