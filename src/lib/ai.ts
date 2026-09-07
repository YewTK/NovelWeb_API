import Anthropic from "@anthropic-ai/sdk";
import { supportsEffort } from "./models";
import type { Effort, ProviderConfig } from "./types";

export interface GenerateOptions {
  config: ProviderConfig;
  system: string;
  user: string;
  effort: Effort;
  maxTokens?: number;
  signal?: AbortSignal;
}

export class ProviderError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

function friendly(status: number, detail: string): ProviderError {
  if (status === 401 || status === 403)
    return new ProviderError("API Key ไม่ถูกต้องหรือไม่มีสิทธิ์ใช้โมเดลนี้", 401);
  if (status === 402)
    return new ProviderError("เครดิตในบัญชี API ไม่พอ", 402);
  if (status === 404)
    return new ProviderError("ไม่พบโมเดลนี้ในบัญชีของคุณ ลองเลือกโมเดลอื่น", 404);
  if (status === 429)
    return new ProviderError("เรียก API ถี่เกินไป รอสักครู่แล้วลองใหม่", 429);
  if (status === 529 || status >= 500)
    return new ProviderError("เซิร์ฟเวอร์ของผู้ให้บริการ AI ไม่ว่าง ลองใหม่อีกครั้ง", 503);
  return new ProviderError(detail || "เรียก API ไม่สำเร็จ", status || 500);
}

/* ------------------------------- Anthropic ------------------------------- */

const FALLBACK_BETA = "server-side-fallback-2026-07-01";

async function* anthropicStream(o: GenerateOptions): AsyncGenerator<string> {
  const client = new Anthropic({
    apiKey: o.config.apiKey,
    maxRetries: 1,
    timeout: 180_000,
  });

  const base = {
    model: o.config.model,
    max_tokens: o.maxTokens ?? 16000,
    system: o.system,
    messages: [{ role: "user" as const, content: o.user }],
    ...(supportsEffort(o.config.model)
      ? { output_config: { effort: o.effort } }
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
      temperature: 0.7,
      stream: true,
      messages: [
        { role: "system", content: o.system },
        { role: "user", content: o.user },
      ],
    }),
    signal: o.signal,
  });

  if (!res.ok || !res.body) {
    throw friendly(res.status, (await res.text()).slice(0, 300));
  }

  for await (const data of sseLines(res)) {
    if (data === "[DONE]") return;
    try {
      const json = JSON.parse(data);
      const delta = json.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta) yield delta;
    } catch {
      /* keep-alive or partial frame */
    }
  }
}

/* --------------------------------- Google -------------------------------- */

async function* googleStream(o: GenerateOptions): AsyncGenerator<string> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(o.config.model)}` +
    `:streamGenerateContent?alt=sse&key=${encodeURIComponent(o.config.apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: o.system }] },
      contents: [{ role: "user", parts: [{ text: o.user }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: o.maxTokens ?? 16000,
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
    throw friendly(res.status, (await res.text()).slice(0, 300));
  }

  for await (const data of sseLines(res)) {
    if (!data) continue;
    try {
      const json = JSON.parse(data);
      const parts = json.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (typeof part.text === "string" && part.text) yield part.text;
      }
    } catch {
      /* partial frame */
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
  const err = e as { status?: number; message?: string; name?: string };
  if (err?.name === "AbortError") return new ProviderError("ยกเลิกแล้ว", 499);
  if (typeof err?.status === "number") return friendly(err.status, err.message ?? "");
  return new ProviderError(err?.message || "เกิดข้อผิดพลาดที่ไม่รู้จัก", 500);
}
