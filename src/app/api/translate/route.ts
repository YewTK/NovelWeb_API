import { streamText, toProviderError } from "@/lib/ai";
import { buildGlossaryPrompt, buildSystemPrompt, buildUserMessage } from "@/lib/prompt";
import type { GlossaryEntry, ProviderConfig, StyleSettings } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Body {
  mode: "translate" | "glossary";
  config: ProviderConfig;
  style: StyleSettings;
  glossary: GlossaryEntry[];
  title?: string;
  paragraphs: { id: number; text: string }[];
  previousSource?: string;
  previousTarget?: string;
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
    return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 400 });
  }

  if (!body.config?.apiKey) {
    return Response.json({ error: "ยังไม่ได้ตั้งค่า API Key" }, { status: 401 });
  }
  if (!body.paragraphs?.length) {
    return Response.json({ error: "ไม่มีเนื้อหาให้แปล" }, { status: 400 });
  }

  const isGlossary = body.mode === "glossary";

  const system = isGlossary
    ? buildGlossaryPrompt(body.style.targetLanguage, body.glossary ?? [])
    : buildSystemPrompt(body.style, body.glossary ?? []);

  const user = isGlossary
    ? `Chapter title: ${body.title ?? "(untitled)"}\n\nExcerpt:\n${body.paragraphs
        .map((p) => p.text)
        .join("\n\n")
        .slice(0, 6000)}`
    : buildUserMessage({
        paragraphs: body.paragraphs,
        previousSource: body.previousSource,
        previousTarget: body.previousTarget,
        title: body.title,
      });

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
          maxTokens: isGlossary ? 4000 : 16000,
          signal: abort.signal,
        })) {
          controller.enqueue(sse("delta", delta));
        }
        controller.enqueue(sse("done", { ok: true }));
      } catch (e) {
        const err = toProviderError(e);
        controller.enqueue(sse("error", { message: err.message, status: err.status }));
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
