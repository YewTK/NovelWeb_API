"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BookMarked,
  Columns2,
  Copy,
  Download,
  Languages,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  StopCircle,
  UserRound,
  RefreshCw,
} from "lucide-react";
import { Composer } from "@/components/Composer";
import {
  Bookshelf,
  ShelfSheet,
  buildShelves,
  type Shelf,
} from "@/components/Bookshelf";
import { Reader } from "@/components/Reader";
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
  listSeries,
  pullChapters,
  pullSeries,
  saveChapter,
  saveSeries,
} from "@/lib/repo";
import { deriveSeries } from "@/lib/series";
import { cleanGlossary, mergeGlossary } from "@/lib/glossary";
import { useSettings } from "@/lib/store";
import { runGlossaryPass, runTranslation } from "@/lib/translator";
import type {
  Chapter,
  ExtractResult,
  GlossaryEntry,
  Series,
} from "@/lib/types";
import { cn, normalizeUrl } from "@/lib/utils";

type Phase = "idle" | "extracting" | "preparing" | "translating";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "",
  extracting: "กำลังดึงเนื้อหา…",
  preparing: "กำลังจับคำศัพท์…",
  translating: "กำลังแปล…",
};

export default function Page() {
  const { config, style, reader, theme, setReader } = useSettings();
  const { toasts, push } = useToasts();
  const cloud = useCloudState();

  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [library, setLibrary] = useState<Chapter[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [mounted, setMounted] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [showType, setShowType] = useState(false);
  const [showGlossary, setShowGlossary] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [confirm, setConfirm] = useState<{ draft: Chapter; estimate: Estimate } | null>(
    null,
  );

  const [series, setSeries] = useState<Series | null>(null);
  const [allSeries, setAllSeries] = useState<Series[]>([]);
  const [openShelf, setOpenShelf] = useState<Shelf | null>(null);
  const [glossarySeries, setGlossarySeries] = useState<Series | null>(null);

  const chapterRef = useRef<Chapter | null>(null);
  const seriesRef = useRef<Series | null>(null);
  const glossaryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const buffered = useRef(new Map<number, string>());
  const rafRef = useRef<number | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  chapterRef.current = chapter;
  const busy = phase !== "idle";

  /* ------------------------------- bootstrap ------------------------------ */

  const refreshShelves = useCallback(async () => {
    const [chapters, novels] = await Promise.all([listChapters(), listSeries()]);
    setLibrary(chapters);
    setAllSeries(novels);
  }, []);

  useEffect(() => {
    setMounted(true);
    void (async () => {
      await refreshShelves();
      await initCloud();
      await pullChapters();
      await pullSeries();
      await refreshShelves();
    })();
  }, [refreshShelves]);

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

  /* ---------------------------- streaming writes -------------------------- */

  const flush = useCallback(() => {
    rafRef.current = null;
    const updates = buffered.current;
    if (!updates.size) return;
    buffered.current = new Map();
    setChapter((prev) =>
      prev
        ? {
            ...prev,
            paragraphs: prev.paragraphs.map((p) =>
              updates.has(p.id) ? { ...p, target: updates.get(p.id)! } : p,
            ),
            updatedAt: Date.now(),
          }
        : prev,
    );
  }, []);

  const schedule = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(flush);
  }, [flush]);

  const persist = useCallback((next: Chapter, immediate = false) => {
    chapterRef.current = next;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (immediate) {
      void saveChapter(next, true).then(() => void refreshShelves());
      return;
    }
    saveTimer.current = setTimeout(() => {
      void saveChapter(chapterRef.current ?? next);
    }, 1800);
  }, [refreshShelves]);

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
      setChapter(working);
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
            setChapter(working);
            persist(working, true);
            await persistSeriesGlossary(merged);
          }
        } catch (e) {
          setPhase("idle");
          const message = e instanceof Error ? e.message : "เตรียมคำศัพท์ไม่สำเร็จ";
          push(message, "error");
          const failed = { ...working, status: "error" as const };
          setChapter(failed);
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
          const current = chapterRef.current;
          if (current) persist({ ...current, progress: ratio });
        },
        onError: (message) => {
          failure = message;
        },
      });

      flush();
      setPhase("idle");
      abortRef.current = null;

      const finished = chapterRef.current ?? working;
      const done = finished.paragraphs.every((p) => p.target);
      const final: Chapter = {
        ...finished,
        status: failure ? "error" : done ? "done" : "draft",
        progress: 1,
        updatedAt: Date.now(),
      };
      setChapter(final);
      persist(final, true);

      if (failure) {
        push(failure, "error");
        if (/API Key/.test(failure)) setShowSettings(true);
      } else if (controller.signal.aborted) {
        push("หยุดแปลแล้ว");
      } else {
        push("แปลเสร็จแล้ว", "success");
      }
    },
    [config, style, persist, push, schedule, flush, persistSeriesGlossary],
  );

  const start = useCallback(
    async (input: string, kind: "url" | "text") => {
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
      const novel = await ensureSeries(
        deriveSeries(source.title, source.url || null),
      );
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

      await translate(draft);
    },
    [config, style, push, translate],
  );

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase("idle");
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
      window.scrollTo({ top: 0 });
    }
  };

  const removeChapter = async (id: string) => {
    await repoDelete(id);
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

  const missing = chapter?.paragraphs.filter((p) => !p.target).length ?? 0;
  const shelves = buildShelves(allSeries, library);

  /* --------------------------------- views -------------------------------- */

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
        />

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
          }}
        />
        <ShelfSheet
          shelf={openShelf}
          onClose={() => setOpenShelf(null)}
          onOpenChapter={openChapter}
          onOpenGlossary={openGlossaryFor}
          onDeleteChapter={removeChapter}
        />
        <CostGate
          pending={confirm}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const job = confirm;
            setConfirm(null);
            if (job) void translate(job.draft);
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
      <header className="sticky top-0 z-30 border-b border-[var(--line-soft)] bg-[var(--reader-bg)]/85 backdrop-blur-xl">
        <div
          className="mx-auto flex h-14 items-center gap-1 px-3 sm:px-5"
          style={{ maxWidth: `${Math.max(reader.maxWidth, 720) + 120}px` }}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              stop();
              setChapter(null);
            }}
            aria-label="กลับหน้าแรก"
          >
            <ArrowLeft size={18} />
          </Button>

          <div className="min-w-0 flex-1 px-1">
            <p className="truncate text-[13px] font-medium">
              {chapter.translatedTitle || chapter.title}
            </p>
            {busy ? (
              <p className="flex items-center gap-1.5 text-[11.5px] text-[var(--accent)]">
                <span className="dot-live inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                {PHASE_LABEL[phase]}
                {phase === "translating" ? ` ${Math.round(progress * 100)}%` : ""}
              </p>
            ) : (
              <p className="truncate text-[11.5px] text-[var(--fg-dim)]">
                {chapter.siteName ?? "ข้อความที่วางไว้"}
              </p>
            )}
          </div>

          {busy ? (
            <Button variant="ghost" size="icon" onClick={stop} aria-label="หยุดแปล">
              <StopCircle size={18} className="text-red-400" />
            </Button>
          ) : null}

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setReader({ showSource: !reader.showSource })}
            aria-label="แสดงต้นฉบับ"
            className={cn(reader.showSource && "text-[var(--accent)]")}
          >
            <Columns2 size={17} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => openGlossaryFor(series)}
            aria-label="คลังคำศัพท์"
          >
            <Languages size={17} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowType(true)}
            aria-label="การแสดงผล"
          >
            <SlidersHorizontal size={17} />
          </Button>
        </div>

        <div
          className="h-[2px] bg-[var(--accent)] transition-[width] duration-500 ease-out"
          style={{ width: `${(busy ? progress : 1) * 100}%`, opacity: busy ? 1 : 0 }}
        />
      </header>

      <Reader chapter={chapter} prefs={reader} streaming={phase === "translating"} />

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center bg-gradient-to-t from-[var(--reader-bg)] via-[var(--reader-bg)]/90 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8">
        <div className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--bg-elev)]/95 p-1.5 shadow-2xl backdrop-blur-xl">
          <Button
            variant="ghost"
            size="sm"
            onClick={copyAll}
            disabled={busy}
            aria-label="คัดลอกคำแปล"
          >
            <Copy size={14} />
            <span className="hidden sm:inline">คัดลอก</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={download}
            disabled={busy}
            aria-label="บันทึกเป็นไฟล์"
          >
            <Download size={14} />
            <span className="hidden sm:inline">บันทึกไฟล์</span>
          </Button>

          {!busy && missing > 0 ? (
            <Button
              variant="subtle"
              size="sm"
              onClick={fillGaps}
              aria-label={`แปลย่อหน้าที่ค้าง ${missing} ย่อหน้า`}
            >
              <RefreshCw size={14} />
              <span className="hidden sm:inline">แปลที่ค้าง</span> {missing}
            </Button>
          ) : null}

          {!busy && chapter.nextUrl ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => start(chapter.nextUrl!, "url")}
            >
              <Sparkles size={14} /> ตอนถัดไป
            </Button>
          ) : null}
        </div>
      </div>

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
        }}
      />
      <CostGate
        pending={confirm}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const job = confirm;
          setConfirm(null);
          if (job) void translate(job.draft);
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
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--accent)] text-[13px] text-[#0a0c14]">
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
              <dd className="text-[15px] font-semibold text-[#ffb057]">
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
