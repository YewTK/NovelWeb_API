"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, BookOpen, ChevronRight, Loader2, PenLine, StopCircle } from "lucide-react";
import type { ComposerHandle } from "@/components/Composer";
import { buildShelves, isOriginal, type Shelf } from "@/components/Bookshelf";
import { BookPage } from "@/components/BookPage";
import type { BookDraft } from "@/components/BookInfoSheet";
import type { ShelfOption } from "@/components/ShelfPicker";
import { AuthGate } from "@/components/AuthGate";
import type { PdfImportResult } from "@/components/PdfImport";
import { Reader } from "@/components/Reader";
import { ReaderDock, ReaderHeader, ReaderToolsSheet, useReaderScroll, type NextMode } from "@/components/ReaderChrome";
import { Home } from "@/components/Home";
import { MobileTabBar, TopNav, type JobPill, type View } from "@/components/AppShell";
import type { NewProjectDraft } from "@/components/studio/NewProject";
import { Button, ConfirmDialog, Skeleton, ToastStack, useToasts } from "@/components/ui";
import { authorStyle } from "@/lib/authors";
import { buildChunks, splitPastedText } from "@/lib/chunk";
import { estimateJob, formatUsd, type Estimate } from "@/lib/cost";
import { toMeta } from "@/lib/db";
import {
  deleteChapter as repoDelete,
  ensureSeries,
  getChapter,
  getSeriesById,
  initCloud,
  listChapters,
  consumeAdoptionNotice,
  deleteShelf,
  flushSeriesPush,
  listSeries,
  mergeIntoSeries,
  pullChapters,
  pullSeries,
  saveChapter,
  saveSeries,
} from "@/lib/repo";
import { deriveSeries } from "@/lib/series";
import { cleanGlossary, mergeGlossary, relevantGlossary } from "@/lib/glossary";
import { keysFor, rpmFor, useSettings } from "@/lib/store";
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
import type { Chapter, ChapterMeta, ExtractResult, GlossaryEntry, Series, WritingProject } from "@/lib/types";
import { useCloudState } from "@/lib/useCloud";
import { normalizeUrl, urlKey } from "@/lib/utils";
import { UNTITLED, nextToWrite, useWriterJob } from "@/lib/writer";
import {
  UNSORTED_SLUG,
  bookPath,
  chapterPath,
  parsePath,
  parseStudioPath,
  resolveBook,
  resolveChapter,
  studioPath,
} from "@/lib/route";

/*
 * Sheets and the studio are fetched on first use (and prefetched when the
 * browser is idle) instead of shipping in the first bundle.
 */
const loadSettings = () => import("@/components/SettingsSheet").then((m) => m.SettingsSheet);
const loadGlossary = () => import("@/components/GlossarySheet").then((m) => m.GlossarySheet);
const loadBookInfo = () => import("@/components/BookInfoSheet").then((m) => m.BookInfoSheet);
const loadPdf = () => import("@/components/PdfImport").then((m) => m.PdfImport);
const loadStudio = () => import("@/components/studio/Studio").then((m) => m.Studio);
const loadPanels = () => import("@/components/Panels");

const SettingsSheet = dynamic(loadSettings, { ssr: false });
const GlossarySheet = dynamic(loadGlossary, { ssr: false });
const BookInfoSheet = dynamic(loadBookInfo, { ssr: false });
const PdfImport = dynamic(loadPdf, { ssr: false });
const Studio = dynamic(loadStudio, { ssr: false, loading: () => <ViewSkeleton /> });
const TypographySheet = dynamic(() => loadPanels().then((m) => m.TypographySheet), { ssr: false });
const LibrarySheet = dynamic(() => loadPanels().then((m) => m.LibrarySheet), { ssr: false });
const AccountSheet = dynamic(() => loadPanels().then((m) => m.AccountSheet), { ssr: false });

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

/** Writing wants at least a medium effort; translation's default is low. */
function writingEffort() {
  const e = useSettings.getState().style.effort;
  return e === "low" ? "medium" : e;
}

/** The chapter number a studio chapter was written for, from the project's own map. */
function plannedNumber(project: WritingProject | undefined, chapterId: string): number | null {
  if (!project) return null;
  for (const [n, id] of Object.entries(project.chapterIds)) if (id === chapterId) return Number(n);
  return null;
}

function whenIdle(fn: () => void) {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout: 4000 });
  else setTimeout(fn, 1500);
}

export default function Page() {
  const { reader, theme, setTheme, setReader } = useSettings();
  const hasKey = useSettings((s) => keysFor(s).length > 0);
  const { toasts, push } = useToasts();
  const cloud = useCloudState();

  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [library, setLibrary] = useState<ChapterMeta[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  /** links currently being fetched from their source site */
  const [fetching, setFetching] = useState(0);
  const [progress, setProgress] = useState(0);
  /** transient status from the translator, e.g. waiting out a rate limit */
  const [notice, setNotice] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  /** Identifies the running translation so the UI can report it from anywhere. */
  const [job, setJob] = useState<{ id: string; title: string; seriesId: string } | null>(null);
  /** Chapters waiting their turn; they are translated one at a time, in order. */
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [showPdf, setShowPdf] = useState(false);
  /** Which chapters have been read, and where the reader left off. */
  const [reading, setReading] = useState<ReadingState>({ marks: {}, current: null });

  const [view, setView] = useState<View>("home");
  /** The studio project on screen, if any. */
  const [studioId, setStudioId] = useState<string | null>(null);
  /** The chapter the writer is producing right now, with its text. */
  const [live, setLive] = useState<Chapter | null>(null);

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
  const [rewriteAsk, setRewriteAsk] = useState<{ seriesId: string; n: number } | null>(null);

  const [allSeries, setAllSeries] = useState<Series[]>([]);
  /** The novel page on screen, if any. */
  const [bookId, setBookId] = useState<string | null>(null);
  const [glossarySeriesId, setGlossarySeriesId] = useState<string | null>(null);
  const [infoSeriesId, setInfoSeriesId] = useState<string | null>(null);
  /** Shelf the reader pinned by hand; "" lets the link decide. */
  const [shelfId, setShelfId] = useState("");

  const chapterRef = useRef<Chapter | null>(null);
  const bookIdRef = useRef<string | null>(null);
  const libraryRef = useRef<ChapterMeta[]>([]);
  const allSeriesRef = useRef<Series[]>([]);
  /** The chapter currently being translated — not necessarily the one on screen. */
  const jobRef = useRef<Chapter | null>(null);
  const glossaryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
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
  /** Open the next studio chapter as soon as the writer starts it. */
  const followWriteRef = useRef<string | null>(null);
  const composerRef = useRef<ComposerHandle | null>(null);

  chapterRef.current = chapter;
  bookIdRef.current = bookId;
  libraryRef.current = library;
  allSeriesRef.current = allSeries;

  const translatingNow = phase !== "idle";
  const busy = translatingNow || fetching > 0;
  /** True only when the chapter on screen is the one being translated. */
  const viewingJob = Boolean(chapter && job && chapter.id === job.id);

  const seriesById = useCallback(
    (id: string | null | undefined) => (id ? (allSeriesRef.current.find((s) => s.id === id) ?? null) : null),
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

  /** Puts one chapter's metadata on the shelf without re-reading the library. */
  const upsertMeta = useCallback((c: Chapter) => {
    const meta = toMeta(c);
    const list = libraryRef.current;
    const next = list.some((m) => m.id === meta.id) ? list.map((m) => (m.id === meta.id ? meta : m)) : [meta, ...list];
    libraryRef.current = next;
    setLibrary(next);
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

  /** Puts a changed novel everywhere it is shown, then stores it. */
  const updateSeries = useCallback(async (next: Series) => {
    allSeriesRef.current = allSeriesRef.current.some((n) => n.id === next.id)
      ? allSeriesRef.current.map((n) => (n.id === next.id ? next : n))
      : [...allSeriesRef.current, next];
    setAllSeries(allSeriesRef.current);
    await saveSeries(next);
  }, []);

  /* ------------------------------ navigation ------------------------------ */

  /**
   * Every screen has its own address — `/` the shelf, `/<novel>` a novel,
   * `/<novel>/<chapter>` a chapter, `/studio[/<novel>]` the writing studio —
   * so a refresh, a shared link or the phone's back gesture lands exactly
   * where the reader was.
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
    (c: Chapter) => chapterPath(c, seriesById(c.seriesId), allSeriesRef.current, siblingsOf(c.seriesId)),
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
      window.scrollTo({ top: 0 });
      setChapter(found);
      setProgress(found.progress);
      commitReading(openChapterMark(readingRef.current, id), true);
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

  const openBook = useCallback(
    (id: string) => {
      const key = id || ORPHANS;
      if (!chapterRef.current) scrollMemo.current.home = window.scrollY;
      setChapter(null);
      setBookId(key);
      writeUrl(pathForBook(key), "push");
      window.scrollTo({ top: 0 });
    },
    [writeUrl, pathForBook],
  );

  const goView = useCallback(
    (next: View, projectId: string | null = null) => {
      if (chapterRef.current) commitReading(clearCurrent(readingRef.current), true);
      setChapter(null);
      setBookId(null);
      setView(next);
      setStudioId(next === "studio" ? projectId : null);
      const path = next === "studio" ? studioPath(projectId ? seriesById(projectId) : null, allSeriesRef.current) : "/";
      writeUrl(path, "push");
      window.scrollTo({ top: next === "home" ? scrollMemo.current.home : 0 });
    },
    [commitReading, seriesById, writeUrl],
  );

  /** "แปลนิยาย" from anywhere: back to the home page, then into the box. */
  const goTranslate = useCallback(() => {
    if (view !== "home" || chapterRef.current || bookIdRef.current) goView("home");
    requestAnimationFrame(() => {
      document.getElementById("translate")?.scrollIntoView({ behavior: "smooth", block: "center" });
      composerRef.current?.focus();
    });
  }, [view, goView]);

  /** Puts the screen in line with an address — on load, refresh and back/forward. */
  const applyRoute = useCallback(
    /**
     * @param quiet on a miss, report false instead of warning and redirecting —
     *   used against the local cache before the cloud library has arrived
     * @returns whether the address was fully resolved
     */
    async (pathname: string, quiet = false): Promise<boolean> => {
      const studio = parseStudioPath(pathname);
      if (studio) {
        if (chapterRef.current) leaveChapter();
        setBookId(null);
        setView("studio");
        if (!studio.book) {
          setStudioId(null);
          return true;
        }
        const target = resolveBook(studio.book, allSeriesRef.current);
        if (target && target.info?.project) {
          setStudioId(target.id);
          return true;
        }
        if (quiet) return false;
        setStudioId(null);
        writeUrl(studioPath(), "replace");
        return false;
      }

      setView("home");
      setStudioId(null);
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

  const inAppHistory = () => Boolean((window.history.state as { nf?: boolean } | null)?.nf);

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
    if (adopted > 0) push(`ย้ายชั้นหนังสือเดิมเข้าบัญชีนี้แล้ว ${adopted} ตอน`, "success");

    if (!resolved) await applyRoute(window.location.pathname);
  }, [refreshShelves, push, applyRoute]);

  useEffect(() => {
    setMounted(true);
    void (async () => {
      await initCloud();
      await loadLibrary();
    })();
    // Warm the lazily loaded sheets once the page has settled.
    whenIdle(() => {
      void loadSettings();
      void loadGlossary();
      void loadBookInfo();
      void loadPanels();
      void loadStudio();
    });
    // loadLibrary is stable for the lifetime of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);

  /* ------------------------------ the writer ------------------------------ */

  const writer = useWriterJob({
    ring: currentRing,
    effort: writingEffort,
    getSeries: seriesById,
    updateSeries,
    onChapter: (c, settled) => {
      setLive(c);
      setChapter((prev) => (prev && prev.id === c.id ? c : prev));
      if (settled) upsertMeta(c);
      if (followWriteRef.current === c.seriesId && c.status === "translating") {
        followWriteRef.current = null;
        void openChapter(c.id);
      }
    },
    notify: push,
  });
  const writerBusy = writer.state.phase !== "idle";

  const workingNow = translatingNow || writerBusy;

  useEffect(() => {
    if (!busy && !writerBusy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy, writerBusy]);

  /**
   * Asks the device to stay awake while a chapter is being translated or
   * written. A phone that sleeps suspends the page and stalls the stream.
   * Browsers drop the lock whenever the tab is hidden, so it is taken again on
   * every return to the foreground.
   */
  useEffect(() => {
    if (!workingNow) return;

    type Sentinel = { release: () => Promise<void> };
    const api = (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<Sentinel> } }).wakeLock;
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
  }, [workingNow]);

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
      paragraphs: current.paragraphs.map((p) => (updates.has(p.id) ? { ...p, target: updates.get(p.id)! } : p)),
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

  const persist = useCallback(
    (next: Chapter, immediate = false) => {
      jobRef.current = next;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (immediate) {
        void saveChapter(next, true);
        upsertMeta(next);
        return;
      }
      saveTimer.current = setTimeout(() => {
        void saveChapter(jobRef.current ?? next);
      }, 1800);
    },
    [upsertMeta],
  );

  /**
   * Leaving the tab must not strand half-streamed paragraphs in the buffer, and
   * must not lose them if the browser discards the page while it is away.
   */
  useEffect(() => {
    const settle = () => {
      flush();
      const current = jobRef.current;
      if (current) void saveChapter(current, true);
      flushSeriesPush();
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

  /* ------------------------------- pipeline ------------------------------- */

  const translate = useCallback(
    async (target: Chapter, opts: { skipDone?: boolean; skipGlossary?: boolean } = {}) => {
      const controller = new AbortController();
      abortRef.current = controller;
      const { style: currentStyle } = useSettings.getState();

      // The novel this job belongs to, held locally: the reader may open a
      // different novel while this one is still translating.
      let novel: Series | null =
        seriesById(target.seriesId) ?? (target.seriesId ? ((await getSeriesById(target.seriesId)) ?? null) : null);
      // The cover image and any studio plan stay behind — they would ride
      // along on every request.
      const book = novel
        ? { name: novel.name, info: novel.info ? { ...novel.info, cover: undefined, project: undefined } : undefined }
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
            working = { ...working, translatedTitle: result.title || working.translatedTitle };
            setJob({ id: working.id, title: working.translatedTitle || working.title, seriesId: working.seriesId });
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

      const skip = opts.skipDone ? new Set(working.paragraphs.filter((p) => p.target).map((p) => p.id)) : undefined;

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
      const taken = new Set([...queueRef.current.map((q) => q.id), ...(jobRef.current ? [jobRef.current.id] : [])]);
      const fresh = items.filter((i) => !taken.has(i.id));
      if (!fresh.length) return 0;
      queueRef.current = [...queueRef.current, ...fresh];
      setQueue([...queueRef.current]);
      void pump();
      return fresh.length;
    },
    [pump],
  );

  const isQueued = (id: string) => jobRef.current?.id === id || queueRef.current.some((q) => q.id === id);

  const findByUrl = (url: string) => {
    const key = urlKey(url);
    return libraryRef.current.find((c) => c.sourceUrl && urlKey(c.sourceUrl) === key);
  };

  /**
   * Hands a chapter that already exists back to the reader instead of fetching
   * and translating it a second time.
   */
  const reuseExisting = useCallback(
    (existing: ChapterMeta, openAfter: boolean) => {
      if (openAfter) void openChapter(existing.id);
      if (existing.status !== "done" && !isQueued(existing.id)) {
        enqueue([{ id: existing.id, title: existing.translatedTitle || existing.title, opts: { skipDone: true } }]);
      } else if (!openAfter) {
        push("ตอนนี้อยู่ในชั้นหนังสือแล้ว", "info");
      }
    },
    // isQueued reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openChapter, enqueue, push],
  );

  /** Saves a draft then puts it in line to be translated. */
  const queueDraft = useCallback(
    async (draft: Chapter, openAfter: boolean) => {
      await saveChapter(draft, true);
      upsertMeta(draft);
      enqueue([{ id: draft.id, title: draft.title }]);
      if (openAfter) void openChapter(draft.id);
    },
    [enqueue, openChapter, upsertMeta],
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
        let source: Pick<ExtractResult, "title" | "siteName" | "paragraphs" | "nextUrl" | "prevUrl" | "url">;

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
          source = { title: split.title, siteName: null, paragraphs: split.paragraphs, nextUrl: null, prevUrl: null, url: "" };
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
          paragraphs: source.paragraphs.map((text, id) => ({ id, source: text, target: "" })),
          glossary: [],
          status: "draft",
          progress: 0,
          model: config.model,
          targetLanguage: currentStyle.targetLanguage,
          seriesId: novel.id,
        };

        // Long pages cost real money — show the bill before spending it.
        const estimate = estimateJob(source.paragraphs, buildChunks(source.paragraphs).length, config);
        if (estimate.sourceTokens > 9000 && estimate.usd !== null) {
          setConfirm({ draft, estimate, openAfter: Boolean(opts.openAfter) });
          return;
        }

        await queueDraft(draft, Boolean(opts.openAfter));
      } finally {
        if (key) inflight.current.delete(key);
        setFetching((n) => Math.max(0, n - 1));
      }
    },
    // findByUrl reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [push, shelfId, reuseExisting, queueDraft],
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

  const removeChapter = async (id: string) => {
    queueRef.current = queueRef.current.filter((q) => q.id !== id);
    setQueue([...queueRef.current]);
    if (jobRef.current?.id === id) abortRef.current?.abort();
    if (writer.state.chapterId === id) writer.stop();

    // A studio chapter leaves a gap in its plan rather than a dangling id.
    const meta = libraryRef.current.find((c) => c.id === id);
    const owner = meta ? seriesById(meta.seriesId) : null;
    const project = owner?.info?.project;
    const n = plannedNumber(project, id);
    if (owner && project && n !== null) {
      const chapterIds = { ...project.chapterIds };
      delete chapterIds[String(n)];
      await updateSeries({ ...owner, info: { ...owner.info, project: { ...project, chapterIds } } });
    }

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
    const cleared: Chapter = { ...current, paragraphs: current.paragraphs.map((p) => ({ ...p, target: "" })) };
    void saveChapter(cleared, true).then(() =>
      enqueue([{ id: cleared.id, title: cleared.title, opts: { skipGlossary: true } }]),
    );
    setChapter(cleared);
  };

  const fillGaps = () => {
    const current = chapterRef.current;
    if (!current || isQueued(current.id)) return;
    enqueue([{ id: current.id, title: current.translatedTitle || current.title, opts: { skipDone: true, skipGlossary: true } }]);
  };

  const plainText = (c: Chapter) =>
    [c.translatedTitle || c.title, "", ...c.paragraphs.map((p) => p.target)].join("\n\n");

  const copyAll = async () => {
    if (!chapter) return;
    try {
      await navigator.clipboard.writeText(plainText(chapter));
      push("คัดลอกแล้ว", "success");
    } catch {
      push("คัดลอกไม่สำเร็จ", "error");
    }
  };

  const download = () => {
    if (!chapter) return;
    const blob = new Blob([plainText(chapter)], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(chapter.translatedTitle || chapter.title).slice(0, 60)}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoking in the same tick cancels the download in Firefox and Safari.
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
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

    // Nothing from this shelf should stay queued, written or on screen afterwards.
    queueRef.current = queueRef.current.filter((q) => !ids.includes(q.id));
    setQueue([...queueRef.current]);
    if (jobRef.current && ids.includes(jobRef.current.id)) abortRef.current?.abort();
    if (writer.state.seriesId === target.series.id) writer.stop();

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
    const merged = await mergeIntoSeries({ seriesId: from.series.id, chapterIds: from.chapters.map((c) => c.id) }, targetId);
    if (!merged) {
      push("รวมชั้นหนังสือไม่สำเร็จ", "error");
      return;
    }

    setShelfId((id) => (id === from.series.id ? targetId : id));
    setBookId(targetId);
    setChapter((prev) => (prev && prev.seriesId === from.series.id ? { ...prev, seriesId: targetId } : prev));

    await refreshShelves();
    writeUrl(pathForBook(targetId), "replace");
    push(`รวมเข้า “${merged.name}” แล้ว`, "success");
  };

  /* -------------------------------- studio -------------------------------- */

  const needKey = useCallback(() => {
    if (keysFor(useSettings.getState()).length) return false;
    setShowSettings(true);
    push("ใส่ API Key ก่อนเริ่มเขียน", "error");
    return true;
  }, [push]);

  /** Studio edits apply at once and are saved a moment after typing stops. */
  const patchProject = useCallback(
    (id: string, patch: Partial<WritingProject>, name?: string) => {
      const target = seriesById(id);
      const project = target?.info?.project;
      if (!target || !project) return;
      const next: Series = {
        ...target,
        name: name !== undefined ? name : target.name,
        info: {
          ...target.info,
          ...(patch.tags ? { genres: patch.tags } : {}),
          project: { ...project, ...patch },
        },
      };
      allSeriesRef.current = allSeriesRef.current.map((s) => (s.id === id ? next : s));
      setAllSeries(allSeriesRef.current);

      const timers = projectTimers.current;
      const pending = timers.get(id);
      if (pending) clearTimeout(pending);
      timers.set(
        id,
        setTimeout(() => {
          timers.delete(id);
          const latest = seriesById(id);
          if (!latest) return;
          const fixed = latest.name.trim() ? latest : { ...latest, name: UNTITLED };
          void saveSeries(fixed);
        }, 800),
      );
    },
    [seriesById],
  );

  const createProject = useCallback(
    async (draft: NewProjectDraft) => {
      if (needKey()) return;
      const id = crypto.randomUUID();
      const now = Date.now();
      const style = authorStyle(draft.project.styleId);
      const series: Series = {
        id,
        key: `studio:${id}`,
        name: draft.title || UNTITLED,
        glossary: [],
        info: {
          synopsis: draft.project.synopsis.trim(),
          blurb: draft.project.blurb.trim() || undefined,
          genres: draft.project.tags.length ? draft.project.tags : undefined,
          author: `AI · สำนวน ${style.label}`,
          status: "ongoing",
          project: draft.project,
        },
        createdAt: now,
        updatedAt: now,
      };
      await updateSeries(series);
      const { clearStudioDraft } = await import("@/components/studio/NewProject");
      clearStudioDraft();
      setStudioId(id);
      writeUrl(studioPath(series, allSeriesRef.current), "push");
      window.scrollTo({ top: 0 });
      void writer.plan(id);
    },
    [needKey, updateSeries, writeUrl, writer],
  );

  const planProject = useCallback(
    (id: string, upTo?: number) => {
      if (needKey()) return;
      void writer.plan(id, upTo);
    },
    [needKey, writer],
  );

  const writeChapters = useCallback(
    (id: string, numbers: number[]) => {
      if (needKey()) return;
      void writer.write(id, numbers);
    },
    [needKey, writer],
  );

  const deleteProject = useCallback(
    async (id: string) => {
      if (writer.state.seriesId === id) writer.stop();
      const ids = libraryRef.current.filter((c) => c.seriesId === id).map((c) => c.id);
      await deleteShelf(id, ids);
      let marks = readingRef.current;
      for (const cid of ids) marks = forgetChapter(marks, cid);
      commitReading(marks, true);
      await refreshShelves();
      setStudioId(null);
      writeUrl(studioPath(), "replace");
      push("ลบโปรเจกต์แล้ว", "success");
    },
    [writer, commitReading, refreshShelves, writeUrl, push],
  );

  /* ------------------------------ derived data ----------------------------- */

  const shelves = useMemo(() => buildShelves(allSeries, library), [allSeries, library]);
  const queuedIds = useMemo(() => new Set(queue.map((q) => q.id)), [queue]);
  const chaptersBySeries = useMemo(() => {
    const map = new Map<string, ChapterMeta[]>();
    for (const c of library) {
      const list = map.get(c.seriesId);
      if (list) list.push(c);
      else map.set(c.seriesId, [c]);
    }
    return map;
  }, [library]);
  const projects = useMemo(
    () => allSeries.filter((s) => s.info?.project).sort((a, b) => (b.info!.project!.createdAt ?? 0) - (a.info!.project!.createdAt ?? 0)),
    [allSeries],
  );

  // A project renamed while open (by hand, or by the AI proposing a title)
  // keeps its address in step, so a refresh lands on the same project.
  const studioName = studioId ? (allSeries.find((s) => s.id === studioId)?.name ?? null) : null;
  useEffect(() => {
    if (view !== "studio" || !studioId || !studioName?.trim() || chapter || bookId) return;
    const series = allSeriesRef.current.find((s) => s.id === studioId);
    if (series) writeUrl(studioPath(series, allSeriesRef.current), "replace");
  }, [view, studioId, studioName, chapter, bookId, writeUrl]);

  const missing = chapter?.paragraphs.filter((p) => !p.target && p.source.trim()).length ?? 0;
  const chapterSeries = chapter ? (allSeries.find((s) => s.id === chapter.seriesId) ?? null) : null;
  const glossarySeries = allSeries.find((s) => s.id === glossarySeriesId) ?? null;
  const infoSeries = allSeries.find((s) => s.id === infoSeriesId) ?? null;
  const openShelf = bookId ? (shelves.find((s) => (s.series.id || ORPHANS) === bookId) ?? null) : null;

  const writingThis = Boolean(chapter && writer.state.phase === "writing" && writer.state.chapterId === chapter.id);
  const chrome = useReaderScroll(viewingJob || writingThis, chapter?.id ?? null);

  /**
   * Records how far down the open chapter the reader has got. Past the
   * threshold in reading.ts the chapter flips to "read" on its own. Only a
   * measurement taken for *this* chapter counts — see useReaderScroll.
   */
  useEffect(() => {
    const id = chapter?.id;
    if (!id || chrome.key !== id) return;
    commitReading(progressMark(readingRef.current, id, chrome.progress));
  }, [chapter?.id, chrome.key, chrome.progress, commitReading]);

  // Neighbours within the same novel, in reading order, so the reader can walk
  // a shelf the way a novel site lets you walk a table of contents.
  const siblings = useMemo(() => {
    if (!chapter) return { prev: null as ChapterMeta | null, next: null as ChapterMeta | null };
    const list = shelves.find((sh) => (sh.series.id || "") === (chapter.seriesId || ""))?.chapters ?? [];
    const at = list.findIndex((c) => c.id === chapter.id);
    if (at === -1) return { prev: null as ChapterMeta | null, next: null as ChapterMeta | null };
    return { prev: list[at - 1] ?? null, next: list[at + 1] ?? null };
  }, [chapter, shelves]);

  /**
   * For a studio novel: the first chapter that is not finished yet. It may
   * not be planned yet either — the writer plans it just in time.
   */
  const nextPlanned = useCallback(
    (series: Series | null): number | null => {
      const project = series?.info?.project;
      if (!project?.outline) return null;
      const metas = chaptersBySeries.get(series!.id) ?? [];
      return nextToWrite(project, new Set(metas.filter((m) => m.status === "done").map((m) => m.id)));
    },
    [chaptersBySeries],
  );

  const chapterOriginal = Boolean(chapterSeries && isOriginal(chapterSeries));
  const readerNextPlanned = chapterOriginal ? nextPlanned(chapterSeries) : null;
  const nextMode: NextMode = siblings.next
    ? "chapter"
    : chapter?.nextUrl
      ? "fetch"
      : readerNextPlanned !== null
        ? "write"
        : "none";
  const fetchingNext =
    nextMode === "write"
      ? writerBusy
      : Boolean(chapter?.nextUrl && inflight.current.has(urlKey(chapter.nextUrl)));

  const shelfOptions: ShelfOption[] = useMemo(
    () => shelves.filter((s) => s.series.id && !isOriginal(s.series)).map((s) => ({ series: s.series, chapterCount: s.chapters.length })),
    [shelves],
  );

  /** What is running for each novel, for the badges on the shelf. */
  const activity = useMemo(() => {
    const map: Record<string, string> = {};
    if (job) map[job.seriesId] = "กำลังแปล";
    if (writer.state.seriesId && writerBusy) map[writer.state.seriesId] = writer.state.phase === "outline" ? "วางโครง" : "กำลังเขียน";
    return map;
  }, [job, writer.state.seriesId, writer.state.phase, writerBusy]);

  const jobLabel = notice
    ? notice
    : `${PHASE_LABEL[phase] || "กำลังทำงาน"}${phase === "translating" ? ` ${Math.round(progress * 100)}%` : ""}`;

  const writerLabel =
    writer.state.phase === "outline"
      ? "กำลังวางโครงเรื่อง…"
      : `กำลังเขียนตอนที่ ${writer.state.current ?? ""}${writer.state.total > 1 ? ` (${writer.state.done + 1}/${writer.state.total})` : ""}`;

  const jobPill: JobPill | null = writerBusy
    ? {
        kind: "write",
        label: writer.state.notice ?? writerLabel,
        progress:
          writer.state.phase === "outline"
            ? writer.state.done / Math.max(1, writer.state.total)
            : (writer.state.done + (live?.progress ?? 0)) / Math.max(1, writer.state.total),
        onOpen: () => goView("studio", writer.state.seriesId),
      }
    : job || queue.length
      ? {
          kind: "translate",
          label: `${job?.title ?? "กำลังเตรียมคิว…"} · ${jobLabel}`,
          progress: phase === "translating" ? progress : null,
          onOpen: job ? () => void openChapter(job.id) : undefined,
        }
      : null;

  /** Drops every trace of the previous reader before the next one signs in. */
  const handleSignedOut = () => {
    stop();
    writer.stop();
    setChapter(null);
    setBookId(null);
    setView("home");
    setStudioId(null);
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
  if (!mounted || cloud.status === "connecting") return <BootSkeleton />;

  // Offline or a failed sync keeps the reader in the app on their cached
  // library; only "nobody is signed in" sends them to the login.
  if (cloud.status === "signedOut" || (cloud.status === "error" && !cloud.userId)) {
    return <AuthGate onSignedIn={() => void loadLibrary()} />;
  }

  const sheets = (
    <>
      {showSettings ? <SettingsSheet open onClose={() => setShowSettings(false)} /> : null}
      {showType ? <TypographySheet open onClose={() => setShowType(false)} /> : null}
      {showGlossary && glossarySeries ? (
        <GlossarySheet
          open
          onClose={() => setShowGlossary(false)}
          seriesName={glossarySeries.name}
          glossary={glossarySeries.glossary}
          onChange={setGlossary}
          onNotify={push}
          onRetranslate={
            chapter && chapter.seriesId === glossarySeries.id && !viewingJob && !chapterOriginal ? retranslate : undefined
          }
        />
      ) : null}
      {infoSeries ? (
        <BookInfoSheet series={infoSeries} onClose={() => setInfoSeriesId(null)} onSave={(d) => void saveBookInfo(d)} />
      ) : null}
      {showLibrary ? (
        <LibrarySheet
          open
          onClose={() => setShowLibrary(false)}
          chapters={library}
          currentId={chapter?.id ?? null}
          onOpenChapter={(id) => void openChapter(id)}
          onDelete={(id) => void removeChapter(id)}
          onRefresh={() => void refreshShelves()}
        />
      ) : null}
      {showAccount ? (
        <AccountSheet open onClose={() => setShowAccount(false)} onNotify={push} onSignedOut={handleSignedOut} />
      ) : null}
      {showPdf ? (
        <PdfImport
          open
          onClose={() => setShowPdf(false)}
          shelves={shelfOptions}
          config={useSettings.getState().config}
          onImport={(result) => void importPdf(result)}
        />
      ) : null}
      <CostGate
        pending={confirm}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const pending = confirm;
          setConfirm(null);
          if (pending) void queueDraft(pending.draft, pending.openAfter);
        }}
      />
      <ConfirmDialog
        open={rewriteAsk !== null}
        title={`เขียนตอนที่ ${rewriteAsk?.n ?? ""} ใหม่?`}
        confirmLabel="เขียนใหม่"
        onCancel={() => setRewriteAsk(null)}
        onConfirm={() => {
          const ask = rewriteAsk;
          setRewriteAsk(null);
          if (ask) writeChapters(ask.seriesId, [ask.n]);
        }}
        body="เนื้อหาเดิมของตอนนี้จะถูกแทนที่ด้วยฉบับที่ AI เขียนใหม่ตามแผนปัจจุบัน"
      />
      <ToastStack toasts={toasts} />
    </>
  );

  /* ------------------------------- reader -------------------------------- */

  if (chapter) {
    const style = chapterSeries?.info?.project ? authorStyle(chapterSeries.info.project.styleId) : null;
    const readerBusy = viewingJob || writingThis;
    const goNext = () => {
      if (siblings.next) void openChapter(siblings.next.id);
      else if (chapter.nextUrl) {
        autoChainRef.current = 0;
        void start(chapter.nextUrl, "url", { seriesId: chapter.seriesId, openAfter: true });
      } else if (readerNextPlanned !== null && chapterSeries) {
        if (needKey()) return;
        followWriteRef.current = chapterSeries.id;
        void writer.write(chapterSeries.id, [readerNextPlanned]);
      }
    };
    const thisNumber = plannedNumber(chapterSeries?.info?.project, chapter.id);

    return (
      <main className="relative z-10 min-h-dvh" style={{ background: "var(--reader-bg)" }}>
        <ReaderHeader
          chapter={chapter}
          seriesName={chapterSeries?.name ?? null}
          visible={chrome.visible}
          busy={readerBusy}
          busyLabel={
            writingThis
              ? writer.state.notice ?? `กำลังเขียน… ${writer.state.chars.toLocaleString()} ตัวอักษร`
              : jobLabel
          }
          progress={writingThis ? chapter.progress : progress}
          width={reader.maxWidth}
          showSource={reader.showSource}
          original={chapterOriginal}
          // Going back leaves the job running in the background.
          onBack={backFromChapter}
          onStop={writingThis ? writer.stop : stop}
          onToggleSource={() => setReader({ showSource: !reader.showSource })}
          onGlossary={() => openGlossaryFor(chapter.seriesId)}
          onTypography={() => setShowType(true)}
        />

        <Reader
          chapter={chapter}
          prefs={reader}
          streaming={(viewingJob && phase === "translating") || writingThis}
          waiting={queuedIds.has(chapter.id) || (viewingJob && phase === "preparing")}
          seriesName={chapterSeries?.name ?? null}
          byline={style ? `เขียนโดย AI · สำนวน ${style.label}` : null}
          footer={
            readerBusy ? null : (
              <EndOfChapter
                nextLabel={
                  nextMode === "chapter"
                    ? `อ่าน${siblings.next ? ` ${siblings.next.translatedTitle || siblings.next.title}` : "ตอนถัดไป"}`
                    : nextMode === "fetch"
                      ? "ดึงและแปลตอนถัดไป"
                      : nextMode === "write"
                        ? `ให้ AI เขียนตอนที่ ${readerNextPlanned}`
                        : null
                }
                nextKind={nextMode}
                busy={fetchingNext}
                onNext={goNext}
                onToc={backFromChapter}
              />
            )
          }
        />

        <ReaderDock
          visible={chrome.visible}
          progress={chrome.progress}
          busy={readerBusy || queuedIds.has(chapter.id)}
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
          onNext={goNext}
          onCopy={copyAll}
          onDownload={download}
        />

        <ReaderToolsSheet
          open={showTools}
          onClose={() => setShowTools(false)}
          glossaryCount={chapterSeries?.glossary.length ?? chapter.glossary.length}
          missing={readerBusy ? 0 : missing}
          showSource={reader.showSource}
          original={chapterOriginal}
          onToggleSource={(v) => setReader({ showSource: v })}
          onCopy={copyAll}
          onDownload={download}
          onFillGaps={fillGaps}
          onGlossary={() => openGlossaryFor(chapter.seriesId)}
          onTypography={() => setShowType(true)}
          onRewrite={
            chapterOriginal && thisNumber !== null && !writerBusy && chapterSeries
              ? () => setRewriteAsk({ seriesId: chapterSeries.id, n: thisNumber })
              : undefined
          }
        />
        {sheets}
      </main>
    );
  }

  /* ------------------------------ novel page ------------------------------ */

  if (openShelf) {
    const series = openShelf.series;
    const n = isOriginal(series) ? nextPlanned(series) : null;
    return (
      <>
        <BookPage
          shelf={openShelf}
          shelves={shelves}
          marks={reading.marks}
          currentId={reading.current}
          busyId={job?.id ?? (writerBusy ? writer.state.chapterId : null)}
          queuedIds={queuedIds}
          writeNext={
            n !== null
              ? {
                  label: writerBusy && writer.state.seriesId === series.id ? "กำลังเขียน…" : `เขียนตอนที่ ${n}`,
                  run: () => writeChapters(series.id, [n]),
                  disabled: writerBusy,
                }
              : null
          }
          onBack={backFromBook}
          onOpenChapter={(id) => void openChapter(id)}
          onOpenGlossary={() => openGlossaryFor(series.id)}
          onEditInfo={() => setInfoSeriesId(series.id || null)}
          onDeleteChapter={(id) => void removeChapter(id)}
          onMerge={(from, targetId) => void mergeShelf(from, targetId)}
          onDeleteShelf={(target) => void removeShelf(target)}
          onStudio={() => goView("studio", series.id)}
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
        {jobPill ? <FloatingJob pill={jobPill} onStop={jobPill.kind === "write" ? writer.stop : stop} /> : null}
        {sheets}
      </>
    );
  }

  /* ---------------------------- home and studio --------------------------- */

  return (
    <>
      <TopNav
        view={view}
        onNavigate={(v) => goView(v)}
        onTranslate={goTranslate}
        onHistory={() => setShowLibrary(true)}
        onSettings={() => setShowSettings(true)}
        onAccount={() => setShowAccount(true)}
        username={cloud.status === "disabled" ? null : cloud.username}
        needsKey={!hasKey}
        theme={theme}
        onTheme={setTheme}
        job={jobPill}
      />

      {view === "studio" ? (
        <Studio
          projects={projects}
          chaptersOf={(id) => chaptersBySeries.get(id) ?? []}
          activeId={studioId}
          writer={writer.state}
          live={live}
          hasKey={hasKey}
          onSelect={(id) => {
            setStudioId(id);
            writeUrl(studioPath(id ? seriesById(id) : null, allSeriesRef.current), "push");
            window.scrollTo({ top: 0 });
          }}
          onCreate={(d) => void createProject(d)}
          onPatch={patchProject}
          onPlan={planProject}
          onWrite={writeChapters}
          onStop={writer.stop}
          onOpenChapter={(id) => void openChapter(id)}
          onOpenBook={(id) => openBook(id)}
          onDelete={(id) => void deleteProject(id)}
          onOpenSettings={() => setShowSettings(true)}
        />
      ) : (
        <Home
          shelves={shelves}
          marks={reading.marks}
          activity={activity}
          composerRef={composerRef}
          composer={{
            busy: fetching > 0,
            onSubmit: (input, kind) => void start(input, kind),
            onOpenSettings: () => setShowSettings(true),
            shelves: shelfOptions,
            shelfId,
            onShelfChange: setShelfId,
            onImportPdf: () => setShowPdf(true),
          }}
          jobBanner={
            job || queue.length ? (
              <JobBanner
                title={job?.title ?? "กำลังเตรียมคิว…"}
                label={jobLabel}
                progress={phase === "translating" ? progress : 0}
                waiting={queue.length}
                onOpen={job ? () => void openChapter(job.id) : undefined}
                onStop={stop}
              />
            ) : null
          }
          onOpenBook={openBook}
          onOpenChapter={(id) => void openChapter(id)}
          onStudio={() => goView("studio")}
        />
      )}

      <MobileTabBar
        view={view}
        onNavigate={(v) => goView(v)}
        onTranslate={goTranslate}
        onHistory={() => setShowLibrary(true)}
        job={jobPill}
      />
      {sheets}
    </>
  );
}

/* ------------------------------- sub-views -------------------------------- */

/** The shape of the page while we find out whose library it is. */
function BootSkeleton() {
  return (
    <div className="relative z-10 min-h-dvh" aria-busy="true" aria-label="กำลังโหลด">
      <div className="glass sticky top-0 z-40 border-b border-[var(--line-soft)]">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-3 px-4 sm:px-6">
          <Skeleton className="h-8 w-8 rounded-[11px]" />
          <Skeleton className="h-4 w-28" />
          <div className="flex-1" />
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-9 w-9 rounded-full" />
        </div>
      </div>
      <ViewSkeleton />
    </div>
  );
}

function ViewSkeleton() {
  return (
    <div className="mx-auto grid max-w-[1180px] gap-10 px-4 pt-10 sm:px-6 lg:grid-cols-2">
      <div className="space-y-4">
        <Skeleton className="h-6 w-56 rounded-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="mt-6 h-36 w-full rounded-[26px]" />
      </div>
      <div className="hidden place-items-center lg:grid">
        <Loader2 size={24} className="animate-spin text-[var(--fg-dim)]" />
      </div>
    </div>
  );
}

/** The last thing in a chapter: a clear way on to the next one. */
function EndOfChapter({
  nextLabel,
  nextKind,
  busy,
  onNext,
  onToc,
}: {
  nextLabel: string | null;
  nextKind: NextMode;
  busy: boolean;
  onNext: () => void;
  onToc: () => void;
}) {
  return (
    <div className="text-center">
      <div className="ornament mx-auto max-w-[320px] text-[13px]">
        <span className="font-serif font-semibold">จบตอน</span>
      </div>
      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        {nextLabel ? (
          <Button
            variant={nextKind === "write" ? "magic" : "accent-solid"}
            size="lg"
            onClick={onNext}
            disabled={busy}
            className="w-full max-w-[380px] sm:w-auto"
          >
            {busy ? (
              <Loader2 size={16} className="animate-spin" />
            ) : nextKind === "write" ? (
              <PenLine size={16} />
            ) : (
              <ChevronRight size={17} />
            )}
            <span className="truncate">{nextLabel}</span>
          </Button>
        ) : (
          <p className="text-[13.5px] text-[var(--fg-muted)]">นี่คือตอนล่าสุดบนชั้นหนังสือแล้ว</p>
        )}
        <Button variant="outline" size="lg" onClick={onToc} className="w-full max-w-[380px] sm:w-auto">
          <BookOpen size={16} /> สารบัญ
        </Button>
      </div>
    </div>
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
    <div className="rise gilded flex items-center gap-3 rounded-2xl bg-[var(--bg-elev)]/85 p-3.5 shadow-[var(--shadow-card)] backdrop-blur">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)]">
        <Loader2 size={18} className="animate-spin text-[var(--accent)]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium">{title}</p>
        <p className="mt-0.5 truncate text-[12px] text-[var(--accent)]">
          {label}
          {waiting > 0 ? ` · รออีก ${waiting} ตอน` : ""}
        </p>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--line)]">
          <div className="bar-live h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      </div>
      {onOpen ? (
        <Button variant="ghost" size="sm" onClick={onOpen} className="shrink-0">
          เปิดอ่าน
        </Button>
      ) : null}
      <Button variant="ghost" size="icon" onClick={onStop} aria-label="หยุดแปล">
        <StopCircle size={18} className="text-[var(--danger)]" />
      </Button>
    </div>
  );
}

/** The running job, pinned to the foot of pages that have no nav bar. */
function FloatingJob({ pill, onStop }: { pill: JobPill; onStop: () => void }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[680px] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="rise gilded glass flex items-center gap-3 rounded-2xl p-3 shadow-[0_16px_40px_-12px_rgba(0,0,0,.6)]">
        <Loader2 size={18} className="shrink-0 animate-spin text-[var(--accent)]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{pill.label}</p>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--line)]">
            <div className="bar-live h-full rounded-full" style={{ width: `${Math.round((pill.progress ?? 0.12) * 100)}%` }} />
          </div>
        </div>
        {pill.onOpen ? (
          <Button variant="ghost" size="sm" onClick={pill.onOpen} className="shrink-0">
            {pill.kind === "write" ? "สตูดิโอ" : "เปิดอ่าน"}
            <ArrowLeft size={13} className="rotate-180" />
          </Button>
        ) : null}
        <Button variant="ghost" size="icon" onClick={onStop} aria-label="หยุด">
          <StopCircle size={18} className="text-[var(--danger)]" />
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
              <dd className="text-[15px] font-semibold">{draft.paragraphs.length.toLocaleString()}</dd>
            </div>
            <div className="rounded-xl bg-[var(--bg)] py-2.5">
              <dt className="text-[11px] text-[var(--fg-dim)]">โทเคน</dt>
              <dd className="text-[15px] font-semibold">{Math.round(estimate.sourceTokens / 1000).toLocaleString()}K</dd>
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

