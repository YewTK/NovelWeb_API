import { streamText, toProviderError } from "@/lib/ai";
import { sampleChapter } from "@/lib/chunk";
import { buildGlossaryPrompt, buildSystemPrompt, buildUserMessage } from "@/lib/prompt";
import type { BookInfo, GlossaryEntry, ProviderConfig, StyleSettings } from "@/lib/types";
import { estimateTokens } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Body {
  mode: "translate" | "glossary";
  config: ProviderConfig;
  style: StyleSettings;
  glossary: GlossaryEntry[];
  book?: { name?: string; info?: BookInfo };
  title?: string;
  paragraphs: { id: number; text: string }[];
  previousSource?: string;
  previousTarget?: string;
  styleSample?: string;
}

function sse(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
  );
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "คำขอไม่ถูกต้อง", status: 400 }, { status: 400 });
  }

  if (!body.config?.apiKey) {
    return Response.json({ error: "ยังไม่ได้ตั้งค่า API Key", status: 401 }, { status: 401 });
  }
  if (!body.paragraphs?.length) {
    return Response.json({ error: "ไม่มีเนื้อหาให้แปล", status: 400 }, { status: 400 });
  }

  const isGlossary = body.mode === "glossary";

  const system = isGlossary
    ? buildGlossaryPrompt(body.style.targetLanguage, body.glossary ?? [], body.book)
    : buildSystemPrompt(body.style, body.glossary ?? [], body.book);

  const user = isGlossary
    ? [
        `Chapter title: ${body.title ?? "(untitled)"}`,
        "",
        "Excerpt (sampled across the whole chapter):",
        sampleChapter(body.paragraphs.map((p) => p.text)),
      ].join("\n")
    : buildUserMessage({
        paragraphs: body.paragraphs,
        previousSource: body.previousSource,
        previousTarget: body.previousTarget,
        styleSample: body.styleSample,
        title: body.title,
      });

  // Thai and most other target scripts cost more tokens than the source, so
  // allow a generous multiple of the input instead of always the maximum.
  const sourceTokens = body.paragraphs.reduce((n, p) => n + estimateTokens(p.text), 0);
  const maxTokens = isGlossary
    ? 6000
    : Math.min(16000, Math.max(2500, Math.ceil(sourceTokens * 2.6) + 1500));

  // Faithful work wants the cooler end; literary prose needs a little room.
  const temperature = isGlossary
    ? 0
    : body.style.tone === "literary" || body.style.tone === "casual"
      ? 0.5
      : 0.3;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const abort = new AbortController();
      req.signal.addEventListener("abort", () => abort.abort());

      try {
        for await (const delta of streamText({
          config: body.config,
          system,
          user,
          effort: isGlossary ? "low" : body.style.effort,
          maxTokens,
          temperature,
          // Every chunk of a chapter repeats this exact system prompt,
          // glossary and book notes included — well worth caching.
          cacheSystem: !isGlossary,
          signal: abort.signal,
        })) {
          controller.enqueue(sse("delta", delta));
        }
        controller.enqueue(sse("done", { ok: true }));
      } catch (e) {
        const err = toProviderError(e);
        controller.enqueue(
          sse("error", {
            message: err.message,
            status: err.status,
            retryAfterMs: err.retryAfterMs,
            quota: err.quota,
          }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
