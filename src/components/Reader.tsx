"use client";

import { memo, useMemo } from "react";
import { AlertCircle } from "lucide-react";
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

const FONT_CLASS: Record<FontKey, string> = {
  sans: "font-sans",
  serif: "font-serif",
  loop: "font-loop",
  modern: "font-modern",
};

/**
 * One paragraph. Memoised so a streamed update re-renders only the paragraph
 * that changed, not the thousands of lines already on the page.
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
    <div className="scroll-mt-24">
      {showSource ? (
        <p
          className="mb-1.5 select-text border-l-2 border-[var(--line)] pl-3 text-[0.82em] leading-relaxed text-[var(--reader-quiet)]"
          style={{ textIndent: 0 }}
        >
          {source}
        </p>
      ) : null}

      {pending === "shimmer" ? (
        <p
          aria-hidden
          className="shimmer mb-[var(--para-gap)] rounded-md bg-[var(--bg-elev-2)]"
          style={{ height: placeholderHeight }}
        />
      ) : pending === "missing" ? (
        <p className="mb-[var(--para-gap)] flex items-center gap-2 text-[0.85em] text-[var(--fg-dim)]" style={{ textIndent: 0 }}>
          <AlertCircle size={14} /> ย่อหน้านี้ยังไม่ได้แปล
        </p>
      ) : (
        splitBlocks(target).map((block, bi, all) => (
          <p key={bi} className={cn(active && bi === all.length - 1 && "caret")}>
            {block}
          </p>
        ))
      )}
    </div>
  );
});

export const Reader = memo(function Reader({
  chapter,
  prefs,
  streaming,
  waiting = false,
}: {
  chapter: Chapter;
  prefs: ReaderPrefs;
  streaming: boolean;
  /** queued or preparing — paragraphs will arrive, show placeholders */
  waiting?: boolean;
}) {
  const firstPending = useMemo(
    () => chapter.paragraphs.findIndex((p) => !p.target),
    [chapter.paragraphs],
  );

  // The padding clears the fixed header above and the dock below, safe area included.
  return (
    <article
      className="mx-auto w-full px-5 pb-[calc(8.5rem_+_env(safe-area-inset-bottom))] pt-[calc(4.75rem_+_env(safe-area-inset-top))] sm:px-8 sm:pt-[calc(5.25rem_+_env(safe-area-inset-top))]"
      style={{ maxWidth: `${prefs.maxWidth}px` }}
    >
      <header className="mb-8 border-b border-[var(--line-soft)] pb-6">
        <h1
          className={cn(
            "text-balance text-[26px] font-semibold leading-tight tracking-tight sm:text-[32px]",
            FONT_CLASS[prefs.fontFamily],
          )}
        >
          {chapter.translatedTitle || chapter.title}
        </h1>
        {chapter.translatedTitle &&
        chapter.translatedTitle !== chapter.title ? (
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--fg-dim)]">
            {chapter.title}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-[var(--fg-dim)]">
          {chapter.siteName ? (
            <span className="rounded-md bg-[var(--bg-elev-2)] px-2 py-0.5">
              {chapter.siteName}
            </span>
          ) : null}
          <span>{chapter.paragraphs.length} ย่อหน้า</span>
          {chapter.glossary.length > 0 ? (
            <span>· คำศัพท์ล็อกไว้ {chapter.glossary.length} คำ</span>
          ) : null}
          <span>· {chapter.model}</span>
        </div>
      </header>

      <div
        className={cn(
          "prose-novel",
          FONT_CLASS[prefs.fontFamily],
        )}
        style={{
          fontSize: `${prefs.fontSize}px`,
          lineHeight: prefs.lineHeight,
          color: "var(--reader-fg)",
          ["--para-gap" as string]: `${prefs.paragraphGap}em`,
          ["--indent" as string]: `${prefs.indent}em`,
        }}
      >
        {chapter.paragraphs.map((p, i) => {
          const isPending = !p.target;
          const lineHeight = prefs.fontSize * prefs.lineHeight;
          return (
            <Block
              key={p.id}
              source={p.source}
              target={p.target}
              showSource={prefs.showSource}
              active={streaming && i === firstPending - 1}
              pending={isPending ? (streaming || waiting ? "shimmer" : "missing") : null}
              placeholderHeight={
                isPending
                  ? Math.min(4, Math.max(1, Math.round(p.source.length / 70))) * lineHeight
                  : 0
              }
            />
          );
        })}
      </div>
    </article>
  );
});
