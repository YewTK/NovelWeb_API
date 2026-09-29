"use client";

import { memo, useMemo, type ReactNode } from "react";
import { AlertCircle, Feather } from "lucide-react";
import type { Chapter } from "@/lib/types";
import type { FontKey, ReaderPrefs } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * The model sometimes returns several prose paragraphs under a single marker.
 * Splitting them here means each one gets the reader's paragraph spacing and
 * first-line indent instead of running together into one wall of text.
 */
function splitBlocks(text: string): string[] {
  const parts = text
    .split(/[\r\n]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : [text];
}

const SCENE_BREAK = /^\s*([*＊~—\-=#•·✦]\s*){3,}\s*$/;

const FONT_CLASS: Record<FontKey, string> = {
  sans: "font-sans",
  serif: "font-serif",
  loop: "font-loop",
  modern: "font-modern",
};

/**
 * One paragraph. Memoised so a streamed update re-renders only the paragraph
 * that changed, and skipped by layout entirely while it is off screen.
 */
const Block = memo(function Block({
  source,
  target,
  showSource,
  active,
  pending,
  placeholderHeight,
}: {
  source: string;
  target: string;
  showSource: boolean;
  active: boolean;
  /** "shimmer" while it is on its way, "missing" when nothing is coming */
  pending: "shimmer" | "missing" | null;
  placeholderHeight: number;
}) {
  return (
    <div className="para cv-auto scroll-mt-24">
      {showSource && source ? (
        <p
          className="mb-1.5 select-text border-l-2 border-[var(--accent-line)] pl-3 text-[0.82em] leading-relaxed text-[var(--reader-quiet)]"
          style={{ textIndent: 0 }}
        >
          {source}
        </p>
      ) : null}

      {pending === "shimmer" ? (
        <p aria-hidden className="shimmer rounded-md bg-[var(--bg-elev-2)]" style={{ height: placeholderHeight }} />
      ) : pending === "missing" ? (
        <p className="flex items-center gap-2 text-[0.85em] text-[var(--fg-dim)]" style={{ textIndent: 0 }}>
          <AlertCircle size={14} /> ย่อหน้านี้ยังไม่ได้แปล
        </p>
      ) : (
        splitBlocks(target).map((block, bi, all) =>
          SCENE_BREAK.test(block) ? (
            <p key={bi} className="t scene-break" aria-label="ขึ้นฉากใหม่">
              ✦ ✦ ✦
            </p>
          ) : (
            <p key={bi} className={cn("t", active && bi === all.length - 1 && "caret")}>
              {block}
            </p>
          ),
        )
      )}
    </div>
  );
});

export const Reader = memo(function Reader({
  chapter,
  prefs,
  streaming,
  waiting = false,
  seriesName,
  byline,
  footer,
}: {
  chapter: Chapter;
  prefs: ReaderPrefs;
  streaming: boolean;
  /** queued or preparing — paragraphs will arrive, show placeholders */
  waiting?: boolean;
  seriesName: string | null;
  /** e.g. "เขียนโดย AI · สำนวน Guiltythree" for studio novels */
  byline?: string | null;
  /** the end-of-chapter card */
  footer?: ReactNode;
}) {
  const firstPending = useMemo(() => chapter.paragraphs.findIndex((p) => !p.target), [chapter.paragraphs]);
  const original = !chapter.sourceUrl && chapter.paragraphs.every((p) => !p.source);
  const lastIndex = chapter.paragraphs.length - 1;

  // The padding clears the fixed header above and the dock below, safe area included.
  return (
    <article
      key={chapter.id}
      className="page-in mx-auto w-full px-5 pb-[calc(9rem+env(safe-area-inset-bottom))] pt-[calc(5rem+env(safe-area-inset-top))] sm:px-8 sm:pt-[calc(5.75rem+env(safe-area-inset-top))]"
      style={{ maxWidth: `${prefs.maxWidth}px` }}
    >
      <header className="mb-10 text-center">
        {seriesName ? (
          <p className="text-[13.5px] font-semibold text-[var(--accent)]">{seriesName}</p>
        ) : null}
        <h1
          className={cn(
            "mt-3 text-balance text-[26px] font-semibold leading-tight tracking-tight sm:text-[34px]",
            prefs.fontFamily === "sans" ? "font-serif" : FONT_CLASS[prefs.fontFamily],
          )}
        >
          {chapter.translatedTitle || chapter.title}
        </h1>
        {chapter.translatedTitle && chapter.translatedTitle !== chapter.title ? (
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--fg-dim)]">{chapter.title}</p>
        ) : null}

        <div className="ornament mx-auto mt-6 max-w-[280px] text-[12px]" aria-hidden>
          ✦
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[12px] text-[var(--fg-dim)]">
          {byline ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-[color-mix(in_oklab,var(--magic)_14%,transparent)] px-2 py-0.5 text-[color-mix(in_oklab,var(--magic)_80%,var(--fg))]">
              <Feather size={11} /> {byline}
            </span>
          ) : chapter.siteName ? (
            <span className="rounded-md bg-[var(--bg-elev-2)] px-2 py-0.5">{chapter.siteName}</span>
          ) : null}
          <span>{chapter.paragraphs.length} ย่อหน้า</span>
          {chapter.glossary.length > 0 ? <span>· คำศัพท์ล็อกไว้ {chapter.glossary.length} คำ</span> : null}
          {chapter.model ? <span>· {chapter.model}</span> : null}
        </div>
      </header>

      <div
        className={cn("prose-novel", FONT_CLASS[prefs.fontFamily])}
        style={{
          fontSize: `${prefs.fontSize}px`,
          lineHeight: prefs.lineHeight,
          color: "var(--reader-fg)",
          ["--para-gap" as string]: `${prefs.paragraphGap}em`,
          ["--indent" as string]: `${prefs.indent}em`,
        }}
      >
        {chapter.paragraphs.length === 0 && (streaming || waiting) ? (
          <div className="space-y-4" aria-label="กำลังเตรียมเนื้อหา">
            {[92, 100, 76, 100, 64].map((w, i) => (
              <p key={i} className="shimmer h-[1.2em] rounded-md bg-[var(--bg-elev-2)]" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : null}
        {chapter.paragraphs.map((p, i) => {
          const isPending = !p.target;
          const lineHeight = prefs.fontSize * prefs.lineHeight;
          return (
            <Block
              key={p.id}
              source={p.source}
              target={p.target}
              showSource={prefs.showSource}
              // Translations fill in order behind the first gap; written
              // chapters grow at the end.
              active={streaming && (original ? i === lastIndex : i === firstPending - 1)}
              pending={isPending ? (streaming || waiting ? "shimmer" : "missing") : null}
              placeholderHeight={isPending ? Math.min(4, Math.max(1, Math.round(p.source.length / 70))) * lineHeight : 0}
            />
          );
        })}
      </div>

      {footer ? <div className="mt-16">{footer}</div> : null}
    </article>
  );
});
