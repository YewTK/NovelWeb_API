"use client";

import { useCallback, useRef, useState } from "react";
import { getChapter, saveChapter } from "./repo";
import { callWithRetry, isAbort, messageOf, type KeyRing } from "./translator";
import type {
  Chapter,
  Effort,
  OutlineChapter,
  OutlineCharacter,
  Series,
  StoryOutline,
  WritingProject,
} from "./types";
import {
  OUTLINE_BATCH,
  parseJsonObject,
  partsFor,
  proseToParagraphs,
} from "./write-prompt";

const ENDPOINT = "/api/write";

/* ------------------------------ outline plan ------------------------------ */

interface OutlineReply {
  title?: string;
  logline?: string;
  world?: string;
  characters?: Partial<OutlineCharacter>[];
  chapters?: Partial<OutlineChapter>[];
}

function cleanChapters(raw: Partial<OutlineChapter>[] | undefined, from: number, to: number) {
  const byN = new Map<number, OutlineChapter>();
  for (const c of raw ?? []) {
    const n = Number(c?.n);
    if (!Number.isInteger(n) || n < from || n > to || byN.has(n)) continue;
    byN.set(n, {
      n,
      title: String(c?.title ?? "").trim() || `ตอนที่ ${n}`,
      summary: String(c?.summary ?? "").trim(),
    });
  }
  return byN;
}

async function requestJson(opts: {
  ring: KeyRing;
  body: Record<string, unknown>;
  signal: AbortSignal;
  onChars?: (n: number) => void;
  onNotice?: (m: string | null) => void;
}): Promise<OutlineReply | null> {
  let raw = "";
  await callWithRetry({
    endpoint: ENDPOINT,
    ring: opts.ring,
    body: opts.body,
    signal: opts.signal,
    onDelta: (t) => {
      raw += t;
      opts.onChars?.(raw.length);
    },
    onReset: () => {
      raw = "";
    },
    onNotice: opts.onNotice,
  });
  return parseJsonObject<OutlineReply>(raw);
}

/**
 * Plans the novel in batches: the first request writes the story bible and the
 * opening chapters, later ones extend the chapter plan with the bible in hand.
 * `onBatch` fires after every batch so progress is saved as it lands.
 */
export async function planOutline(opts: {
  ring: KeyRing;
  title: string;
  project: WritingProject;
  effort: Effort;
  signal: AbortSignal;
  onBatch: (outline: StoryOutline, proposedTitle: string | null) => Promise<void> | void;
  onChars?: (chars: number, from: number, to: number) => void;
  onNotice?: (m: string | null) => void;
}): Promise<StoryOutline> {
  const total = opts.project.chapterCount;
  let outline = opts.project.outline;
  let proposedTitle: string | null = null;

  // Resume after whatever is already planned — lets a longer novel grow.
  let from = (outline?.chapters.reduce((m, c) => Math.max(m, c.n), 0) ?? 0) + 1;

  while (from <= total) {
    const to = Math.min(total, from + OUTLINE_BATCH - 1);
    let reply: OutlineReply | null = null;

    for (let attempt = 0; attempt < 2 && !reply?.chapters?.length; attempt++) {
      reply = await requestJson({
        ring: opts.ring,
        signal: opts.signal,
        body: {
          mode: "outline",
          title: opts.title,
          effort: opts.effort,
          project: { ...opts.project, outline },
          from,
          to,
        },
        onChars: (n) => opts.onChars?.(n, from, to),
        onNotice: opts.onNotice,
      });
    }
    if (!reply?.chapters?.length) {
      throw new Error("AI ตอบโครงเรื่องกลับมาในรูปแบบที่อ่านไม่ได้ ลองใหม่อีกครั้ง");
    }

    const planned = cleanChapters(reply.chapters, from, to);
    // A skipped chapter still gets a slot the author can fill in by hand.
    for (let n = from; n <= to; n++) {
      if (!planned.has(n)) planned.set(n, { n, title: `ตอนที่ ${n}`, summary: "" });
    }

    if (!outline) {
      outline = {
        logline: String(reply.logline ?? "").trim(),
        world: String(reply.world ?? "").trim(),
        characters: (reply.characters ?? [])
          .filter((c) => c?.name)
          .map((c) => ({
            name: String(c.name).trim(),
            role: String(c.role ?? "").trim(),
            profile: String(c.profile ?? "").trim(),
          })),
        chapters: [],
      };
      proposedTitle = String(reply.title ?? "").trim() || null;
    }
    outline = {
      ...outline,
      chapters: [...outline.chapters.filter((c) => c.n < from), ...[...planned.values()].sort((a, b) => a.n - b.n)],
    };

    await opts.onBatch(outline, proposedTitle);
    from = to + 1;
  }

  return outline!;
}

/* -------------------------------- chapters -------------------------------- */

/** Everything but the last ~2,400 characters is dead weight as continuity context. */
function tail(paragraphs: string[], max = 2400): string {
  const out: string[] = [];
  let n = 0;
  for (let i = paragraphs.length - 1; i >= 0 && n < max; i--) {
    out.unshift(paragraphs[i]);
    n += paragraphs[i].length;
  }
  return out.join("\n\n");
}

/**
 * Writes one chapter, in as many parts as its length needs. `onText` receives
 * the whole chapter so far on every delta.
 */
export async function writeChapterText(opts: {
  ring: KeyRing;
  title: string;
  project: WritingProject;
  effort: Effort;
  n: number;
  previousChapter: string[];
  signal: AbortSignal;
  onText: (paragraphs: string[], part: number, parts: number) => void;
  onNotice?: (m: string | null) => void;
}): Promise<string[]> {
  const parts = partsFor(opts.project.wordsPerChapter);
  let written = "";

  for (let part = 1; part <= parts; part++) {
    const before = written;
    const context = part === 1 ? tail(opts.previousChapter) : tail(proseToParagraphs(before));
    let piece = "";

    await callWithRetry({
      endpoint: ENDPOINT,
      ring: opts.ring,
      signal: opts.signal,
      body: {
        mode: "chapter",
        title: opts.title,
        effort: opts.effort,
        project: opts.project,
        n: opts.n,
        part,
        parts,
        previousText: context || undefined,
      },
      onDelta: (t) => {
        piece += t;
        written = before ? `${before}\n\n${piece}` : piece;
        opts.onText(proseToParagraphs(written), part, parts);
      },
      onReset: () => {
        piece = "";
        written = before;
      },
      onNotice: opts.onNotice,
    });
  }

  return proseToParagraphs(written);
}

export function chapterTitle(project: WritingProject, n: number): string {
  const plan = project.outline?.chapters.find((c) => c.n === n);
  const name = plan?.title?.trim();
  const label = project.language === "th" ? `ตอนที่ ${n}` : `Chapter ${n}`;
  return name && !name.startsWith(label) ? `${label}: ${name}` : name || label;
}

/* ---------------------------------- job ----------------------------------- */

export type WriterPhase = "idle" | "outline" | "writing";

export interface WriterState {
  phase: WriterPhase;
  seriesId: string | null;
  /** chapter number being written, or the last one planned */
  current: number | null;
  chapterId: string | null;
  /** chapters finished and still to go in this run */
  done: number;
  total: number;
  /** characters streamed for the current item */
  chars: number;
  part: number;
  parts: number;
  notice: string | null;
}

const IDLE: WriterState = {
  phase: "idle",
  seriesId: null,
  current: null,
  chapterId: null,
  done: 0,
  total: 0,
  chars: 0,
  part: 1,
  parts: 1,
  notice: null,
};

export interface WriterDeps {
  ring: () => KeyRing;
  effort: () => Effort;
  /** the freshest copy of a novel */
  getSeries: (id: string) => Series | null;
  updateSeries: (series: Series) => Promise<void>;
  /** a written chapter changed; `settled` once it is saved for good */
  onChapter: (chapter: Chapter, settled: boolean) => void;
  notify: (message: string, tone?: "info" | "error" | "success") => void;
}

/**
 * The studio's background job. It lives at the page level, so leaving the
 * studio to read a finished chapter never interrupts the one being written.
 */
export function useWriterJob(deps: WriterDeps) {
  const [state, setState] = useState<WriterState>(IDLE);
  const abortRef = useRef<AbortController | null>(null);
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const patch = useCallback((p: Partial<WriterState>) => setState((s) => ({ ...s, ...p })), []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  /** Plans (or extends) the outline of a novel whose project is already saved. */
  const plan = useCallback(
    async (seriesId: string): Promise<boolean> => {
      const d = depsRef.current;
      const series = d.getSeries(seriesId);
      const project = series?.info?.project;
      if (!series || !project || abortRef.current) return false;

      const controller = new AbortController();
      abortRef.current = controller;
      setState({ ...IDLE, phase: "outline", seriesId, total: project.chapterCount });

      try {
        await planOutline({
          ring: d.ring(),
          title: series.name,
          project,
          effort: d.effort(),
          signal: controller.signal,
          onChars: (chars, from, to) => patch({ chars, current: to, done: from - 1 }),
          onNotice: (notice) => patch({ notice }),
          onBatch: async (outline, proposed) => {
            const latest = depsRef.current.getSeries(seriesId) ?? series;
            const info = latest.info ?? {};
            const renamed = proposed && latest.name === UNTITLED ? proposed : latest.name;
            await depsRef.current.updateSeries({
              ...latest,
              name: renamed,
              info: { ...info, project: { ...(info.project ?? project), outline } },
            });
            patch({ done: outline.chapters.length, chars: 0 });
          },
        });
        d.notify("วางโครงเรื่องเสร็จแล้ว ตรวจแก้ได้ก่อนเริ่มเขียน", "success");
        return true;
      } catch (e) {
        if (isAbort(e) || controller.signal.aborted) d.notify("หยุดวางโครงเรื่องแล้ว");
        else d.notify(messageOf(e), "error");
        return false;
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setState(IDLE);
      }
    },
    [patch],
  );

  /** Writes the given chapters one after another, each knowing the last. */
  const write = useCallback(
    async (seriesId: string, numbers: number[]): Promise<void> => {
      const d = depsRef.current;
      if (abortRef.current || !numbers.length) return;
      const controller = new AbortController();
      abortRef.current = controller;
      const queue = [...new Set(numbers)].sort((a, b) => a - b);
      setState({ ...IDLE, phase: "writing", seriesId, total: queue.length });

      let finished = 0;
      try {
        for (const n of queue) {
          if (controller.signal.aborted) break;
          const series = depsRef.current.getSeries(seriesId);
          const project = series?.info?.project;
          if (!series || !project?.outline) throw new Error("ไม่พบโครงเรื่องของนิยายเรื่องนี้");

          const prevId = project.chapterIds[String(n - 1)];
          const prev = prevId ? await getChapter(prevId) : undefined;
          const existingId = project.chapterIds[String(n)];
          const existing = existingId ? await getChapter(existingId) : undefined;
          const now = Date.now();

          let chapter: Chapter = {
            id: existing?.id ?? crypto.randomUUID(),
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
            title: chapterTitle(project, n),
            translatedTitle: "",
            sourceUrl: null,
            siteName: "NovelFlow Studio",
            nextUrl: null,
            prevUrl: null,
            paragraphs: [],
            glossary: [],
            status: "translating",
            progress: 0,
            model: d.ring().config.model,
            targetLanguage: project.language,
            seriesId,
          };
          await saveChapter(chapter, true);
          if (!existing) {
            const info = series.info ?? {};
            await depsRef.current.updateSeries({
              ...series,
              info: {
                ...info,
                project: { ...project, chapterIds: { ...project.chapterIds, [String(n)]: chapter.id } },
              },
            });
          }
          depsRef.current.onChapter(chapter, true);
          patch({ current: n, chapterId: chapter.id, chars: 0, part: 1, parts: partsFor(project.wordsPerChapter) });

          let lastPaint = 0;
          let lastSave = Date.now();
          const expected = project.wordsPerChapter * (project.language === "th" ? 4 : 5.5);

          try {
            const paragraphs = await writeChapterText({
              ring: d.ring(),
              title: series.name,
              project,
              effort: d.effort(),
              n,
              previousChapter: prev?.paragraphs.map((p) => p.target) ?? [],
              signal: controller.signal,
              onNotice: (notice) => patch({ notice }),
              onText: (paras, part, parts) => {
                const t = Date.now();
                if (t - lastPaint < 220) return;
                lastPaint = t;
                const chars = paras.reduce((s, p) => s + p.length, 0);
                chapter = {
                  ...chapter,
                  paragraphs: paras.map((text, id) => ({ id, source: "", target: text })),
                  progress: Math.min(0.99, chars / expected),
                  updatedAt: t,
                };
                patch({ chars, part, parts });
                depsRef.current.onChapter(chapter, false);
                if (t - lastSave > 4000) {
                  lastSave = t;
                  void saveChapter(chapter);
                }
              },
            });
            chapter = {
              ...chapter,
              paragraphs: paragraphs.map((text, id) => ({ id, source: "", target: text })),
              status: "done",
              progress: 1,
              updatedAt: Date.now(),
            };
            await saveChapter(chapter, true);
            depsRef.current.onChapter(chapter, true);
            finished += 1;
            patch({ done: finished });
          } catch (e) {
            // Keep whatever was written; the author can rewrite or continue it.
            chapter = { ...chapter, status: controller.signal.aborted ? "draft" : "error", updatedAt: Date.now() };
            await saveChapter(chapter, true);
            depsRef.current.onChapter(chapter, true);
            throw e;
          }
        }

        if (finished) {
          d.notify(
            finished === 1 ? "เขียนเสร็จแล้ว 1 ตอน" : `เขียนเสร็จแล้ว ${finished} ตอน`,
            "success",
          );
        }
      } catch (e) {
        if (isAbort(e) || controller.signal.aborted) {
          d.notify(finished ? `หยุดเขียนแล้ว (เสร็จ ${finished} ตอน)` : "หยุดเขียนแล้ว");
        } else {
          d.notify(messageOf(e), "error");
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setState(IDLE);
      }
    },
    [patch],
  );

  return { state, plan, write, stop };
}

/** Placeholder name for a novel whose title the AI is asked to propose. */
export const UNTITLED = "นิยายเรื่องใหม่";

export function blankProject(): WritingProject {
  return {
    synopsis: "",
    blurb: "",
    tags: [],
    styleId: "shadow-slave",
    styleNotes: "",
    chapterCount: 20,
    wordsPerChapter: 2200,
    pov: "third-limited",
    language: "th",
    outline: null,
    chapterIds: {},
    createdAt: Date.now(),
  };
}

/** Chapters planned but not yet written, in order. */
export function unwrittenChapters(project: WritingProject): number[] {
  return (project.outline?.chapters ?? [])
    .map((c) => c.n)
    .filter((n) => n <= project.chapterCount && !project.chapterIds[String(n)]);
}
