import { streamText, toProviderError } from "@/lib/ai";
import {
  MAX_CHAPTERS,
  OUTLINE_BATCH,
  buildChapterSystem,
  buildChapterUser,
  buildOutlineSystem,
  buildOutlineUser,
} from "@/lib/write-prompt";
import type { Effort, ProviderConfig, WritingProject } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Body {
  mode: "outline" | "chapter";
  config: ProviderConfig;
  effort?: Effort;
  title: string;
  project: WritingProject;
  /** outline: the chapter range to plan */
  from?: number;
  to?: number;
  /** chapter: which one, and which part of it */
  n?: number;
  part?: number;
  parts?: number;
  previousText?: string;
}

function sse(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function bad(message: string, status = 400) {
  return Response.json({ error: message, status }, { status });
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return bad("คำขอไม่ถูกต้อง");
  }

  if (!body.config?.apiKey) return bad("ยังไม่ได้ตั้งค่า API Key", 401);
  if (!body.project) return bad("ไม่มีข้อมูลโปรเจกต์");

  const project = {
    ...body.project,
    chapterCount: Math.max(1, Math.min(MAX_CHAPTERS, Math.round(body.project.chapterCount || 1))),
  };
  const isOutline = body.mode === "outline";
  let system: string;
  let user: string;
  let maxTokens: number;

  if (isOutline) {
    const from = Math.max(1, body.from ?? 1);
    const to = Math.max(from, Math.min(project.chapterCount, body.to ?? from, from + OUTLINE_BATCH * 2 - 1));
    system = buildOutlineSystem(body.title, project);
    user = buildOutlineUser({ from, to, total: project.chapterCount, existing: project.outline });
    // Thai costs roughly a token per character; each planned chapter is a few sentences.
    const thai = project.language === "th";
    const perChapter = thai ? 260 : 130;
    // The opening request also writes the bible and the whole-book roadmap.
    const arcs = Math.min(40, Math.max(3, Math.round(project.chapterCount / 80)));
    const opening = project.outline ? 0 : 3500 + arcs * (thai ? 200 : 100);
    maxTokens = Math.min(32000, 3000 + (to - from + 1) * perChapter + opening);
  } else {
    if (!project.outline) return bad("ยังไม่มีโครงเรื่อง");
    const n = body.n ?? 1;
    const parts = Math.max(1, body.parts ?? 1);
    const part = Math.min(parts, Math.max(1, body.part ?? 1));
    system = buildChapterSystem(body.title, project);
    user = buildChapterUser({ project, n, part, parts, previousText: body.previousText?.slice(-2600) });
    const words = project.wordsPerChapter / parts;
    const perWord = project.language === "th" ? 4.4 : 1.5;
    maxTokens = Math.min(24000, Math.ceil(words * perWord * 1.35) + 1200);
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const abort = new AbortController();
      req.signal.addEventListener("abort", () => abort.abort());

      try {
        for await (const delta of streamText({
          config: body.config,
          system,
          user,
          effort: isOutline ? "medium" : (body.effort ?? "medium"),
          maxTokens,
          // Plans want structure; prose wants room to breathe.
          temperature: isOutline ? 0.7 : 0.9,
          // The chapter system prompt carries the whole bible and repeats for
          // every part of every chapter — exactly what caching is for.
          cacheSystem: !isOutline,
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
