"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowUpToLine,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Copy,
  Download,
  DownloadCloud,
  Languages,
  Loader2,
  MoreHorizontal,
  PenLine,
  RefreshCw,
  SlidersHorizontal,
  StopCircle,
} from "lucide-react";
import type { Chapter } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button, Sheet, Switch } from "./ui";

/**
 * Reading chrome gets out of the way while the reader moves down the page and
 * comes back the moment they scroll up, so a phone screen is mostly prose.
 * It stays pinned whenever `locked` is set — during a translation the page is
 * still growing and the stop button has to stay reachable.
 *
 * Progress is reported against `key` (the chapter on screen) and in half-
 * percent steps. Keying it fixes a real bug: moving from the bottom of one
 * chapter to the next used to hand the new chapter the old 100% before the
 * scroll reset registered, marking it read the instant it opened. The steps
 * stop every scrolled pixel from re-rendering the whole page.
 */
export function useReaderScroll(locked: boolean, key: string | null) {
  const [state, setState] = useState<{ visible: boolean; progress: number; key: string | null }>({
    visible: true,
    progress: 0,
    key,
  });
  const anchor = useRef(0);
  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    let frame = 0;

    const measure = () => {
      frame = 0;
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const progress = max > 8 ? Math.round(Math.min(1, Math.max(0, y / max)) * 200) / 200 : 0;

      const delta = y - anchor.current;
      let visible: boolean | null = null;
      // The head and foot of a chapter are exactly where the controls are
      // wanted, so never hide them there.
      if (y < 96 || max - y < 96) {
        visible = true;
        anchor.current = y;
      } else if (Math.abs(delta) > 24) {
        visible = delta < 0;
        anchor.current = y;
      }

      const k = keyRef.current;
      setState((s) => {
        const v = visible ?? s.visible;
        return s.progress === progress && s.visible === v && s.key === k ? s : { visible: v, progress, key: k };
      });
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    frame = requestAnimationFrame(measure);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
    // Re-measure from scratch for every chapter.
  }, [key]);

  // Until the new chapter has been measured, report nothing for it.
  const fresh = state.key === key;
  return {
    visible: locked || !fresh || state.visible,
    progress: fresh ? state.progress : 0,
    key: fresh ? key : null,
  };
}

/* --------------------------------- header -------------------------------- */

export function ReaderHeader({
  chapter,
  seriesName,
  visible,
  busy,
  busyLabel,
  progress,
  width,
  showSource,
  original,
  onBack,
  onStop,
  onToggleSource,
  onGlossary,
  onTypography,
}: {
  chapter: Chapter;
  /** the novel this chapter belongs to */
  seriesName: string | null;
  visible: boolean;
  busy: boolean;
  busyLabel: string;
  /** translation or writing progress, not reading progress */
  progress: number;
  width: number;
  showSource: boolean;
  /** written in the studio: there is no source text to show */
  original: boolean;
  onBack: () => void;
  onStop: () => void;
  onToggleSource: () => void;
  onGlossary: () => void;
  onTypography: () => void;
}) {
  return (
    <header
      className={cn(
        "glass fixed inset-x-0 top-0 z-30 border-b border-[var(--line-soft)] pt-[env(safe-area-inset-top)]",
        "transition-transform duration-300 ease-out will-change-transform",
        !visible && "-translate-y-full",
      )}
      style={{ background: "color-mix(in oklab, var(--reader-bg) 82%, transparent)" }}
    >
      <div className="mx-auto flex h-[3.25rem] items-center gap-1 px-2 sm:h-14 sm:px-5" style={{ maxWidth: `${Math.max(width, 720) + 120}px` }}>
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="กลับ">
          <ArrowLeft size={18} />
        </Button>

        <div className="min-w-0 flex-1 px-1">
          <p className="truncate text-[13px] font-medium">{chapter.translatedTitle || chapter.title}</p>
          {busy ? (
            <p className="flex min-w-0 items-center gap-1.5 truncate text-[11.5px] text-[var(--accent)]">
              <span className="dot-live inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              {busyLabel}
            </p>
          ) : (
            <p className="truncate text-[11.5px] text-[var(--fg-dim)]">{seriesName ?? chapter.siteName ?? "ข้อความที่วางไว้"}</p>
          )}
        </div>

        {busy ? (
          <Button variant="ghost" size="icon" onClick={onStop} aria-label="หยุด">
            <StopCircle size={18} className="text-[var(--danger)]" />
          </Button>
        ) : null}

        {/* On a phone these live in the tools sheet instead — the title needs the room. */}
        <div className="hidden items-center sm:flex">
          {!original ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleSource}
              aria-label="แสดงต้นฉบับ"
              aria-pressed={showSource}
              className={cn(showSource && "text-[var(--accent)]")}
            >
              <Columns2 size={17} />
            </Button>
          ) : null}
          <Button variant="ghost" size="icon" onClick={onGlossary} aria-label="คลังคำศัพท์">
            <Languages size={17} />
          </Button>
          <Button variant="ghost" size="icon" onClick={onTypography} aria-label="การแสดงผล">
            <SlidersHorizontal size={17} />
          </Button>
        </div>
      </div>

      <div
        className="bar-live h-[2px] transition-[width] duration-500 ease-out"
        style={{ width: `${progress * 100}%`, opacity: busy ? 1 : 0 }}
      />
    </header>
  );
}

/* ---------------------------------- dock --------------------------------- */

/** A full-height tap target — phones need 44px, not a 32px icon button. */
function DockButton({
  onClick,
  label,
  icon,
  tone = "quiet",
  badge,
  compact,
  disabled,
  iconAfter,
}: {
  onClick: () => void;
  label: string;
  icon: ReactNode;
  tone?: "quiet" | "accent" | "primary";
  badge?: number;
  /** hide the text label on phones, keeping only the icon */
  compact?: boolean;
  disabled?: boolean;
  /** put the icon after the label, for "forward" actions */
  iconAfter?: boolean;
}) {
  const text = <span className={cn(compact && "hidden sm:inline")}>{label}</span>;
  return (
    <button
      onClick={onClick}
      aria-label={label}
      disabled={disabled}
      className={cn(
        "flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl px-3",
        "text-[13px] font-medium tracking-tight transition-colors duration-150",
        "active:scale-[0.97] active:transition-transform",
        "disabled:pointer-events-none disabled:opacity-40",
        tone === "primary" &&
          "bg-[var(--accent-strong)] px-4 text-[var(--accent-ink)] shadow-[0_8px_22px_-10px_var(--accent)] hover:brightness-110",
        tone === "accent" && "border border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent)]",
        tone === "quiet" && "text-[var(--fg-muted)] hover:bg-[var(--bg-elev-2)]",
      )}
    >
      {iconAfter ? null : icon}
      {text}
      {iconAfter ? icon : null}
      {badge ? <span className="rounded-md bg-current/15 px-1.5 text-[11px] tabular-nums">{badge}</span> : null}
    </button>
  );
}

export type NextMode = "chapter" | "fetch" | "write" | "none";

export function ReaderDock({
  visible,
  progress,
  busy,
  missing,
  width,
  hasPrev,
  nextMode,
  fetchingNext = false,
  onTools,
  onFillGaps,
  onPrev,
  onNext,
  onCopy,
  onDownload,
}: {
  visible: boolean;
  /** reading progress through the chapter, 0..1 */
  progress: number;
  busy: boolean;
  missing: number;
  width: number;
  /** Whether an earlier chapter of this novel is already in the library. */
  hasPrev: boolean;
  /**
   * "chapter" — the next one is already here, just open it.
   * "fetch"   — only the source site's link exists, so go and get it.
   * "write"   — a studio novel whose next chapter is planned but unwritten.
   */
  nextMode: NextMode;
  /** the next chapter is being fetched or written right now */
  fetchingNext?: boolean;
  onTools: () => void;
  onFillGaps: () => void;
  onPrev: () => void;
  onNext: () => void;
  onCopy: () => void;
  onDownload: () => void;
}) {
  const percent = Math.round(progress * 100);
  const nextLabel = fetchingNext
    ? nextMode === "write"
      ? "กำลังเขียน…"
      : "กำลังดึงตอน…"
    : nextMode === "fetch"
      ? "ดึงตอนถัดไป"
      : nextMode === "write"
        ? "เขียนตอนถัดไป"
        : "ตอนถัดไป";

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 transition-transform duration-300 ease-out will-change-transform",
        !visible && "translate-y-[calc(100%_+_1.5rem)]",
      )}
    >
      <div className="mx-auto sm:px-5 sm:pb-[max(0.65rem,env(safe-area-inset-bottom))]" style={{ maxWidth: `${Math.max(width, 720) + 120}px` }}>
        {/* Flush to the screen edge on a phone so no prose peeks out beneath
            it; a floating pill once there is room to spare. */}
        <div
          className={cn(
            "glass overflow-hidden border-t border-[var(--line)]",
            "rounded-t-[22px] pb-[env(safe-area-inset-bottom)]",
            "shadow-[0_-8px_32px_-12px_rgba(0,0,0,.55)]",
            "sm:rounded-[22px] sm:border sm:pb-0 sm:shadow-[0_16px_40px_-16px_rgba(0,0,0,.6)]",
          )}
        >
          <div className="flex items-center gap-2.5 px-3.5 pt-2.5">
            <div
              className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--line)]"
              role="progressbar"
              aria-label="ความคืบหน้าการอ่าน"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,var(--accent),color-mix(in_oklab,var(--accent)_50%,var(--magic)))] transition-[width] duration-150 ease-out"
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--fg-dim)]">{percent}%</span>
          </div>

          <div className="flex items-center gap-1 p-2">
            <DockButton onClick={onPrev} label="ตอนก่อนหน้า" icon={<ChevronLeft size={18} />} disabled={!hasPrev} compact />
            <DockButton onClick={onTools} label="เครื่องมือ" icon={<MoreHorizontal size={17} />} compact />

            <div className="hidden items-center gap-1 sm:flex">
              <DockButton onClick={onCopy} label="คัดลอก" icon={<Copy size={15} />} />
              <DockButton onClick={onDownload} label="บันทึกไฟล์" icon={<Download size={15} />} />
            </div>

            <div className="flex-1" />

            {!busy && missing > 0 ? (
              <DockButton onClick={onFillGaps} label="แปลที่ค้าง" icon={<RefreshCw size={15} />} tone="accent" badge={missing} compact />
            ) : null}

            {nextMode !== "none" ? (
              <DockButton
                onClick={onNext}
                // Locked while the page is on its way, so a second tap can
                // never fetch and translate the same chapter twice.
                disabled={fetchingNext}
                label={nextLabel}
                icon={
                  fetchingNext ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : nextMode === "fetch" ? (
                    <DownloadCloud size={15} />
                  ) : nextMode === "write" ? (
                    <PenLine size={15} />
                  ) : (
                    <ChevronRight size={17} />
                  )
                }
                tone="primary"
                iconAfter={nextMode === "chapter" && !fetchingNext}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- tools sheet ------------------------------ */

function ToolRow({ onClick, icon, label, trailing }: { onClick: () => void; icon: ReactNode; label: string; trailing?: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3.5 py-3 text-left transition-colors hover:border-[var(--accent-line)]"
    >
      <span className="shrink-0 text-[var(--fg-muted)]">{icon}</span>
      <span className="flex-1 text-[14px] font-medium">{label}</span>
      {trailing ? <span className="shrink-0 text-[12px] text-[var(--fg-dim)]">{trailing}</span> : null}
    </button>
  );
}

/** The phone's home for everything that used to crowd the header and dock. */
export function ReaderToolsSheet({
  open,
  onClose,
  glossaryCount,
  missing,
  showSource,
  original,
  onToggleSource,
  onCopy,
  onDownload,
  onFillGaps,
  onGlossary,
  onTypography,
  onRewrite,
}: {
  open: boolean;
  onClose: () => void;
  glossaryCount: number;
  missing: number;
  showSource: boolean;
  original: boolean;
  onToggleSource: (v: boolean) => void;
  onCopy: () => void;
  onDownload: () => void;
  onFillGaps: () => void;
  onGlossary: () => void;
  onTypography: () => void;
  /** studio novels: write this chapter again */
  onRewrite?: () => void;
}) {
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <Sheet open={open} onClose={onClose} side="bottom" title="เครื่องมือการอ่าน">
      <div className="mx-auto max-w-[520px] space-y-2 pb-4">
        <ToolRow onClick={run(onTypography)} icon={<SlidersHorizontal size={17} />} label="ขนาดตัวอักษรและธีม" />
        <ToolRow onClick={run(onGlossary)} icon={<Languages size={17} />} label="คลังคำศัพท์ของเรื่องนี้" trailing={`${glossaryCount} คำ`} />

        {!original ? (
          <div className="rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-1">
            <Switch checked={showSource} onChange={onToggleSource} label="แสดงต้นฉบับควบคู่" hint="เทียบทีละย่อหน้าเพื่อตรวจงานแปล" />
          </div>
        ) : null}

        {missing > 0 ? (
          <ToolRow onClick={run(onFillGaps)} icon={<RefreshCw size={17} />} label="แปลย่อหน้าที่ยังค้าง" trailing={`${missing} ย่อหน้า`} />
        ) : null}
        {onRewrite ? <ToolRow onClick={run(onRewrite)} icon={<PenLine size={17} />} label="ให้ AI เขียนตอนนี้ใหม่" /> : null}

        <ToolRow onClick={run(onCopy)} icon={<Copy size={17} />} label="คัดลอกเนื้อหาทั้งตอน" />
        <ToolRow onClick={run(onDownload)} icon={<Download size={17} />} label="บันทึกเป็นไฟล์ .txt" />
        <ToolRow onClick={run(() => window.scrollTo({ top: 0, behavior: "smooth" }))} icon={<ArrowUpToLine size={17} />} label="กลับไปต้นตอน" />
      </div>
    </Sheet>
  );
}
