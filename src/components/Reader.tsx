"use client";

import { useMemo } from "react";
import { AlertCircle } from "lucide-react";
import type { Chapter } from "@/lib/types";
import type { FontKey, ReaderPrefs } from "@/lib/store";
import { cn } from "@/lib/utils";

const FONT_CLASS: Record<FontKey, string> = {
  sans: "font-sans",
  serif: "font-serif",
  loop: "font-loop",
  modern: "font-modern",
};

export function Reader({
  chapter,
  prefs,
  streaming,
}: {
  chapter: Chapter;
  prefs: ReaderPrefs;
  streaming: boolean;
}) {
  const firstPending = useMemo(
    () => chapter.paragraphs.findIndex((p) => !p.target),
    [chapter.paragraphs],
  );

  return (
    <article
      className="mx-auto w-full px-5 pb-40 pt-6 sm:px-8"
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
          const pending = !p.target;
          const isActive = streaming && i === firstPending;

          return (
            <div key={p.id} className="scroll-mt-24" id={`p-${p.id}`}>
              {prefs.showSource ? (
                <p
                  className="mb-1.5 select-text border-l-2 border-[var(--line)] pl-3 text-[0.82em] leading-relaxed text-[var(--reader-quiet)]"
                  style={{ textIndent: 0 }}
                >
                  {p.source}
                </p>
              ) : null}

              {pending ? (
                isActive || streaming ? (
                  <p
                    aria-hidden
                    className="shimmer mb-[var(--para-gap)] rounded-md bg-[var(--bg-elev-2)]"
                    style={{
                      height: `${Math.min(
                        4,
                        Math.max(1, Math.round(p.source.length / 70)),
                      ) * prefs.fontSize * prefs.lineHeight}px`,
                    }}
                  />
                ) : (
                  <p className="mb-[var(--para-gap)] flex items-center gap-2 text-[0.85em] text-[var(--fg-dim)]">
                    <AlertCircle size={14} /> ย่อหน้านี้ยังไม่ได้แปล
                  </p>
                )
              ) : (
                <p className={cn(isActive && "caret")}>{p.target}</p>
              )}
            </div>
          );
        })}
      </div>
    </article>
  );
}
