"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookMarked, Loader2, Settings2, StopCircle, UserRound } from "lucide-react";
import { Composer } from "@/components/Composer";
import {
  Bookshelf,
  ShelfSheet,
  buildShelves,
  type Shelf,
} from "@/components/Bookshelf";
import type { ShelfOption } from "@/components/ShelfPicker";
import { AuthGate } from "@/components/AuthGate";
import { PdfImport, type PdfImportResult } from "@/components/PdfImport";
import { Reader } from "@/components/Reader";
import {
  ReaderDock,
  ReaderHeader,
  ReaderToolsSheet,
  useReaderScroll,
} from "@/components/ReaderChrome";
import { SettingsSheet } from "@/components/SettingsSheet";
import {
  AccountSheet,
  GlossarySheet,
  LibrarySheet,
  TypographySheet,
  useCloudState,
} from "@/components/Panels";
import { Button, ConfirmDialog, ToastStack, useToasts } from "@/components/ui";
import { buildChunks, splitPastedText } from "@/lib/chunk";
import { estimateJob, formatUsd, type Estimate } from "@/lib/cost";
import {
  deleteChapter as repoDelete,
  ensureSeries,
  getChapter,
  getSeriesById,
  initCloud,
  listChapters,
  consumeAdoptionNotice,
  deleteShelf,
  listSeries,
  mergeIntoSeries,
  pullChapters,
  pullSeries,
  saveChapter,
  saveSeries,
} from "@/lib/repo";
import { deriveSeries } from "@/lib/series";
import { cleanGlossary, mergeGlossary } from "@/lib/glossary";
import { useSettings } from "@/lib/store";
import {
  clearCurrent,
  forgetChapter,
  loadReading,
  openChapterMark,
  progressMark,
  saveReading,
  type ReadingState,
} from "@/lib/reading";
import { runGlossaryPass, runTranslation } from "@/lib/translator";
import type {
  Chapter,
  ExtractResult,
  GlossaryEntry,
  Series,
} from "@/lib/types";
import { cn, normalizeUrl } from "@/lib/utils";

type Phase = "idle" | "extracting" | "preparing" | "translating";

/** Stops an auto-follow chain from quietly spending a whole API budget. */
const AUTO_NEXT_LIMIT = 50;

interface QueueItem {
  id: string;
  title: string;
  opts?: { skipDone?: boolean; skipGlossary?: boolean };
}

const PHASE_LABEL: Record<Phase, string> = {
  idle: "",
  extracting: "กำลังดึงเนื้อหา…",
  preparing: "กำลังจับคำศัพท์…",
  translating: "กำลังแปล…",
};

export default function Page() {
  const { config, style, reader, theme, setReader, autoNext } = useSettings();
  const { toasts, push } = useToasts();
  const cloud = useCloudState();

  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [library, setLibrary] = useState<Chapter[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [mounted, setMounted] = useState(false);
  /** Identifies the running translation so the UI can report it from anywhere. */
  const [job, setJob] = useState<{ id: string; title: string } | null>(null);
  /** Chapters waiting their turn; they are translated one at a time, in order. */
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [showPdf, setShowPdf] = useState(false);
  /** Which chapters have been read, and where the reader left off. */
  const [reading, setReading] = useState<ReadingState>({ marks: {}, current: null });

  const [showSettings, setShowSettings] = useState(false);
  const [showType, setShowType] = useState(false);
  const [showGlossary, setShowGlossary] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [confirm, setConfirm] = useState<{ draft: Chapter; estimate: Estimate } | null>(
    null,
  );

  const [series, setSeries] = useState<Series | null>(null);
  const [allSeries, setAllSeries] = useState<Series[]>([]);
  const [openShelf, setOpenShelf] = useState<Shelf | null>(null);
  const [glossarySeries, setGlossarySeries] = useState<Series | null>(null);
  /** Shelf the reader pinned by hand; "" lets the link decide. */
  const [shelfId, setShelfId] = useState("");

  const chapterRef = useRef<Chapter | null>(null);
  /** The chapter currently being translated — not necessarily the one on screen. */
  const jobRef = useRef<Chapter | null>(null);
  const seriesRef = useRef<Series | null>(null);
  const glossaryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const buffered = useRef(new Map<number, string>());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueRef = useRef<QueueItem[]>([]);
  const runningRef = useRef(false);
  /** Breaks the translate -> start -> queue -> translate dependency cycle. */
  const continueRef = useRef<((url: string, seriesId: string) => void) | null>(null);
  const autoChainRef = useRef(0);
  const readingRef = useRef<ReadingState>({ marks: {}, current: null });
  const readingSave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restored = useRef(false);

  chapterRef.current = chapter;
  const busy = phase !== "idle";
  /** True only when the chapter on screen is the one being translated. */
  const viewingJob = Boolean(chapter && job && chapter.id === job.id);
  const chrome = useReaderScroll(viewingJob);

  /* ------------------------------- bootstrap ------------------------------ */

  const refreshShelves = useCallback(async () => {
    const [chapters, novels] = await Promise.all([listChapters(), listSeries()]);
    setLibrary(chapters);
    setAllSeries(novels);
  }, []);

  /** Writes reading marks through to the device, coalescing rapid scrolls. */
  const commitReading = useCallback((next: ReadingState, immediate = false) => {
    readingRef.current = next;
    setReading(next);
    if (readingSave.current) clearTimeout(readingSave.current);
    if (immediate) {
      void saveReading(next);
      return;
    }
    readingSave.current = setTimeout(() => {
      void saveReading(readingRef.current);
    }, 700);
  }, []);

  /** Pulls this reader's library down and shows what was inherited, if anything. */
  const loadLibrary = useCallback(async () => {
    await refreshShelves();
    await pullChapters();
    await pullSeries();
    await refreshShelves();

    const saved = await loadReading();
    readingRef.current = saved;
    setReading(saved);

    const adopted = consumeAdoptionNotice();
    if (adopted > 0) {
      push(`ย้ายชั้นหนังสือเดิมเข้าบัญชีนี้แล้ว ${adopted} ตอน`, "success");
    }

    // Drop the reader back where they were rather than at the front door.
    if (!restored.current && saved.current) {
      restored.current = true;
      const resume = await getChapter(saved.current);
      if (resume) {
        seriesRef.current = resume.seriesId
          ? ((await getSeriesById(resume.seriesId)) ?? null)
          : null;
        setSeries(seriesRef.current);
        setChapter(resume);
        setProgress(resume.progress);
      }
    }
  }, [refreshShelves, push]);

  useEffect(() => {
    setMounted(true);
    void (async () => {
      await initCloud();
      await loadLibrary();
    })();
    // loadLibrary is stable for the lifetime of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  /**
   * Asks the device to stay awake while a chapter is being translated. A phone
   * that sleeps suspends the page and stalls the stream; this keeps a job alive
   * while the reader does something else. Browsers drop the lock whenever the
   * tab is hidden, so it is taken again on every return to the foreground.
   */
  useEffect(() => {
    if (!busy) return;

    type Sentinel = { release: () => Promise<void> };
    const api = (
      navigator as unknown as {
        wakeLock?: { request: (t: "screen") => Promise<Sentinel> };
      }
    ).wakeLock;
    if (!api) return;

    let sentinel: Sentinel | null = null;
    let dropped = false;

    const acquire = async () => {
      if (dropped || document.visibilityState !== "visible") return;
      try {
        sentinel = await api.request("screen");
      } catch {
        /* denied, unsupported, or the tab lost focus mid-request */
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      dropped = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => undefined);
    };
  }, [busy]);


  /* ---------------------------- streaming writes -------------------------- */

  /**
   * Folds buffered paragraphs into the job's chapter, and mirrors them onto the
   * screen only when the reader happens to be looking at that same chapter.
   */
  const flush = useCallback(() => {
    if (flushTimer.current !== null) {
      clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
    const updates = buffered.current;
    if (!updates.size) return;
    buffered.current = new Map();

    const current = jobRef.current;
    if (!current) return;

    const next: Chapter = {
      ...current,
      paragraphs: current.paragraphs.map((p) =>
        updates.has(p.id) ? { ...p, target: updates.get(p.id)! } : p,
      ),
      updatedAt: Date.now(),
    };
    jobRef.current = next;
    setChapter((prev) => (prev && prev.id === next.id ? next : prev));
  }, []);

  /**
   * A timer rather than requestAnimationFrame: rAF stops firing entirely once
   * the tab is hidden, which would strand every streamed paragraph in the
   * buffer until the reader came back.
   */
  const schedule = useCallback(() => {
    if (flushTimer.current !== null) return;
    flushTimer.current = setTimeout(flush, 90);
  }, [flush]);

  const persist = useCallback((next: Chapter, immediate = false) => {
    jobRef.current = next;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (immediate) {
      void saveChapter(next, true).then(() => void refreshShelves());
      return;
    }
    saveTimer.current = setTimeout(() => {
      void saveChapter(jobRef.current ?? next);
    }, 1800);
  }, [refreshShelves]);

  /**
   * Records how far down the open chapter the reader has got. Past the
   * threshold in reading.ts the chapter flips to "read" on its own, the way a
   * novel site ticks one off once you reach the bottom.
   */
  useEffect(() => {
    const id = chapter?.id;
    if (!id) return;
    commitReading(progressMark(readingRef.current, id, chrome.progress));
  }, [chapter?.id, chrome.progress, commitReading]);

  /**
   * Leaving the tab must not strand half-streamed paragraphs in the buffer, and
   * must not lose them if the browser discards the page while it is away.
   */
  useEffect(() => {
    const settle = () => {
      flush();
      const current = jobRef.current;
      if (current) void saveChapter(current, true);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") settle();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", settle);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", settle);
    };
  }, [flush]);

  /** The glossary belongs to the novel, not the chapter - persist it there. */
  const persistSeriesGlossary = useCallback(
    async (glossary: GlossaryEntry[]) => {
      const current = seriesRef.current;
      if (!current) return;
      const next = { ...current, glossary };
      seriesRef.current = next;
      setSeries(next);
      setAllSeries((list) =>
        list.map((n) => (n.id === next.id ? next : n)),
      );
      setGlossarySeries((g) => (g && g.id === next.id ? next : g));
      await saveSeries(next);
    },
    [],
  );

  /* ------------------------------- pipeline ------------------------------- */

  const translate = useCallback(
    async (
      target: Chapter,
      opts: { skipDone?: boolean; skipGlossary?: boolean } = {},
    ) => {
      const controller = new AbortController();
      abortRef.current = controller;

      let working = { ...target, status: "translating" as const };
      jobRef.current = working;
      setJob({ id: working.id, title: working.translatedTitle || working.title });
      // Mirror onto the screen only if this is the chapter being read.
      setChapter((prev) => (prev && prev.id === working.id ? working : prev));
      persist(working, true);

      // 1. Glossary pass — locks names before any prose is written. It runs on
      //    every new chapter so characters introduced later join the same
      //    novel-wide glossary instead of being renamed each time.
      if (!opts.skipGlossary) {
        setPhase("preparing");
        try {
          const known = seriesRef.current?.glossary ?? working.glossary;
          const result = await runGlossaryPass({
            config,
            style,
            title: working.title,
            paragraphs: working.paragraphs.map((p) => p.source),
            known,
            signal: controller.signal,
          });
          if (result) {
            const merged = mergeGlossary(known, result.terms);
            working = {
              ...working,
              glossary: merged,
              translatedTitle: result.title || working.translatedTitle,
            };
            setChapter((prev) => (prev && prev.id === working.id ? working : prev));
            setJob({
              id: working.id,
              title: working.translatedTitle || working.title,
            });
            persist(working, true);
            await persistSeriesGlossary(merged);
          }
        } catch (e) {
          setPhase("idle");
          setJob(null);
          const message = e instanceof Error ? e.message : "เตรียมคำศัพท์ไม่สำเร็จ";
          push(message, "error");
          const failed = { ...working, status: "error" as const };
          setChapter((prev) => (prev && prev.id === failed.id ? failed : prev));
          persist(failed, true);
          if (/API Key/.test(message)) setShowSettings(true);
          return;
        }
      }

      // 2. Streamed translation, chunk by chunk.
      setPhase("translating");
      setProgress(0);

      const skip = opts.skipDone
        ? new Set(
            working.paragraphs.filter((p) => p.target).map((p) => p.id),
          )
        : undefined;

      let failure: string | null = null;

      await runTranslation({
        config,
        style,
        glossary: working.glossary,
        title: working.title,
        paragraphs: working.paragraphs.map((p) => p.source),
        skip,
        signal: controller.signal,
        onParagraph: (id, text) => {
          buffered.current.set(id, text);
          schedule();
        },
        onChunkDone: (done, total) => {
          const ratio = total ? done / total : 1;
          setProgress(ratio);
          const current = jobRef.current;
          if (current) persist({ ...current, progress: ratio });
        },
        onError: (message) => {
          failure = message;
        },
      });

      flush();
      setPhase("idle");
      setJob(null);
      abortRef.current = null;

      const finished = jobRef.current ?? working;
      const done = finished.paragraphs.every((p) => p.target);
      const final: Chapter = {
        ...finished,
        status: failure ? "error" : done ? "done" : "draft",
        progress: 1,
        updatedAt: Date.now(),
      };
      setChapter((prev) => (prev && prev.id === final.id ? final : prev));
      persist(final, true);
      jobRef.current = null;

      if (failure) {
        push(failure, "error");
        if (/API Key/.test(failure)) setShowSettings(true);
      } else if (controller.signal.aborted) {
        push("หยุดแปลแล้ว");
      } else {
        push(`แปลเสร็จแล้ว — ${final.translatedTitle || final.title}`, "success");

        // Walk on to the next chapter on the source site, if asked to.
        if (autoNext && final.nextUrl) {
          if (autoChainRef.current < AUTO_NEXT_LIMIT) {
            autoChainRef.current += 1;
            continueRef.current?.(final.nextUrl, final.seriesId);
          } else {
            push(
              `ดึงตอนถัดไปอัตโนมัติครบ ${AUTO_NEXT_LIMIT} ตอนแล้ว หยุดไว้ก่อน`,
              "info",
            );
          }
        }
      }
    },
    [config, style, persist, push, schedule, flush, persistSeriesGlossary, autoNext],
  );

  /**
   * Works through the queue one chapter at a time. Sequential on purpose: each
   * chapter feeds new terms into the novel's glossary, and the next chapter
   * should be translated knowing them.
   */
  const pump = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;

    try {
      while (queueRef.current.length) {
        const next = queueRef.current[0];
        queueRef.current = queueRef.current.slice(1);
        setQueue([...queueRef.current]);

        const target = await getChapter(next.id);
        if (!target) continue;

        const novel = target.seriesId
          ? await getSeriesById(target.seriesId)
          : undefined;
        seriesRef.current = novel ?? null;
        setSeries(novel ?? null);

        await translate(target, next.opts);
      }
    } finally {
      runningRef.current = false;
    }
  }, [translate]);

  const enqueue = useCallback(
    (items: QueueItem[]) => {
      if (!items.length) return;
      queueRef.current = [...queueRef.current, ...items];
      setQueue([...queueRef.current]);
      void pump();
    },
    [pump],
  );

  const start = useCallback(
    async (input: string, kind: "url" | "text", pinnedSeriesId?: string) => {
      if (!config.apiKey) {
        setShowSettings(true);
        push("ใส่ API Key ก่อนเริ่มแปล", "error");
        return;
      }

      setPhase("extracting");
      setProgress(0);

      let source: Pick<
        ExtractResult,
        "title" | "siteName" | "paragraphs" | "nextUrl" | "prevUrl" | "url"
      >;

      if (kind === "url") {
        try {
          const res = await fetch("/api/extract", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ url: normalizeUrl(input) }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error ?? "ดึงเนื้อหาไม่สำเร็จ");
          source = json as ExtractResult;
        } catch (e) {
          setPhase("idle");
          push(e instanceof Error ? e.message : "ดึงเนื้อหาไม่สำเร็จ", "error");
          return;
        }
      } else {
        const split = splitPastedText(input);
        source = {
          title: split.title,
          siteName: null,
          paragraphs: split.paragraphs,
          nextUrl: null,
          prevUrl: null,
          url: "",
        };
      }

      if (!source.paragraphs.length) {
        setPhase("idle");
        push("ไม่พบเนื้อหาให้แปล", "error");
        return;
      }

      // Group this chapter with the rest of its novel and inherit its glossary.
      // A shelf the reader picked wins over the one derived from the link —
      // that is the only way the same novel read on two sites lands together.
      const pinned = pinnedSeriesId ?? shelfId;
      const novel =
        (pinned ? await getSeriesById(pinned) : undefined) ??
        (await ensureSeries(deriveSeries(source.title, source.url || null)));
      seriesRef.current = novel;
      setSeries(novel);
      setAllSeries((list) =>
        list.some((n) => n.id === novel.id) ? list : [...list, novel],
      );

      const draft: Chapter = {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        title: source.title,
        translatedTitle: "",
        sourceUrl: source.url || null,
        siteName: source.siteName,
        nextUrl: source.nextUrl,
        prevUrl: source.prevUrl,
        paragraphs: source.paragraphs.map((text, id) => ({
          id,
          source: text,
          target: "",
        })),
        glossary: novel.glossary,
        status: "translating",
        progress: 0,
        model: config.model,
        targetLanguage: style.targetLanguage,
        seriesId: novel.id,
      };

      // Long pages cost real money — show the bill before spending it.
      const estimate = estimateJob(
        source.paragraphs,
        buildChunks(source.paragraphs).length,
        config,
      );
      if (estimate.sourceTokens > 9000) {
        setPhase("idle");
        setConfirm({ draft, estimate });
        return;
      }

      await saveChapter(draft, true);
      await refreshShelves();
      setPhase("idle");
      enqueue([{ id: draft.id, title: draft.title }]);
    },
    [config, style, push, shelfId, enqueue, refreshShelves],
  );

  useEffect(() => {
    continueRef.current = (url, seriesId) => void start(url, "url", seriesId);
  }, [start]);

  /** Stops the chapter in flight and drops whatever was still waiting. */
  const stop = () => {
    autoChainRef.current = 0;
    const waiting = queueRef.current.length;
    queueRef.current = [];
    setQueue([]);
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase("idle");
    if (waiting > 0) push(`ยกเลิกคิวที่เหลืออีก ${waiting} ตอนแล้ว`);
  };

  /** Saves a draft then puts it in line to be translated. */
  const queueDraft = async (draft: Chapter) => {
    await saveChapter(draft, true);
    await refreshShelves();
    enqueue([{ id: draft.id, title: draft.title }]);
  };

  const openChapter = async (id: string) => {
    const found = await getChapter(id);
    if (found) {
      const novel = found.seriesId
        ? await getSeriesById(found.seriesId)
        : undefined;
      seriesRef.current = novel ?? null;
      setSeries(novel ?? null);
      setChapter(found);
      setProgress(found.progress);
      commitReading(openChapterMark(readingRef.current, id), true);
      window.scrollTo({ top: 0 });
    }
  };

  /** Leaves the reader; the chapter stops counting as the one in progress. */
  const closeChapter = () => {
    commitReading(clearCurrent(readingRef.current), true);
    setChapter(null);
  };

  const removeChapter = async (id: string) => {
    await repoDelete(id);
    commitReading(forgetChapter(readingRef.current, id), true);
    await refreshShelves();
    setOpenShelf((shelf) =>
      shelf
        ? { ...shelf, chapters: shelf.chapters.filter((c) => c.id !== id) }
        : shelf,
    );
    if (chapterRef.current?.id === id) setChapter(null);
  };

  const openGlossaryFor = (novel: Series | null) => {
    if (!novel) {
      push("ตอนนี้ยังไม่ได้ผูกกับเรื่องไหน", "error");
      return;
    }
    // Only one sheet at a time — stacked sheets would hide this one.
    setOpenShelf(null);
    setGlossarySeries(novel);
    setShowGlossary(true);
  };

  /** Edits land on the novel, then cascade to whatever is on screen. */
  const setGlossary = (next: GlossaryEntry[]) => {
    const target = glossarySeries;
    if (!target) return;
    const updated = { ...target, glossary: next };

    setGlossarySeries(updated);
    setAllSeries((list) => list.map((n) => (n.id === target.id ? updated : n)));
    if (seriesRef.current?.id === target.id) {
      seriesRef.current = updated;
      setSeries(updated);
    }
    setChapter((prev) =>
      prev && prev.seriesId === target.id ? { ...prev, glossary: next } : prev,
    );

    if (glossaryTimer.current) clearTimeout(glossaryTimer.current);
    glossaryTimer.current = setTimeout(() => {
      void saveSeries({ ...updated, glossary: cleanGlossary(next) });
    }, 900);
  };

  const retranslate = () => {
    const current = chapterRef.current;
    if (!current) return;
    const cleared: Chapter = {
      ...current,
      paragraphs: current.paragraphs.map((p) => ({ ...p, target: "" })),
    };
    void translate(cleared, { skipGlossary: true });
  };

  const fillGaps = () => {
    const current = chapterRef.current;
    if (!current) return;
    void translate(current, { skipDone: true, skipGlossary: true });
  };

  const plainText = (c: Chapter) =>
    [c.translatedTitle || c.title, "", ...c.paragraphs.map((p) => p.target)].join("\n\n");

  const copyAll = async () => {
    if (!chapter) return;
    try {
      await navigator.clipboard.writeText(plainText(chapter));
      push("คัดลอกคำแปลแล้ว", "success");
    } catch {
      push("คัดลอกไม่สำเร็จ", "error");
    }
  };

  const download = () => {
    if (!chapter) return;
    const blob = new Blob([plainText(chapter)], {
      type: "text/plain;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(chapter.translatedTitle || chapter.title).slice(0, 60)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /**
   * Turns the chapters detected in a PDF into real draft chapters on a shelf,
   * then queues every one of them.
   */
  const importPdf = async (result: PdfImportResult) => {
    if (!config.apiKey) {
      setShowSettings(true);
      push("ใส่ API Key ก่อนเริ่มแปล", "error");
      return;
    }

    const novel = result.seriesId
      ? await getSeriesById(result.seriesId)
      : undefined;
    const shelf =
      novel ?? (await ensureSeries(deriveSeries(result.bookName, null)));

    seriesRef.current = shelf;
    setSeries(shelf);

    const now = Date.now();
    const drafts: Chapter[] = result.chapters.map((c, i) => ({
      id: crypto.randomUUID(),
      // Keep the book's own order — these have no timestamps of their own.
      createdAt: now + i,
      updatedAt: now + i,
      title: c.title,
      translatedTitle: "",
      sourceUrl: null,
      siteName: result.bookName,
      nextUrl: null,
      prevUrl: null,
      paragraphs: c.paragraphs.map((text, id) => ({ id, source: text, target: "" })),
      glossary: shelf.glossary,
      status: "draft",
      progress: 0,
      model: config.model,
      targetLanguage: style.targetLanguage,
      seriesId: shelf.id,
    }));

    for (const draft of drafts) await saveChapter(draft, true);
    await refreshShelves();

    enqueue(drafts.map((d) => ({ id: d.id, title: d.title })));
    push(`เพิ่ม ${drafts.length} ตอนเข้าคิวแปลแล้ว`, "success");
  };

  /** Deletes a whole novel, its chapters and its glossary. */
  const removeShelf = async (target: Shelf) => {
    const ids = target.chapters.map((c) => c.id);

    // Nothing from this shelf should stay queued or on screen afterwards.
    queueRef.current = queueRef.current.filter((q) => !ids.includes(q.id));
    setQueue([...queueRef.current]);
    if (chapterRef.current && ids.includes(chapterRef.current.id)) {
      setChapter(null);
    }

    await deleteShelf(target.series.id, ids);

    let marks = readingRef.current;
    for (const id of ids) marks = forgetChapter(marks, id);
    commitReading(marks, true);

    if (shelfId === target.series.id) setShelfId("");
    if (seriesRef.current?.id === target.series.id) {
      seriesRef.current = null;
      setSeries(null);
    }
    setOpenShelf(null);
    await refreshShelves();
    push(`ลบ “${target.series.name}” แล้ว`, "success");
  };

  /** Folds one shelf into another — the repair for a novel that split in two. */
  const mergeShelf = async (from: Shelf, targetId: string) => {
    const merged = await mergeIntoSeries(
      { seriesId: from.series.id, chapterIds: from.chapters.map((c) => c.id) },
      targetId,
    );
    if (!merged) {
      push("รวมชั้นหนังสือไม่สำเร็จ", "error");
      return;
    }

    setOpenShelf(null);
    setShelfId((id) => (id === from.series.id ? targetId : id));
    setGlossarySeries((g) => (g && g.id === merged.id ? merged : g));
    if (seriesRef.current?.id === from.series.id || seriesRef.current?.id === targetId) {
      seriesRef.current = merged;
      setSeries(merged);
    }
    setChapter((prev) =>
      prev && prev.seriesId === from.series.id
        ? { ...prev, seriesId: targetId }
        : prev,
    );

    await refreshShelves();
    push(`รวมเข้าชั้น “${merged.name}” แล้ว`, "success");
  };

  const missing = chapter?.paragraphs.filter((p) => !p.target).length ?? 0;
  const shelves = buildShelves(allSeries, library);

  // Neighbours within the same novel, in reading order, so the reader can walk
  // a shelf the way a novel site lets you walk a table of contents.
  const siblings = (() => {
    if (!chapter) return { prev: null as Chapter | null, next: null as Chapter | null };
    const list =
      shelves.find((sh) => sh.series.id === chapter.seriesId)?.chapters ?? [];
    const at = list.findIndex((c) => c.id === chapter.id);
    if (at === -1) return { prev: null as Chapter | null, next: null as Chapter | null };
    return { prev: list[at - 1] ?? null, next: list[at + 1] ?? null };
  })();

  const nextMode: "chapter" | "fetch" | "none" = siblings.next
    ? "chapter"
    : chapter?.nextUrl
      ? "fetch"
      : "none";
  const shelfOptions: ShelfOption[] = shelves
    .filter((s) => s.series.id)
    .map((s) => ({ series: s.series, chapterCount: s.chapters.length }));

  /** Drops every trace of the previous reader before the next one signs in. */
  const handleSignedOut = () => {
    stop();
    setChapter(null);
    setLibrary([]);
    setAllSeries([]);
    setSeries(null);
    seriesRef.current = null;
    setOpenShelf(null);
    setGlossarySeries(null);
    setShelfId("");
    restored.current = false;
    readingRef.current = { marks: {}, current: null };
    setReading({ marks: {}, current: null });
  };

  /* --------------------------------- views -------------------------------- */

  // Nothing about the library renders until we know whose it is.
  if (!mounted || cloud.status === "connecting") {
    return (
      <main className="relative z-10 grid min-h-dvh place-items-center">
        <Loader2 size={22} className="animate-spin text-[var(--fg-dim)]" />
      </main>
    );
  }

  if (cloud.status !== "ready") {
    return <AuthGate onSignedIn={() => void loadLibrary()} />;
  }

  if (!chapter) {
    return (
      <main className="relative z-10 min-h-dvh">
        <TopChrome
          onLibrary={() => setShowLibrary(true)}
          onSettings={() => setShowSettings(true)}
          onAccount={() => setShowAccount(true)}
          cloudReady={cloud.status === "ready"}
          libraryCount={mounted ? library.length : 0}
        />

        <Composer
          busy={busy}
          busyLabel={PHASE_LABEL[phase] || "กำลังทำงาน"}
          onSubmit={start}
          onOpenSettings={() => setShowSettings(true)}
          shelves={mounted ? shelfOptions : []}
          shelfId={shelfId}
          onShelfChange={setShelfId}
          onImportPdf={() => setShowPdf(true)}
        />

        {job || queue.length ? (
          <JobBanner
            title={job?.title ?? "กำลังเตรียมคิว…"}
            label={`${PHASE_LABEL[phase] || "กำลังทำงาน"}${
              phase === "translating" ? ` ${Math.round(progress * 100)}%` : ""
            }`}
            progress={phase === "translating" ? progress : 0}
            waiting={queue.length}
            onOpen={job ? () => void openChapter(job.id) : undefined}
            onStop={stop}
          />
        ) : null}

        {mounted ? (
          <Bookshelf shelves={shelves} onOpen={setOpenShelf} />
        ) : null}

        <Sheets
          {...{
            showSettings,
            setShowSettings,
            showType,
            setShowType,
            showGlossary,
            setShowGlossary,
            showLibrary,
            setShowLibrary,
            showAccount,
            setShowAccount,
            chapter,
            glossarySeries,
            setGlossary,
            retranslate,
            library,
            openChapter,
            removeChapter,
            setLibrary,
            push,
            onSignedOut: handleSignedOut,
          }}
        />
        <PdfImport
          open={showPdf}
          onClose={() => setShowPdf(false)}
          shelves={shelfOptions}
          config={config}
          onImport={(result) => void importPdf(result)}
        />
        <ShelfSheet
          shelf={openShelf}
          shelves={shelves}
          onClose={() => setOpenShelf(null)}
          onOpenChapter={openChapter}
          onOpenGlossary={openGlossaryFor}
          onDeleteChapter={removeChapter}
          onMerge={(from, targetId) => void mergeShelf(from, targetId)}
          marks={reading.marks}
          currentId={reading.current}
          onDeleteShelf={(target) => void removeShelf(target)}
          onQueueAll={(chapters) => {
            enqueue(
              chapters.map((c) => ({
                id: c.id,
                title: c.translatedTitle || c.title,
                // Already-translated paragraphs are kept; only gaps are filled.
                opts: { skipDone: true },
              })),
            );
            push(`เพิ่ม ${chapters.length} ตอนเข้าคิวแปลแล้ว`, "success");
          }}
        />
        <CostGate
          pending={confirm}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const pending = confirm;
            setConfirm(null);
            if (pending) void queueDraft(pending.draft);
          }}
        />
        <ToastStack toasts={toasts} />
      </main>
    );
  }

  return (
    <main
      className="relative z-10 min-h-dvh"
      style={{ background: "var(--reader-bg)" }}
    >
      <ReaderHeader
        chapter={chapter}
        visible={chrome.visible}
        busy={viewingJob}
        busyLabel={`${PHASE_LABEL[phase]}${
          phase === "translating" ? ` ${Math.round(progress * 100)}%` : ""
        }`}
        progress={progress}
        width={reader.maxWidth}
        showSource={reader.showSource}
        // Going back leaves the translation running in the background.
        onBack={closeChapter}
        onStop={stop}
        onToggleSource={() => setReader({ showSource: !reader.showSource })}
        onGlossary={() => openGlossaryFor(series)}
        onTypography={() => setShowType(true)}
      />

      <Reader chapter={chapter} prefs={reader} streaming={phase === "translating"} />

      <ReaderDock
        visible={chrome.visible}
        progress={chrome.progress}
        busy={viewingJob}
        missing={missing}
        width={reader.maxWidth}
        hasPrev={Boolean(siblings.prev)}
        nextMode={nextMode}
        onTools={() => setShowTools(true)}
        onFillGaps={fillGaps}
        onPrev={() => {
          if (siblings.prev) void openChapter(siblings.prev.id);
        }}
        onNext={() => {
          if (siblings.next) void openChapter(siblings.next.id);
          else if (chapter.nextUrl) {
            autoChainRef.current = 0;
            void start(chapter.nextUrl, "url", chapter.seriesId);
          }
        }}
        onCopy={copyAll}
        onDownload={download}
      />

      <ReaderToolsSheet
        open={showTools}
        onClose={() => setShowTools(false)}
        glossaryCount={series?.glossary.length ?? chapter.glossary.length}
        missing={viewingJob ? 0 : missing}
        showSource={reader.showSource}
        onToggleSource={(v) => setReader({ showSource: v })}
        onCopy={copyAll}
        onDownload={download}
        onFillGaps={fillGaps}
        onGlossary={() => openGlossaryFor(series)}
        onTypography={() => setShowType(true)}
      />

      <Sheets
        {...{
          showSettings,
          setShowSettings,
          showType,
          setShowType,
          showGlossary,
          setShowGlossary,
          showLibrary,
          setShowLibrary,
          showAccount,
          setShowAccount,
          chapter,
          glossarySeries,
          setGlossary,
          retranslate,
          library,
          openChapter,
          removeChapter,
          setLibrary,
          push,
          onSignedOut: handleSignedOut,
        }}
      />
      <CostGate
        pending={confirm}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const pending = confirm;
          setConfirm(null);
          if (pending) void queueDraft(pending.draft);
        }}
      />
      <ToastStack toasts={toasts} />
    </main>
  );
}

/* ------------------------------- sub-views -------------------------------- */

function TopChrome({
  onLibrary,
  onSettings,
  onAccount,
  cloudReady,
  libraryCount,
}: {
  onLibrary: () => void;
  onSettings: () => void;
  onAccount: () => void;
  cloudReady: boolean;
  libraryCount: number;
}) {
  return (
    <header className="fixed inset-x-0 top-0 z-30 flex items-center gap-2 border-b border-transparent bg-[var(--bg)]/80 px-4 py-3.5 backdrop-blur-xl sm:px-6">
      <div className="flex items-center gap-2 font-semibold tracking-tight">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--accent)] text-[13px] text-[var(--btn-fg)]">
          N
        </span>
        <span className="text-[15px]">NovelFlow</span>
      </div>
      <div className="flex-1" />
      <Button variant="ghost" size="sm" onClick={onLibrary}>
        <BookMarked size={15} />
        <span className="hidden sm:inline">ห้องสมุด</span>
        {libraryCount > 0 ? (
          <span className="rounded-md bg-[var(--bg-elev-2)] px-1.5 text-[11px]">
            {libraryCount}
          </span>
        ) : null}
      </Button>
      <Button variant="ghost" size="icon" onClick={onAccount} aria-label="บัญชี">
        <UserRound size={17} className={cn(cloudReady && "text-emerald-400")} />
      </Button>
      <Button variant="ghost" size="icon" onClick={onSettings} aria-label="ตั้งค่า">
        <Settings2 size={17} />
      </Button>
    </header>
  );
}

/** Shows a background translation from the home screen, with a way into it. */
function JobBanner({
  title,
  label,
  progress,
  waiting,
  onOpen,
  onStop,
}: {
  title: string;
  label: string;
  progress: number;
  /** How many more chapters are lined up behind this one. */
  waiting: number;
  onOpen?: () => void;
  onStop: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-[680px] px-5 pb-8">
      <div className="rise flex items-center gap-3 rounded-2xl border border-[var(--accent)]/35 bg-[var(--accent-soft)] p-3.5">
        <Loader2 size={18} className="shrink-0 animate-spin text-[var(--accent)]" />

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-medium">{title}</p>
          <p className="mt-0.5 text-[12px] text-[var(--accent)]">
            {label}
            {waiting > 0 ? ` · รออีก ${waiting} ตอน` : ""}
          </p>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--line)]">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500 ease-out"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        </div>

        {onOpen ? (
          <Button variant="ghost" size="sm" onClick={onOpen} className="shrink-0">
            เปิดอ่าน
          </Button>
        ) : null}
        <Button variant="ghost" size="icon" onClick={onStop} aria-label="หยุดแปล">
          <StopCircle size={18} className="text-red-400" />
        </Button>
      </div>
    </div>
  );
}

function Sheets(props: {
  showSettings: boolean;
  setShowSettings: (v: boolean) => void;
  showType: boolean;
  setShowType: (v: boolean) => void;
  showGlossary: boolean;
  setShowGlossary: (v: boolean) => void;
  showLibrary: boolean;
  setShowLibrary: (v: boolean) => void;
  showAccount: boolean;
  setShowAccount: (v: boolean) => void;
  chapter: Chapter | null;
  glossarySeries: Series | null;
  setGlossary: (g: GlossaryEntry[]) => void;
  retranslate: () => void;
  library: Chapter[];
  openChapter: (id: string) => void;
  removeChapter: (id: string) => void;
  setLibrary: (c: Chapter[]) => void;
  push: (message: string, tone?: "info" | "error" | "success") => void;
  onSignedOut: () => void;
}) {
  return (
    <>
      <SettingsSheet
        open={props.showSettings}
        onClose={() => props.setShowSettings(false)}
      />
      <TypographySheet open={props.showType} onClose={() => props.setShowType(false)} />
      <GlossarySheet
        open={props.showGlossary}
        onClose={() => props.setShowGlossary(false)}
        seriesName={props.glossarySeries?.name ?? null}
        glossary={props.glossarySeries?.glossary ?? []}
        onChange={props.setGlossary}
        onRetranslate={props.retranslate}
      />
      <LibrarySheet
        open={props.showLibrary}
        onClose={() => props.setShowLibrary(false)}
        chapters={props.library}
        currentId={props.chapter?.id ?? null}
        onOpenChapter={props.openChapter}
        onDelete={props.removeChapter}
        onRefresh={() => void listChapters().then(props.setLibrary)}
      />
      <AccountSheet
        open={props.showAccount}
        onClose={() => props.setShowAccount(false)}
        onNotify={props.push}
        onSignedOut={props.onSignedOut}
      />
    </>
  );
}

function CostGate({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: { draft: Chapter; estimate: Estimate } | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!pending) return null;
  const { draft, estimate } = pending;

  return (
    <ConfirmDialog
      open
      title="เนื้อหาชิ้นนี้ค่อนข้างยาว"
      confirmLabel="แปลเลย"
      onCancel={onCancel}
      onConfirm={onConfirm}
      body={
        <div className="space-y-3">
          <p className="line-clamp-2 font-medium text-[var(--fg)]">{draft.title}</p>
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-[var(--bg)] py-2.5">
              <dt className="text-[11px] text-[var(--fg-dim)]">ย่อหน้า</dt>
              <dd className="text-[15px] font-semibold">
                {draft.paragraphs.length.toLocaleString()}
              </dd>
            </div>
            <div className="rounded-xl bg-[var(--bg)] py-2.5">
              <dt className="text-[11px] text-[var(--fg-dim)]">โทเคน</dt>
              <dd className="text-[15px] font-semibold">
                {Math.round(estimate.sourceTokens / 1000).toLocaleString()}K
              </dd>
            </div>
            <div className="rounded-xl bg-[var(--bg)] py-2.5">
              <dt className="text-[11px] text-[var(--fg-dim)]">ค่าใช้จ่าย</dt>
              <dd className="text-[15px] font-semibold text-[var(--accent)]">
                {estimate.usd === null ? "—" : formatUsd(estimate.usd)}
              </dd>
            </div>
          </dl>
          <p className="text-[12px] leading-relaxed text-[var(--fg-dim)]">
            {estimate.usd === null
              ? "ประเมินราคาได้เฉพาะโมเดล Claude — โมเดลอื่นให้ดูอัตราจากผู้ให้บริการ"
              : "เป็นตัวเลขประมาณจากราคาป้ายของ Anthropic ค่าจริงอาจต่างเล็กน้อย"}
            {" "}หยุดกลางคันได้ทุกเมื่อ ส่วนที่แปลไปแล้วจะถูกเก็บไว้
          </p>
        </div>
      }
    />
  );
}
