import Anthropic from "@anthropic-ai/sdk";
import { supportsEffort } from "./models";
import type { Effort, ProviderConfig } from "./types";

export interface GenerateOptions {
  config: ProviderConfig;
  system: string;
  user: string;
  effort: Effort;
  maxTokens?: number;
  /** Lower keeps terminology and register stable; higher loosens the prose. */
  temperature?: number;
  /**
   * Marks the system prompt as cacheable. The prompt carries the whole locked
   * glossary and is identical for every chunk of every chapter in a novel, so
   * caching it turns a large repeated input cost into a cheap cache read.
   */
  cacheSystem?: boolean;
  signal?: AbortSignal;
}

export type QuotaScope = "minute" | "day";

export class ProviderError extends Error {
  status: number;
  /** How long the provider asked us to back off, when it said. */
  retryAfterMs?: number;
  /**
   * "day" means the key's daily or billing quota is gone — waiting a minute
   * will not help, the caller should move on to another key.
   */
  quota?: QuotaScope;
  constructor(
    message: string,
    status = 500,
    extra: { retryAfterMs?: number; quota?: QuotaScope } = {},
  ) {
    super(message);
    this.status = status;
    this.retryAfterMs = extra.retryAfterMs;
    this.quota = extra.quota;
  }
}

/** "37s", "1.5s", "120", or an HTTP date → milliseconds. */
function parseDelay(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw * 1000;
  if (typeof raw !== "string") return undefined;
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) {
    const at = Date.parse(raw);
    return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
  }
  return Math.round((/ms$/.test(raw) ? n / 1000 : n) * 1000);
}

interface RateInfo {
  retryAfterMs?: number;
  quota?: QuotaScope;
  detail?: string;
}

/**
 * Pulls the back-off hint out of whatever shape the provider used: Google puts
 * RetryInfo and QuotaFailure in the JSON body, Anthropic and OpenAI send a
 * Retry-After header, and OpenAI flags an empty wallet as insufficient_quota.
 */
function rateInfo(body: string, headers?: Headers | null): RateInfo {
  const info: RateInfo = {};
  const header = headers?.get?.("retry-after");
  if (header) info.retryAfterMs = parseDelay(header);

  try {
    const json = JSON.parse(body);
    const err = Array.isArray(json) ? json[0]?.error : (json?.error ?? json);
    if (typeof err?.message === "string") info.detail = err.message;

    const details: Record<string, unknown>[] = Array.isArray(err?.details)
      ? err.details
      : [];
    for (const d of details) {
      const type = String(d["@type"] ?? "");
      if (type.includes("RetryInfo")) {
        info.retryAfterMs = parseDelay(d.retryDelay) ?? info.retryAfterMs;
      }
      if (type.includes("QuotaFailure")) {
        const violations = (d.violations as { quotaId?: string }[] | undefined) ?? [];
        if (violations.some((v) => /PerDay/i.test(v.quotaId ?? ""))) info.quota = "day";
      }
    }
    if (err?.code === "insufficient_quota" || err?.type === "insufficient_quota") {
      info.quota = "day";
    }
  } catch {
    /* not JSON */
  }

  if (!info.quota && /PerDay|insufficient_quota|exceeded your current quota.*billing/i.test(body)) {
    info.quota = "day";
  }
  return info;
}

function friendly(status: number, body: string, headers?: Headers | null): ProviderError {
  if (status === 401 || status === 403)
    return new ProviderError("API Key ไม่ถูกต้องหรือไม่มีสิทธิ์ใช้โมเดลนี้", 401);
  if (status === 402)
    return new ProviderError("เครดิตในบัญชี API ไม่พอ", 402, { quota: "day" });
  if (status === 404)
    return new ProviderError("ไม่พบโมเดลนี้ในบัญชีของคุณ ลองเลือกโมเดลอื่น", 404);

  const info = rateInfo(body, headers);
  if (status === 429) {
    return new ProviderError(
      info.quota === "day"
        ? "โควตารายวันของ API Key นี้หมดแล้ว"
        : "เรียก API ถี่เกินไป (429)",
      429,
      { retryAfterMs: info.retryAfterMs, quota: info.quota ?? "minute" },
    );
  }
  if (status === 529 || status >= 500) {
    return new ProviderError(
      "เซิร์ฟเวอร์ของผู้ให้บริการ AI ไม่ว่าง ลองใหม่อีกครั้ง",
      503,
      { retryAfterMs: info.retryAfterMs },
    );
  }
  return new ProviderError(
    (info.detail || body).slice(0, 300) || "เรียก API ไม่สำเร็จ",
    status || 500,
  );
}

/* ------------------------------- Anthropic ------------------------------- */

const FALLBACK_BETA = "server-side-fallback-2026-07-01";

async function* anthropicStream(o: GenerateOptions): AsyncGenerator<string> {
  const client = new Anthropic({
    apiKey: o.config.apiKey,
    // The browser owns retries: it can rotate to another key instead of
    // sleeping on the one that was just rate limited.
    maxRetries: 0,
    timeout: 180_000,
  });

  const usesEffort = supportsEffort(o.config.model);

  const base = {
    model: o.config.model,
    max_tokens: o.maxTokens ?? 16000,
    system: o.cacheSystem
      ? [
          {
            type: "text" as const,
            text: o.system,
            cache_control: { type: "ephemeral" as const },
          },
        ]
      : o.system,
    messages: [{ role: "user" as const, content: o.user }],
    ...(usesEffort ? { output_config: { effort: o.effort } } : {}),
    // Effort-controlled models pick their own sampling; for the rest a cooler
    // setting keeps names and register from drifting between chunks.
    ...(!usesEffort && o.temperature !== undefined
      ? { temperature: o.temperature }
      : {}),
  };

  // Opus 5 can decline a request outright; server-side fallback keeps the
  // chapter moving instead of dead-ending. Retried without it if the account
  // does not have the beta.
  const wantsFallback = /^claude-(opus-5|fable-5)/.test(o.config.model);

  const open = async (withFallback: boolean) =>
    client.beta.messages.stream(
      withFallback
        ? { ...base, betas: [FALLBACK_BETA], fallbacks: "default" }
        : base,
      { signal: o.signal },
    );

  let stream;
  try {
    stream = await open(wantsFallback);
  } catch (e) {
    const err = e as { status?: number };
    if (wantsFallback && err?.status === 400) {
      stream = await open(false);
    } else {
      throw e;
    }
  }

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    }
  }

  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") {
    throw new ProviderError(
      "โมเดลปฏิเสธเนื้อหาส่วนนี้ ลองสลับไปใช้โมเดลอื่นสำหรับตอนนี้",
      451,
    );
  }
}

/* --------------------------- OpenAI / compatible -------------------------- */

function openAiBase(config: ProviderConfig): string {
  if (config.provider === "openai") return "https://api.openai.com/v1";
  const raw = (config.baseUrl || "").trim().replace(/\/+$/, "");
  if (!raw) throw new ProviderError("กรุณาระบุ Base URL ของผู้ให้บริการ", 400);
  return /\/v\d+$/.test(raw) ? raw : `${raw}/v1`;
}

async function* sseLines(res: Response): AsyncGenerator<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() ?? "";
    for (const line of parts) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data:")) yield trimmed.slice(5).trim();
    }
  }
  if (buffer.trim().startsWith("data:")) yield buffer.trim().slice(5).trim();
}

async function* openAiStream(o: GenerateOptions): AsyncGenerator<string> {
  const res = await fetch(`${openAiBase(o.config)}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${o.config.apiKey}`,
      "http-referer": "https://novelflow.app",
      "x-title": "NovelFlow",
    },
    body: JSON.stringify({
      model: o.config.model,
      max_tokens: o.maxTokens ?? 16000,
      temperature: o.temperature ?? 0.3,
      stream: true,
      messages: [
        { role: "system", content: o.system },
        { role: "user", content: o.user },
      ],
    }),
    signal: o.signal,
  });

  if (!res.ok || !res.body) {
    throw friendly(res.status, await res.text(), res.headers);
  }

  for await (const data of sseLines(res)) {
    if (data === "[DONE]") return;
    let json: {
      choices?: { delta?: { content?: string } }[];
      error?: { code?: number | string; message?: string };
    };
    try {
      json = JSON.parse(data);
    } catch {
      continue; // keep-alive or partial frame
    }
    // OpenRouter reports upstream rate limits inside an otherwise-200 stream.
    if (json.error) {
      const code = Number(json.error.code);
      throw friendly(Number.isFinite(code) ? code : 500, data);
    }
    const delta = json.choices?.[0]?.delta?.content;
    if (typeof delta === "string" && delta) yield delta;
  }
}

/* --------------------------------- Google -------------------------------- */

/**
 * Gemini 2.5 thinks by default and bills those tokens against
 * maxOutputTokens — which is how long chapters came back cut off mid-sentence.
 * Map the app's effort setting onto an explicit budget and reserve room for it.
 */
function geminiThinking(model: string, effort: Effort): number | null {
  if (!/gemini-2\.5/.test(model)) return null;
  if (/pro/.test(model)) return { low: 512, medium: 2048, high: 8192 }[effort];
  return { low: 0, medium: 1024, high: 4096 }[effort];
}

const GEMINI_BLOCKED = "Gemini บล็อกเนื้อหาส่วนนี้ ลองสลับไปใช้โมเดลอื่นสำหรับตอนนี้";

async function* googleStream(o: GenerateOptions): AsyncGenerator<string> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(o.config.model)}` +
    `:streamGenerateContent?alt=sse`;

  const budget = geminiThinking(o.config.model, o.effort);
  const maxOut = o.maxTokens ?? 16000;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // A header rather than the query string keeps the key out of access logs.
      "x-goog-api-key": o.config.apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: o.system }] },
      contents: [{ role: "user", parts: [{ text: o.user }] }],
      generationConfig: {
        temperature: o.temperature ?? 0.3,
        maxOutputTokens: maxOut + (budget ?? 0),
        ...(budget !== null ? { thinkingConfig: { thinkingBudget: budget } } : {}),
      },
      safetySettings: [
        "HARM_CATEGORY_HARASSMENT",
        "HARM_CATEGORY_HATE_SPEECH",
        "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        "HARM_CATEGORY_DANGEROUS_CONTENT",
      ].map((category) => ({ category, threshold: "BLOCK_ONLY_HIGH" })),
    }),
    signal: o.signal,
  });

  if (!res.ok || !res.body) {
    throw friendly(res.status, await res.text(), res.headers);
  }

  let produced = false;
  for await (const data of sseLines(res)) {
    if (!data) continue;
    let json: {
      candidates?: {
        content?: { parts?: { text?: string; thought?: boolean }[] };
        finishReason?: string;
      }[];
      promptFeedback?: { blockReason?: string };
      error?: { code?: number; message?: string };
    };
    try {
      json = JSON.parse(data);
    } catch {
      continue; // partial frame
    }

    if (json.error) throw friendly(json.error.code ?? 500, data);
    if (json.promptFeedback?.blockReason) throw new ProviderError(GEMINI_BLOCKED, 451);

    const candidate = json.candidates?.[0];
    for (const part of candidate?.content?.parts ?? []) {
      if (part.thought) continue;
      if (typeof part.text === "string" && part.text) {
        produced = true;
        yield part.text;
      }
    }

    const reason = candidate?.finishReason ?? "";
    if (!produced && /SAFETY|PROHIBITED|BLOCKLIST|SPII/.test(reason)) {
      throw new ProviderError(GEMINI_BLOCKED, 451);
    }
  }
}

/* --------------------------------- Public -------------------------------- */

export function streamText(o: GenerateOptions): AsyncGenerator<string> {
  switch (o.config.provider) {
    case "anthropic":
      return anthropicStream(o);
    case "google":
      return googleStream(o);
    default:
      return openAiStream(o);
  }
}

export async function generateText(o: GenerateOptions): Promise<string> {
  let out = "";
  for await (const delta of streamText(o)) out += delta;
  return out;
}

export function toProviderError(e: unknown): ProviderError {
  if (e instanceof ProviderError) return e;
  const err = e as {
    status?: number;
    message?: string;
    name?: string;
    headers?: Headers | Record<string, string>;
    error?: unknown;
  };
  if (err?.name === "AbortError") return new ProviderError("ยกเลิกแล้ว", 499);
  if (typeof err?.status === "number") {
    const headers =
      err.headers && typeof (err.headers as Headers).get === "function"
        ? (err.headers as Headers)
        : err.headers
          ? new Headers(err.headers as Record<string, string>)
          : null;
    const body = err.error ? JSON.stringify(err.error) : (err.message ?? "");
    return friendly(err.status, body, headers);
  }
  // fetch() itself failed — DNS, a reset connection, a provider-side timeout.
  if (/fetch failed|ECONNRESET|ETIMEDOUT|socket|network|timed? ?out/i.test(err?.message ?? "")) {
    return new ProviderError("เชื่อมต่อผู้ให้บริการ AI ไม่ได้ชั่วคราว", 503);
  }
  return new ProviderError(err?.message || "เกิดข้อผิดพลาดที่ไม่รู้จัก", 500);
}
