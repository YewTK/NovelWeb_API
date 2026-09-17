"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { History, Loader2, Moon, ScrollText, Settings2, StopCircle, Sun } from "lucide-react";
import { Composer } from "@/components/Composer";
import {
  Bookshelf,
  ContinueReading,
  buildShelves,
  type Shelf,
} from "@/components/Bookshelf";
import { BookPage } from "@/components/BookPage";
import { BookInfoSheet, type BookDraft } from "@/components/BookInfoSheet";
import { GlossarySheet } from "@/components/GlossarySheet";
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
import { cleanGlossary, mergeGlossary, relevantGlossary } from "@/lib/glossary";
import { keysFor, rpmFor, useSettings, type ThemeName } from "@/lib/store";
import {
  clearCurrent,
  forgetChapter,
  loadReading,
  openChapterMark,
  progressMark,
  saveReading,
  type ReadingState,
} from "@/lib/reading";
import { runGlossaryPass, runTranslation, type KeyRing } from "@/lib/translator";
import type { Chapter, ExtractResult, GlossaryEntry, Series } from "@/lib/types";
import { normalizeUrl, urlKey } from "@/lib/utils";
import {
  UNSORTED_SLUG,
  bookPath,
  chapterPath,
  parsePath,
  resolveBook,
  resolveChapter,
} from "@/lib/route";

/** Where the translation job is. Fetching a page is tracked separately. */
type Phase = "idle" | "preparing" | "translating";

/** Stops an auto-follow chain from quietly spending a whole API budget. */
const AUTO_NEXT_LIMIT = 50;

/** Shelf id used for chapters that belong to no novel. */
const ORPHANS = "__orphans";

interface QueueItem {
  id: string;
  title: string;
  opts?: { skipDone?: boolean; skipGlossary?: boolean };
}

interface StartOptions {
  /** file the chapter under this novel instead of guessing from the link */
  seriesId?: string;
  /** jump straight into the new chapter — the reader pressed "next" */
  openAfter?: boolean;
}

const PHASE_LABEL: Record<Phase, string> = {
  idle: "",
  preparing: "กำลังจับคำศัพท์…",
  translating: "กำลังแปล…",
};

/** Snapshot of the provider settings at the moment a request goes out. */
function currentRing(): KeyRing {
  const s = useSettings.getState();
  return { config: s.config, keys: keysFor(s), rpm: rpmFor(s) };
}

export default function Page() {
  const { reader, theme, setTheme, setReader } = useSettings();
  const hasKey = useSettings((s) => keysFor(s).length > 0);
  const { toasts, push } = useToasts();
  const cloud = useCloudState();

  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [library, setLibrary] = useState<Chapter[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  /** links currently being fetched from their source site */
  const [fetching, setFetching] = useState(0);
  const [progress, setProgress] = useState(0);
  /** transient status from the translator, e.g. waiting out a rate limit */
  const [notice, setNotice] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  /** Identifies the running translation so the UI can report it from anywhere. */
  const [job, setJob] = useState<{ id: string; title: string; seriesId: string } | null>(
    null,
  );
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
  const [confirm, setConfirm] = useState<{
    draft: Chapter;
    estimate: Estimate;
    openAfter: boolean;
  } | null>(null);

  const [allSeries, setAllSeries] = useState<Series[]>([]);
  /** The novel page on screen, if any. */
  const [bookId, setBookId] = useState<string | null>(null);
  const [glossarySeriesId, setGlossarySeriesId] = useState<string | null>(null);
  const [infoSeriesId, setInfoSeriesId] = useState<string | null>(null);
  /** Shelf the reader pinned by hand; "" lets the link decide. */
  const [shelfId, setShelfId] = useState("");

  const chapterRef = useRef<Chapter | null>(null);
  const bookIdRef = useRef<string | null>(null);
  const libraryRef = useRef<Chapter[]>([]);
  const allSeriesRef = useRef<Series[]>([]);
  /** The chapter currently being translated — not necessarily the one on screen. */
  const jobRef = useRef<Chapter | null>(null);
  const glossaryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const buffered = useRef(new Map<number, string>());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueRef = useRef<QueueItem[]>([]);
  const runningRef = useRef(false);
  /** Links being fetched right now — a second tap on "next" must not fetch twice. */
  const inflight = useRef(new Set<string>());
  /** Breaks the translate -> start -> queue -> translate dependency cycle. */
  const continueRef = useRef<((url: string, seriesId: string) => void) | null>(null);
  const autoChainRef = useRef(0);
  const readingRef = useRef<ReadingState>({ marks: {}, current: null });
  const readingSave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restored = useRef(false);
  const scrollMemo = useRef<{ home: number; book: number }>({ home: 0, book: 0 });

  chapterRef.current = chapter;
  bookIdRef.current = bookId;
  libraryRef.current = library;
  allSeriesRef.current = allSeries;

  const translatingNow = phase !== "idle";
  const busy = translatingNow || fetching > 0;
  /** True only when the chapter on screen is the one being translated. */
  const viewingJob = Boolean(chapter && job && chapter.id === job.id);
  const chrome = useReaderScroll(viewingJob);

  const seriesById = useCallback(
    (id: string | null | undefined) =>
      id ? allSeriesRef.current.find((s) => s.id === id) ?? null : null,
    [],
  );

  /* ------------------------------- bootstrap ------------------------------ */

  const refreshShelves = useCallback(async () => {
    const [chapters, novels] = await Promise.all([listChapters(), listSeries()]);
    // Refs first: routing resolves against them before the next render.
    libraryRef.current = chapters;
    allSeriesRef.current = novels;
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

  /* ------------------------------ navigation ------------------------------ */

  /**
   * Every screen has its own address — `/` the shelf, `/<novel>` a novel,
   * `/<novel>/<chapter>` a chapter — so a refresh, a shared link or the phone's
   * back gesture lands exactly where the reader was.
   */
  const writeUrl = useCallback((path: string, mode: "push" | "replace") => {
    try {
      if (window.location.pathname === path) return;
      if (mode === "push") window.history.pushState({ nf: true }, "", path);
      else window.history.replaceState(window.history.state, "", path);
    } catch {
      /* sandboxed iframe */
    }
  }, []);

  const siblingsOf = useCallback((seriesId: string) => {
    const all = allSeriesRef.current;
    const known = Boolean(seriesId) && all.some((s) => s.id === seriesId);
    return libraryRef.current.filter((c) =>
      known ? c.seriesId === seriesId : !c.seriesId || !all.some((s) => s.id === c.seriesId),
    );
  }, []);

  const pathForBook = useCallback(
    (key: string) => {
      const novel = key === ORPHANS ? null : seriesById(key);
      return novel ? bookPath(novel, allSeriesRef.current) : `/${UNSORTED_SLUG}`;
    },
    [seriesById],
  );

  const pathForChapter = useCallback(
    (c: Chapter) =>
      chapterPath(c, seriesById(c.seriesId), allSeriesRef.current, siblingsOf(c.seriesId)),
    [seriesById, siblingsOf],
  );

  /** The novel-page key a chapter belongs under. */
  const bookKeyOf = (c: Chapter) => (seriesById(c.seriesId) ? c.seriesId : ORPHANS);

  const leaveChapter = useCallback(() => {
    commitReading(clearCurrent(readingRef.current), true);
    setChapter(null);
    const y = bookIdRef.current ? scrollMemo.current.book : scrollMemo.current.home;
    requestAnimationFrame(() => window.scrollTo({ top: y }));
  }, [commitReading]);

  const leaveBook = useCallback(() => {
    setBookId(null);
    requestAnimationFrame(() => window.scrollTo({ top: scrollMemo.current.home }));
  }, []);

  /** Shows a chapter without touching the address bar. */
  const showChapter = useCallback(
    async (id: string): Promise<Chapter | null> => {
      const found = await getChapter(id);
      if (!found) return null;
      if (!chapterRef.current) {
        if (bookIdRef.current) scrollMemo.current.book = window.scrollY;
        else scrollMemo.current.home = window.scrollY;
      }
      setChapter(found);
      setProgress(found.progress);
      commitReading(openChapterMark(readingRef.current, id), true);
      window.scrollTo({ top: 0 });
      return found;
    },
    [commitReading],
  );

  /**
   * Opens a chapter and gives it its URL. Entering the reader adds a history
   * entry; moving between chapters replaces it, so "back" returns to the page
   * the reader came from rather than walking every chapter in reverse.
   */
  const openChapter = useCallback(
    async (id: string) => {
      const entering = !chapterRef.current;
      const found = await showChapter(id);
      if (found) writeUrl(pathForChapter(found), entering ? "push" : "replace");
    },
    [showChapter, writeUrl, pathForChapter],
  );

  const openBook = (id: string) => {
    const key = id || ORPHANS;
    scrollMemo.current.home = window.scrollY;
    setBookId(key);
    writeUrl(pathForBook(key), "push");
    window.scrollTo({ top: 0 });
  };

  /** Puts the screen in line with an address — on load, refresh and back/forward. */
  const applyRoute = useCallback(
    /**
     * @param quiet on a miss, report false instead of warning and redirecting —
     *   used against the local cache before the cloud library has arrived
     * @returns whether the address was fully resolved
     */
    async (pathname: string, quiet = false): Promise<boolean> => {
      const { book, chapter: segment } = parsePath(pathname);

      if (!book) {
        if (chapterRef.current) leaveChapter();
        if (bookIdRef.current) leaveBook();
        return true;
      }

      const target = resolveBook(book, allSeriesRef.current);
      if (target === null) {
        if (quiet) return false;
        push("ไม่พบนิยายเรื่องนี้ในชั้นหนังสือ", "error");
        setChapter(null);
        setBookId(null);
        writeUrl("/", "replace");
        return false;
      }

      const key = target === "" ? ORPHANS : target.id;

      if (!segment) {
        setBookId(key);
        if (chapterRef.current) leaveChapter();
        return true;
      }

      const found = resolveChapter(segment, siblingsOf(target === "" ? "" : target.id));
      if (!found) {
        if (quiet) return false;
        setBookId(key);
        push("ไม่พบตอนนี้ในเรื่องนี้", "error");
        if (chapterRef.current) leaveChapter();
        writeUrl(pathForBook(key), "replace");
        return false;
      }
      setBookId(key);
      if (chapterRef.current?.id !== found.id) await showChapter(found.id);
      return true;
    },
    [leaveChapter, leaveBook, push, writeUrl, siblingsOf, pathForBook, showChapter],
  );

  useEffect(() => {
    const onPop = () => void applyRoute(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [applyRoute]);

  const inAppHistory = () =>
    Boolean((window.history.state as { nf?: boolean } | null)?.nf);

  /** Reader's back button: the history entry if we made one, else up to the novel. */
  const backFromChapter = () => {
    const current = chapterRef.current;
    if (inAppHistory()) {
      window.history.back();
      return;
    }
    leaveChapter();
    if (current) {
      const key = bookKeyOf(current);
      setBookId(key);
      writeUrl(pathForBook(key), "replace");
    }
  };

  const backFromBook = () => {
    if (inAppHistory()) {
      window.history.back();
      return;
    }
    leaveBook();
    writeUrl("/", "replace");
  };

  /** Pulls this reader's library down and shows what was inherited, if anything. */
  const loadLibrary = useCallback(async () => {
    await refreshShelves();

    const saved = await loadReading();
    readingRef.current = saved;
    setReading(saved);

    // Open whatever the address points at — this is what keeps a refresh on
    // the same novel or chapter. The device cache answers instantly; only a
    // link to something not synced here yet has to wait for the cloud.
    const routing = !restored.current;
    restored.current = true;
    const resolved = routing ? await applyRoute(window.location.pathname, true) : true;

    await pullChapters();
    await pullSeries();
    await refreshShelves();

    const adopted = consumeAdoptionNotice();
    if (adopted > 0) {
      push(`ย้ายชั้นหนังสือเดิมเข้าบัญชีนี้แล้ว ${adopted} ตอน`, "success");
    }

    if (!resolved) await applyRoute(window.location.pathname);
  }, [refreshShelves, push, applyRoute]);

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
    if (!translatingNow) return;

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
  }, [translatingNow]);

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
    flushTimer.current = setTimeout(flush, 120);
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

  /** Puts a changed novel everywhere it is shown, then stores it. */
  const updateSeries = useCallback(async (next: Series) => {
    allSeriesRef.current = allSeriesRef.current.some((n) => n.id === next.id)
      ? allSeriesRef.current.map((n) => (n.id === next.id ? next : n))
      : [...allSeriesRef.current, next];
    setAllSeries(allSeriesRef.current);
    await saveSeries(next);
  }, []);

  /* ------------------------------- pipeline ------------------------------- */

  const translate = useCallback(
    async (
      target: Chapter,
      opts: { skipDone?: boolean; skipGlossary?: boolean } = {},
    ) => {
      const controller = new AbortController();
      abortRef.current = controller;
      const { style: currentStyle } = useSettings.getState();

      // The novel this job belongs to, held locally: the reader may open a
      // different novel while this one is still translating.
      let novel: Series | null =
        seriesById(target.seriesId) ??
        (target.seriesId ? ((await getSeriesById(target.seriesId)) ?? null) : null);
      // The cover image stays behind — it would ride along on every request.
      const book = novel
        ? { name: novel.name, info: novel.info ? { ...novel.info, cover: undefined } : undefined }
        : undefined;
      const sources = target.paragraphs.map((p) => p.source);

      let working: Chapter = { ...target, status: "translating" };
      jobRef.current = working;
      setJob({ id: working.id, title: working.translatedTitle || working.title, seriesId: working.seriesId });
      setNotice(null);
      // Mirror onto the screen only if this is the chapter being read.
      setChapter((prev) => (prev && prev.id === working.id ? working : prev));
      persist(working, true);

      let fullGlossary = novel?.glossary ?? working.glossary;

      // 1. Glossary pass — locks names before any prose is written. It runs on
      //    every new chapter so characters introduced later join the same
      //    novel-wide glossary instead of being renamed each time.
      if (!opts.skipGlossary) {
        setPhase("preparing");
        try {
          const result = await runGlossaryPass({
            ring: currentRing(),
            style: currentStyle,
            book,
            title: working.title,
            paragraphs: sources,
            known: relevantGlossary(fullGlossary, [working.title, ...sources]),
            signal: controller.signal,
            onNotice: setNotice,
          });
          if (result) {
            // Merge into the freshest copy, so edits made meanwhile survive.
            const latest = seriesById(novel?.id) ?? novel;
            fullGlossary = mergeGlossary(latest?.glossary ?? fullGlossary, result.terms);
            if (latest) {
              novel = { ...latest, glossary: fullGlossary };
              await updateSeries(novel);
            }
            working = {
              ...working,
              translatedTitle: result.title || working.translatedTitle,
            };
            setJob({
              id: working.id,
              title: working.translatedTitle || working.title,
              seriesId: working.seriesId,
            });
          }
        } catch (e) {
          if (controller.signal.aborted) {
            setPhase("idle");
            setJob(null);
            const stopped = { ...working, status: "draft" as const };
            setChapter((prev) => (prev && prev.id === stopped.id ? stopped : prev));
            persist(stopped, true);
            jobRef.current = null;
            return;
          }
          setPhase("idle");
          setJob(null);
          setNotice(null);
          const message = e instanceof Error ? e.message : "เตรียมคำศัพท์ไม่สำเร็จ";
          push(message, "error");
          const failed = { ...working, status: "error" as const };
          setChapter((prev) => (prev && prev.id === failed.id ? failed : prev));
          persist(failed, true);
          jobRef.current = null;
          if (/API Key/.test(message)) setShowSettings(true);
          return;
        }
      }

      // Only the terms this chapter uses travel with it — a long novel's full
      // glossary would bloat every request and every saved chapter.
      const glossary = relevantGlossary(fullGlossary, [working.title, ...sources]);
      working = { ...working, glossary };
      setChapter((prev) => (prev && prev.id === working.id ? working : prev));
      persist(working, true);

      // 2. Streamed translation, chunk by chunk.
      setPhase("translating");
      setProgress(0);

      const skip = opts.skipDone
        ? new Set(working.paragraphs.filter((p) => p.target).map((p) => p.id))
        : undefined;

      let failure: string | null = null;

      await runTranslation({
        ring: currentRing(),
        style: currentStyle,
        book,
        glossary,
        title: working.title,
        paragraphs: sources,
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
        onNotice: setNotice,
      });

      flush();
      setPhase("idle");
      setJob(null);
      setNotice(null);
      if (abortRef.current === controller) abortRef.current = null;

      const finished = jobRef.current ?? working;
      const done = finished.paragraphs.every((p) => p.target || !p.source.trim());
      const final: Chapter = {
        ...finished,
        status: failure ? "error" : done ? "done" : "draft",
        progress: done ? 1 : finished.progress,
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
        if (useSettings.getState().autoNext && final.nextUrl) {
          if (autoChainRef.current < AUTO_NEXT_LIMIT) {
            autoChainRef.current += 1;
            continueRef.current?.(final.nextUrl, final.seriesId);
          } else {
            push(`ดึงตอนถัดไปอัตโนมัติครบ ${AUTO_NEXT_LIMIT} ตอนแล้ว หยุดไว้ก่อน`, "info");
          }
        }
      }
    },
    [persist, push, schedule, flush, seriesById, updateSeries],
  );

  /**
   * Works through the queue one chapter at a time. Sequential on purpose: each
   * chapter feeds new terms into the novel's glossary, and the next chapter
   * should be translated knowing them — and one chapter at a time is also
   * what keeps request volume inside the provider's rate limit.
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
        await translate(target, next.opts);
      }
    } finally {
      runningRef.current = false;
    }
  }, [translate]);

  const enqueue = useCallback(
    (items: QueueItem[]) => {
      // A chapter already waiting or in flight is never lined up twice.
      const taken = new Set([
        ...queueRef.current.map((q) => q.id),
        ...(jobRef.current ? [jobRef.current.id] : []),
      ]);
      const fresh = items.filter((i) => !taken.has(i.id));
      if (!fresh.length) return 0;
      queueRef.current = [...queueRef.current, ...fresh];
      setQueue([...queueRef.current]);
      void pump();
      return fresh.length;
    },
    [pump],
  );

  const isQueued = (id: string) =>
    jobRef.current?.id === id || queueRef.current.some((q) => q.id === id);

  const findByUrl = (url: string) => {
    const key = urlKey(url);
    return libraryRef.current.find((c) => c.sourceUrl && urlKey(c.sourceUrl) === key);
  };

  /**
   * Hands a chapter that already exists back to the reader instead of fetching
   * and translating it a second time.
   */
  const reuseExisting = useCallback(
    (existing: Chapter, openAfter: boolean) => {
      if (openAfter) void openChapter(existing.id);
      if (existing.status !== "done" && !isQueued(existing.id)) {
        enqueue([
          {
            id: existing.id,
            title: existing.translatedTitle || existing.title,
            opts: { skipDone: true },
          },
        ]);
      } else if (!openAfter) {
        push("ตอนนี้อยู่ในชั้นหนังสือแล้ว", "info");
      }
    },
    // isQueued reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openChapter, enqueue, push],
  );

  const start = useCallback(
    async (input: string, kind: "url" | "text", opts: StartOptions = {}) => {
      if (!keysFor(useSettings.getState()).length) {
        setShowSettings(true);
        push("ใส่ API Key ก่อนเริ่มแปล", "error");
        return;
      }

      const url = kind === "url" ? normalizeUrl(input) : "";
      const key = url ? urlKey(url) : "";

      if (url) {
        // Already on a shelf: open or resume it rather than paying for it twice.
        const existing = findByUrl(url);
        if (existing) {
          reuseExisting(existing, Boolean(opts.openAfter));
          return;
        }
        // Already on its way: a repeated tap does nothing.
        if (inflight.current.has(key)) return;
        inflight.current.add(key);
      }

      setFetching((n) => n + 1);

      try {
        let source: Pick<
          ExtractResult,
          "title" | "siteName" | "paragraphs" | "nextUrl" | "prevUrl" | "url"
        >;

        if (kind === "url") {
          try {
            const res = await fetch("/api/extract", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ url }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? "ดึงเนื้อหาไม่สำเร็จ");
            source = json as ExtractResult;
          } catch (e) {
            push(e instanceof Error ? e.message : "ดึงเนื้อหาไม่สำเร็จ", "error");
            return;
          }

          // The page may have redirected to a link we already have.
          const redirected = source.url ? findByUrl(source.url) : undefined;
          if (redirected) {
            reuseExisting(redirected, Boolean(opts.openAfter));
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
          push("ไม่พบเนื้อหาให้แปล", "error");
          return;
        }

        // Group this chapter with the rest of its novel. A shelf the reader
        // picked wins over the one derived from the link — that is the only
        // way the same novel read on two sites lands together.
        const pinned = opts.seriesId ?? shelfId;
        const novel =
          (pinned ? await getSeriesById(pinned) : undefined) ??
          (await ensureSeries(deriveSeries(source.title, source.url || null)));
        if (!allSeriesRef.current.some((n) => n.id === novel.id)) {
          allSeriesRef.current = [...allSeriesRef.current, novel];
          setAllSeries(allSeriesRef.current);
        }

        const { config, style: currentStyle } = useSettings.getState();
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
          glossary: [],
          status: "draft",
          progress: 0,
          model: config.model,
          targetLanguage: currentStyle.targetLanguage,
          seriesId: novel.id,
        };

        // Long pages cost real money — show the bill before spending it.
        const estimate = estimateJob(
          source.paragraphs,
          buildChunks(source.paragraphs).length,
          config,
        );
        if (estimate.sourceTokens > 9000 && estimate.usd !== null) {
          setConfirm({ draft, estimate, openAfter: Boolean(opts.openAfter) });
          return;
        }

        await saveChapter(draft, true);
        libraryRef.current = [draft, ...libraryRef.current];
        setLibrary(libraryRef.current);
        enqueue([{ id: draft.id, title: draft.title }]);
        if (opts.openAfter) void openChapter(draft.id);
        void refreshShelves();
      } finally {
        if (key) inflight.current.delete(key);
        setFetching((n) => Math.max(0, n - 1));
      }
    },
    // findByUrl reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [push, shelfId, enqueue, refreshShelves, reuseExisting, openChapter],
  );

  useEffect(() => {
    continueRef.current = (url, seriesId) => void start(url, "url", { seriesId });
  }, [start]);

  /** Stops the chapter in flight and drops whatever was still waiting. */
  const stop = () => {
    autoChainRef.current = 0;
    const waiting = queueRef.current.length;
    queueRef.current = [];
    setQueue([]);
    abortRef.current?.abort();
    abortRef.current = null;
    if (waiting > 0) push(`ยกเลิกคิวที่เหลืออีก ${waiting} ตอนแล้ว`);
  };

  /** Saves a draft then puts it in line to be translated. */
  const queueDraft = async (draft: Chapter, openAfter: boolean) => {
    await saveChapter(draft, true);
    libraryRef.current = [draft, ...libraryRef.current];
    setLibrary(libraryRef.current);
    enqueue([{ id: draft.id, title: draft.title }]);
    if (openAfter) void openChapter(draft.id);
    void refreshShelves();
  };

  const removeChapter = async (id: string) => {
    queueRef.current = queueRef.current.filter((q) => q.id !== id);
    setQueue([...queueRef.current]);
    if (jobRef.current?.id === id) abortRef.current?.abort();
    await repoDelete(id);
    commitReading(forgetChapter(readingRef.current, id), true);
    await refreshShelves();
    if (chapterRef.current?.id === id) backFromChapter();
  };

  const openGlossaryFor = (id: string | null | undefined) => {
    if (!id || id === ORPHANS) {
      push("ตอนนี้ยังไม่ได้ผูกกับเรื่องไหน", "error");
      return;
    }
    setGlossarySeriesId(id);
    setShowGlossary(true);
  };

  /** Edits land on the novel; the save is debounced while the reader types. */
  const setGlossary = (next: GlossaryEntry[]) => {
    const target = seriesById(glossarySeriesId);
    if (!target) return;
    const updated = { ...target, glossary: next };
    allSeriesRef.current = allSeriesRef.current.map((n) => (n.id === target.id ? updated : n));
    setAllSeries(allSeriesRef.current);

    if (glossaryTimer.current) clearTimeout(glossaryTimer.current);
    glossaryTimer.current = setTimeout(() => {
      const latest = seriesById(target.id);
      if (latest) void saveSeries({ ...latest, glossary: cleanGlossary(latest.glossary) });
    }, 900);
  };

  const saveBookInfo = async (draft: BookDraft) => {
    const target = seriesById(infoSeriesId);
    setInfoSeriesId(null);
    if (!target) return;
    await updateSeries({ ...target, name: draft.name || target.name, info: draft.info });
    // A new name means a new address; keep the bar in step with it.
    const open = chapterRef.current;
    if (open && open.seriesId === target.id) writeUrl(pathForChapter(open), "replace");
    else if (bookIdRef.current === target.id) writeUrl(pathForBook(target.id), "replace");
    push("บันทึกข้อมูลหนังสือแล้ว", "success");
  };

  const retranslate = () => {
    const current = chapterRef.current;
    if (!current) return;
    if (isQueued(current.id)) {
      push("ตอนนี้อยู่ในคิวแปลอยู่แล้ว", "info");
      return;
    }
    const cleared: Chapter = {
      ...current,
      paragraphs: current.paragraphs.map((p) => ({ ...p, target: "" })),
    };
    void saveChapter(cleared, true).then(() =>
      enqueue([{ id: cleared.id, title: cleared.title, opts: { skipGlossary: true } }]),
    );
    setChapter(cleared);
  };

  const fillGaps = () => {
    const current = chapterRef.current;
    if (!current || isQueued(current.id)) return;
    enqueue([
      {
        id: current.id,
        title: current.translatedTitle || current.title,
        opts: { skipDone: true, skipGlossary: true },
      },
    ]);
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
    if (!keysFor(useSettings.getState()).length) {
      setShowSettings(true);
      push("ใส่ API Key ก่อนเริ่มแปล", "error");
      return;
    }

    const novel = result.seriesId ? await getSeriesById(result.seriesId) : undefined;
    const shelf = novel ?? (await ensureSeries(deriveSeries(result.bookName, null)));
    const { config, style: currentStyle } = useSettings.getState();

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
      glossary: [],
      status: "draft",
      progress: 0,
      model: config.model,
      targetLanguage: currentStyle.targetLanguage,
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
    if (jobRef.current && ids.includes(jobRef.current.id)) abortRef.current?.abort();

    await deleteShelf(target.series.id, ids);

    let marks = readingRef.current;
    for (const id of ids) marks = forgetChapter(marks, id);
    commitReading(marks, true);

    if (shelfId === target.series.id) setShelfId("");
    backFromBook();
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

    setShelfId((id) => (id === from.series.id ? targetId : id));
    setBookId(targetId);
    setChapter((prev) =>
      prev && prev.seriesId === from.series.id ? { ...prev, seriesId: targetId } : prev,
    );

    await refreshShelves();
    writeUrl(pathForBook(targetId), "replace");
    push(`รวมเข้า “${merged.name}” แล้ว`, "success");
  };

  /* ------------------------------ derived data ----------------------------- */

  const shelves = useMemo(() => buildShelves(allSeries, library), [allSeries, library]);
  const queuedIds = useMemo(() => new Set(queue.map((q) => q.id)), [queue]);

  const missing = chapter?.paragraphs.filter((p) => !p.target).length ?? 0;
  const chapterSeries = chapter ? allSeries.find((s) => s.id === chapter.seriesId) ?? null : null;
  const glossarySeries = allSeries.find((s) => s.id === glossarySeriesId) ?? null;
  const infoSeries = allSeries.find((s) => s.id === infoSeriesId) ?? null;
  const openShelf = bookId
    ? (shelves.find((s) => (s.series.id || ORPHANS) === bookId) ?? null)
    : null;

  // Neighbours within the same novel, in reading order, so the reader can walk
  // a shelf the way a novel site lets you walk a table of contents.
  const siblings = useMemo(() => {
    if (!chapter) return { prev: null as Chapter | null, next: null as Chapter | null };
    const list =
      shelves.find((sh) => (sh.series.id || "") === (chapter.seriesId || ""))?.chapters ?? [];
    const at = list.findIndex((c) => c.id === chapter.id);
    if (at === -1) return { prev: null as Chapter | null, next: null as Chapter | null };
    return { prev: list[at - 1] ?? null, next: list[at + 1] ?? null };
  }, [chapter, shelves]);

  const nextMode: "chapter" | "fetch" | "none" = siblings.next
    ? "chapter"
    : chapter?.nextUrl
      ? "fetch"
      : "none";
  const fetchingNext = Boolean(
    chapter?.nextUrl && inflight.current.has(urlKey(chapter.nextUrl)),
  );

  const shelfOptions: ShelfOption[] = useMemo(
    () =>
      shelves
        .filter((s) => s.series.id)
        .map((s) => ({ series: s.series, chapterCount: s.chapters.length })),
    [shelves],
  );

  const jobLabel = notice
    ? notice
    : `${PHASE_LABEL[phase] || "กำลังทำงาน"}${
        phase === "translating" ? ` ${Math.round(progress * 100)}%` : ""
      }`;

  /** Drops every trace of the previous reader before the next one signs in. */
  const handleSignedOut = () => {
    stop();
    setChapter(null);
    setBookId(null);
    setLibrary([]);
    setAllSeries([]);
    setGlossarySeriesId(null);
    setInfoSeriesId(null);
    setShelfId("");
    writeUrl("/", "replace");
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

  const sheets = (
    <>
      <SettingsSheet open={showSettings} onClose={() => setShowSettings(false)} />
      <TypographySheet open={showType} onClose={() => setShowType(false)} />
      <GlossarySheet
        open={showGlossary && Boolean(glossarySeries)}
        onClose={() => setShowGlossary(false)}
        seriesName={glossarySeries?.name ?? null}
        glossary={glossarySeries?.glossary ?? []}
        onChange={setGlossary}
        onNotify={push}
        onRetranslate={
          chapter && glossarySeries && chapter.seriesId === glossarySeries.id && !viewingJob
            ? retranslate
            : undefined
        }
      />
      <BookInfoSheet
        series={infoSeries}
        onClose={() => setInfoSeriesId(null)}
        onSave={(d) => void saveBookInfo(d)}
      />
      <LibrarySheet
        open={showLibrary}
        onClose={() => setShowLibrary(false)}
        chapters={library}
        currentId={chapter?.id ?? null}
        onOpenChapter={(id) => void openChapter(id)}
        onDelete={(id) => void removeChapter(id)}
        onRefresh={() => void listChapters().then(setLibrary)}
      />
      <AccountSheet
        open={showAccount}
        onClose={() => setShowAccount(false)}
        onNotify={push}
        onSignedOut={handleSignedOut}
      />
      <CostGate
        pending={confirm}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const pending = confirm;
          setConfirm(null);
          if (pending) void queueDraft(pending.draft, pending.openAfter);
        }}
      />
      <ToastStack toasts={toasts} />
    </>
  );

  if (chapter) {
    return (
      <main className="relative z-10 min-h-dvh" style={{ background: "var(--reader-bg)" }}>
        <ReaderHeader
          chapter={chapter}
          seriesName={chapterSeries?.name ?? null}
          visible={chrome.visible}
          busy={viewingJob}
          busyLabel={jobLabel}
          progress={progress}
          width={reader.maxWidth}
          showSource={reader.showSource}
          // Going back leaves the translation running in the background.
          onBack={backFromChapter}
          onStop={stop}
          onToggleSource={() => setReader({ showSource: !reader.showSource })}
          onGlossary={() => openGlossaryFor(chapter.seriesId)}
          onTypography={() => setShowType(true)}
        />

        <Reader
          chapter={chapter}
          prefs={reader}
          streaming={viewingJob && phase === "translating"}
          waiting={queuedIds.has(chapter.id) || (viewingJob && phase === "preparing")}
        />

        <ReaderDock
          visible={chrome.visible}
          progress={chrome.progress}
          busy={viewingJob || queuedIds.has(chapter.id)}
          missing={missing}
          width={reader.maxWidth}
          hasPrev={Boolean(siblings.prev)}
          nextMode={nextMode}
          fetchingNext={fetchingNext}
          onTools={() => setShowTools(true)}
          onFillGaps={fillGaps}
          onPrev={() => {
            if (siblings.prev) void openChapter(siblings.prev.id);
          }}
          onNext={() => {
            if (siblings.next) void openChapter(siblings.next.id);
            else if (chapter.nextUrl) {
              autoChainRef.current = 0;
              void start(chapter.nextUrl, "url", {
                seriesId: chapter.seriesId,
                openAfter: true,
              });
            }
          }}
          onCopy={copyAll}
          onDownload={download}
        />

        <ReaderToolsSheet
          open={showTools}
          onClose={() => setShowTools(false)}
          glossaryCount={chapterSeries?.glossary.length ?? chapter.glossary.length}
          missing={viewingJob ? 0 : missing}
          showSource={reader.showSource}
          onToggleSource={(v) => setReader({ showSource: v })}
          onCopy={copyAll}
          onDownload={download}
          onFillGaps={fillGaps}
          onGlossary={() => openGlossaryFor(chapter.seriesId)}
          onTypography={() => setShowType(true)}
        />
        {sheets}
      </main>
    );
  }

  if (openShelf) {
    return (
      <>
        <BookPage
          shelf={openShelf}
          shelves={shelves}
          marks={reading.marks}
          currentId={reading.current}
          jobId={job?.id ?? null}
          queuedIds={queuedIds}
          onBack={backFromBook}
          onOpenChapter={(id) => void openChapter(id)}
          onOpenGlossary={() => openGlossaryFor(openShelf.series.id)}
          onEditInfo={() => setInfoSeriesId(openShelf.series.id || null)}
          onDeleteChapter={(id) => void removeChapter(id)}
          onMerge={(from, targetId) => void mergeShelf(from, targetId)}
          onDeleteShelf={(target) => void removeShelf(target)}
          onQueueAll={(chapters) => {
            const added = enqueue(
              chapters.map((c) => ({
                id: c.id,
                title: c.translatedTitle || c.title,
                // Already-translated paragraphs are kept; only gaps are filled.
                opts: { skipDone: true },
              })),
            );
            push(added ? `เพิ่ม ${added} ตอนเข้าคิวแปลแล้ว` : "ทุกตอนอยู่ในคิวแล้ว", "success");
          }}
        />
        {job || queue.length ? (
          <JobBanner
            floating
            title={job?.title ?? "กำลังเตรียมคิว…"}
            label={jobLabel}
            progress={phase === "translating" ? progress : 0}
            waiting={queue.length}
            onOpen={job ? () => void openChapter(job.id) : undefined}
            onStop={stop}
          />
        ) : null}
        {sheets}
      </>
    );
  }

  return (
    <main className="relative z-10 min-h-dvh">
      <TopChrome
        onLibrary={() => setShowLibrary(true)}
        onSettings={() => setShowSettings(true)}
        onAccount={() => setShowAccount(true)}
        username={cloud.username}
        needsKey={!hasKey}
        theme={theme}
        onTheme={setTheme}
      />

      <Composer
        compact={shelves.length > 0}
        busy={fetching > 0}
        busyLabel="กำลังดึงเนื้อหา…"
        onSubmit={(input, kind) => void start(input, kind)}
        onOpenSettings={() => setShowSettings(true)}
        shelves={shelfOptions}
        shelfId={shelfId}
        onShelfChange={setShelfId}
        onImportPdf={() => setShowPdf(true)}
      />

      {job || queue.length ? (
        <JobBanner
          title={job?.title ?? "กำลังเตรียมคิว…"}
          label={jobLabel}
          progress={phase === "translating" ? progress : 0}
          waiting={queue.length}
          onOpen={job ? () => void openChapter(job.id) : undefined}
          onStop={stop}
        />
      ) : null}

      <ContinueReading
        shelves={shelves}
        marks={reading.marks}
        onOpenChapter={(id) => void openChapter(id)}
      />

      <Bookshelf
        shelves={shelves}
        marks={reading.marks}
        activeSeriesId={job?.seriesId ?? null}
        onOpen={openBook}
      />

      <PdfImport
        open={showPdf}
        onClose={() => setShowPdf(false)}
        shelves={shelfOptions}
        config={useSettings.getState().config}
        onImport={(result) => void importPdf(result)}
      />
      {sheets}
    </main>
  );
}

/* ------------------------------- sub-views -------------------------------- */

function TopChrome({
  onLibrary,
  onSettings,
  onAccount,
  username,
  needsKey,
  theme,
  onTheme,
}: {
  onLibrary: () => void;
  onSettings: () => void;
  onAccount: () => void;
  username: string | null;
  needsKey: boolean;
  theme: ThemeName;
  onTheme: (t: ThemeName) => void;
}) {
  // มืด → สว่าง → กระดาษ → มืด
  const next: ThemeName = theme === "dark" ? "light" : theme === "light" ? "sepia" : "dark";
  const label = { dark: "ธีมมืด", light: "ธีมสว่าง", sepia: "ธีมกระดาษ" }[theme];
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--line-soft)] bg-[var(--bg)]/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1080px] items-center gap-1 px-3 sm:px-6">
        <div className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-[var(--accent-strong)] font-serif text-[16px] text-white shadow-[0_6px_16px_-6px_var(--accent)]">
            N
          </span>
          <span className="text-[16px]">NovelFlow</span>
        </div>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onTheme(next)}
          aria-label={`${label} — กดเพื่อเปลี่ยน`}
          title={label}
        >
          {theme === "dark" ? <Moon size={18} /> : theme === "light" ? <Sun size={18} /> : <ScrollText size={18} />}
        </Button>
        <Button variant="ghost" size="icon" onClick={onLibrary} aria-label="ตอนที่เปิดล่าสุด">
          <History size={18} />
        </Button>
        <Button variant="ghost" size="icon" onClick={onSettings} aria-label="ตั้งค่า" className="relative">
          <Settings2 size={18} />
          {needsKey ? (
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[var(--accent)] ring-2 ring-[var(--bg)]" />
          ) : null}
        </Button>
        <button
          onClick={onAccount}
          aria-label="บัญชี"
          className="ml-1 grid h-9 w-9 place-items-center rounded-full bg-[var(--accent-soft)] text-[14px] font-semibold uppercase text-[var(--accent)] transition-colors hover:bg-[color-mix(in_oklab,var(--accent)_20%,transparent)]"
        >
          {username ? username.slice(0, 1) : "?"}
        </button>
      </div>
    </header>
  );
}

/** Shows a background translation from anywhere, with a way into it. */
function JobBanner({
  title,
  label,
  progress,
  waiting,
  onOpen,
  onStop,
  floating,
}: {
  title: string;
  label: string;
  progress: number;
  /** How many more chapters are lined up behind this one. */
  waiting: number;
  onOpen?: () => void;
  onStop: () => void;
  /** pinned to the bottom of the screen rather than inline */
  floating?: boolean;
}) {
  return (
    <div
      className={
        floating
          ? "fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[680px] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          : "mx-auto w-full max-w-[1080px] px-4 pb-6 sm:px-6"
      }
    >
      <div className="rise flex items-center gap-3 rounded-2xl border border-[var(--accent-line)] bg-[var(--bg-elev)] p-3 shadow-[0_12px_32px_-12px_rgba(0,0,0,.45)]">
        <Loader2 size={18} className="shrink-0 animate-spin text-[var(--accent)]" />

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-medium">{title}</p>
          <p className="mt-0.5 truncate text-[12px] text-[var(--accent)]">
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
            เป็นตัวเลขประมาณจากราคาป้ายของ Anthropic ค่าจริงอาจต่างเล็กน้อย
            หยุดกลางคันได้ทุกเมื่อ ส่วนที่แปลไปแล้วจะถูกเก็บไว้
          </p>
        </div>
      }
    />
  );
}
