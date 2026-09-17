"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { BookOpen, Library, Loader2, Play } from "lucide-react";
import type { Chapter, Series } from "@/lib/types";
import { chapterLabel, chapterNumber } from "@/lib/series";
import { statusOf, type ReadMark } from "@/lib/reading";
import { cn } from "@/lib/utils";

export interface Shelf {
  series: Series;
  chapters: Chapter[];
  updatedAt: number;
}

/** Groups the library into one shelf per novel, newest activity first. */
export function buildShelves(series: Series[], chapters: Chapter[]): Shelf[] {
  const byId = new Map<string, Shelf>();

  for (const s of series) {
    byId.set(s.id, { series: s, chapters: [], updatedAt: s.updatedAt });
  }

  const orphans: Chapter[] = [];
  for (const c of chapters) {
    const shelf = c.seriesId ? byId.get(c.seriesId) : undefined;
    if (shelf) {
      shelf.chapters.push(c);
      shelf.updatedAt = Math.max(shelf.updatedAt, c.updatedAt);
    } else {
      orphans.push(c);
    }
  }

  const shelves = [...byId.values()].filter((s) => s.chapters.length > 0);

  if (orphans.length) {
    shelves.push({
      series: {
        id: "",
        key: "",
        name: "ยังไม่ได้จัดเข้าเรื่อง",
        glossary: [],
        createdAt: 0,
        updatedAt: 0,
      },
      chapters: orphans,
      updatedAt: Math.max(...orphans.map((c) => c.updatedAt)),
    });
  }

  // Reading order, not edit order: a shelf should read 1, 2, 3 like a book.
  // Chapters whose number cannot be worked out keep the order they were added.
  for (const shelf of shelves) {
    const numbers = new Map(shelf.chapters.map((c) => [c.id, chapterNumber(c)]));
    shelf.chapters.sort((a, b) => {
      const na = numbers.get(a.id) ?? null;
      const nb = numbers.get(b.id) ?? null;
      if (na !== null && nb !== null && na !== nb) return na - nb;
      if (na !== null && nb === null) return -1;
      if (nb !== null && na === null) return 1;
      return a.createdAt - b.createdAt;
    });
  }
  return shelves.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Gives every novel a stable colour so its cover is recognisable at a glance. */
export function hueOf(seed: string): number {
  // FNV-1a, so near-identical keys still land on clearly different colours.
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 360;
}

/**
 * A generated book cover: the novel's own colour, its title set like a
 * paperback, and a spine highlight. Sized by its parent.
 */
export function Cover({
  name,
  seed,
  author,
  image,
  className,
  size = "md",
}: {
  name: string;
  seed: string;
  author?: string;
  /** the reader's own cover; the generated one is the fallback */
  image?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const hue = hueOf(seed || name);
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [image]);

  if (image && !broken) {
    return (
      <div
        className={cn(
          "relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-[var(--bg-elev-2)] shadow-[0_8px_20px_-8px_rgba(0,0,0,.45)] ring-1 ring-black/5",
          className,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- data URLs and arbitrary hosts */}
        <img
          src={image}
          alt={name ? `ปก ${name}` : ""}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          draggable={false}
          onError={() => setBroken(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative aspect-[2/3] w-full overflow-hidden rounded-lg shadow-[0_8px_20px_-8px_rgba(0,0,0,.45)] ring-1 ring-black/5",
        className,
      )}
      style={{
        background: `linear-gradient(155deg, hsl(${hue} 55% 56%) 0%, hsl(${(hue + 30) % 360} 50% 38%) 60%, hsl(${(hue + 50) % 360} 45% 24%) 100%)`,
      }}
      aria-hidden
    >
      <span className="absolute inset-y-0 left-0 w-[6%] bg-gradient-to-r from-black/25 to-white/10" />
      <span className="absolute inset-x-[10%] top-[9%] h-px bg-white/35" />
      <div
        className={cn(
          "absolute inset-x-[12%] top-[14%] font-serif font-semibold leading-snug text-white [text-shadow:0_1px_2px_rgba(0,0,0,.35)]",
          size === "sm" && "line-clamp-4 text-[11px]",
          size === "md" && "line-clamp-5 text-[13px] sm:text-[14px]",
          size === "lg" && "line-clamp-5 text-[16px]",
        )}
      >
        {name}
      </div>
      {author ? (
        <div
          className={cn(
            "absolute inset-x-[12%] bottom-[9%] truncate text-white/80",
            size === "sm" ? "text-[9px]" : "text-[11px]",
          )}
        >
          {author}
        </div>
      ) : (
        <BookOpen
          className="absolute bottom-[9%] right-[12%] text-white/55"
          size={size === "sm" ? 12 : 16}
        />
      )}
    </div>
  );
}

/** "ตอนที่ 1780–1782" across a whole shelf, or null when nothing is numbered. */
export function chapterRange(chapters: Chapter[]): string | null {
  const numbers = chapters
    .map((c) => chapterNumber(c))
    .filter((n): n is number => n !== null);
  if (!numbers.length) return null;
  const low = Math.min(...numbers);
  const high = Math.max(...numbers);
  return low === high ? `ตอนที่ ${low}` : `ตอนที่ ${low}–${high}`;
}

export function readCount(shelf: Shelf, marks: Record<string, ReadMark>): number {
  return shelf.chapters.filter((c) => statusOf(marks[c.id]) === "read").length;
}

/** The chapter to resume a novel from: last opened, else the first unread. */
export function resumeTarget(
  shelf: Shelf,
  marks: Record<string, ReadMark>,
): { chapter: Chapter; started: boolean } | null {
  if (!shelf.chapters.length) return null;
  let latest: Chapter | null = null;
  let at = 0;
  for (const c of shelf.chapters) {
    const opened = marks[c.id]?.openedAt ?? 0;
    if (opened > at) {
      at = opened;
      latest = c;
    }
  }
  if (latest) {
    const mark = marks[latest.id];
    // Finished that one — move on to the next chapter along.
    if (mark?.finishedAt) {
      const i = shelf.chapters.findIndex((c) => c.id === latest!.id);
      const next = shelf.chapters[i + 1];
      if (next) return { chapter: next, started: true };
    }
    return { chapter: latest, started: true };
  }
  return { chapter: shelf.chapters[0], started: false };
}

/* ----------------------------- continue reading ---------------------------- */

export function ContinueReading({
  shelves,
  marks,
  onOpenChapter,
}: {
  shelves: Shelf[];
  marks: Record<string, ReadMark>;
  onOpenChapter: (id: string) => void;
}) {
  const items = useMemo(() => {
    return shelves
      .map((shelf) => {
        const target = resumeTarget(shelf, marks);
        if (!target?.started) return null;
        const lastOpened = Math.max(
          ...shelf.chapters.map((c) => marks[c.id]?.openedAt ?? 0),
        );
        return { shelf, chapter: target.chapter, lastOpened };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
      .sort((a, b) => b.lastOpened - a.lastOpened)
      .slice(0, 8);
  }, [shelves, marks]);

  if (!items.length) return null;

  return (
    <section className="mx-auto w-full max-w-[1080px] px-4 pb-8 sm:px-6">
      <h2 className="mb-3 text-[17px] font-semibold tracking-tight">อ่านต่อ</h2>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden">
        {items.map(({ shelf, chapter }) => {
          const mark = marks[chapter.id];
          const pct = Math.round((mark?.progress ?? 0) * 100);
          const label = chapterLabel(chapterNumber(chapter));
          return (
            <button
              key={shelf.series.id || "orphans"}
              onClick={() => onOpenChapter(chapter.id)}
              className="group flex w-[270px] shrink-0 snap-start items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--bg-elev)] p-2.5 text-left transition-colors hover:border-[var(--fg-dim)]"
            >
              <div className="w-[52px] shrink-0">
                <Cover
                  name={shelf.series.name}
                  seed={shelf.series.key || shelf.series.id}
                  image={shelf.series.info?.cover}
                  size="sm"
                />
              </div>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-1 text-[14px] font-semibold">
                  {shelf.series.name}
                </span>
                <span className="mt-0.5 line-clamp-1 text-[12.5px] text-[var(--fg-muted)]">
                  {label && !(chapter.translatedTitle || chapter.title).includes(label)
                    ? `${label} · `
                    : ""}
                  {chapter.translatedTitle || chapter.title}
                </span>
                <span className="mt-2 flex items-center gap-2">
                  <span className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--line)]">
                    <span
                      className="block h-full rounded-full bg-[var(--accent)]"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="text-[11px] tabular-nums text-[var(--fg-dim)]">{pct}%</span>
                </span>
              </span>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--accent-strong)] text-white transition-transform group-hover:scale-105">
                <Play size={14} className="translate-x-px" fill="currentColor" />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* -------------------------------- the shelf ------------------------------- */

type SortKey = "recent" | "name" | "chapters";

const BookCard = memo(function BookCard({
  shelf,
  read,
  translating,
  onOpen,
}: {
  shelf: Shelf;
  read: number;
  translating: boolean;
  onOpen: (id: string) => void;
}) {
  const total = shelf.chapters.length;
  const done = shelf.chapters.filter((c) => c.status === "done").length;
  const pct = total ? Math.round((read / total) * 100) : 0;

  return (
    <button
      onClick={() => onOpen(shelf.series.id)}
      className="group block w-full text-left"
    >
      <div className="relative transition-transform duration-200 group-hover:-translate-y-1">
        <Cover
          name={shelf.series.name}
          seed={shelf.series.key || shelf.series.id}
          author={shelf.series.info?.author}
          image={shelf.series.info?.cover}
        />
        {translating ? (
          <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10.5px] font-medium text-white backdrop-blur">
            <Loader2 size={10} className="animate-spin" /> กำลังแปล
          </span>
        ) : null}
        {read > 0 ? (
          <span className="absolute inset-x-0 bottom-0 h-1 overflow-hidden rounded-b-lg bg-black/30">
            <span
              className="block h-full bg-[var(--accent)]"
              style={{ width: `${pct}%` }}
            />
          </span>
        ) : null}
      </div>
      <p className="mt-2 line-clamp-2 text-[13.5px] font-semibold leading-snug">
        {shelf.series.name}
      </p>
      <p className="mt-0.5 text-[11.5px] text-[var(--fg-dim)]">
        {total} ตอน
        {done < total ? ` · แปลแล้ว ${done}` : ""}
        {read > 0 ? ` · อ่าน ${read}` : ""}
      </p>
    </button>
  );
});

export function Bookshelf({
  shelves,
  marks,
  activeSeriesId,
  onOpen,
}: {
  shelves: Shelf[];
  marks: Record<string, ReadMark>;
  /** novel whose chapter is being translated right now */
  activeSeriesId: string | null;
  onOpen: (seriesId: string) => void;
}) {
  const [sort, setSort] = useState<SortKey>("recent");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = needle
      ? shelves.filter((s) =>
          `${s.series.name} ${s.series.info?.originalTitle ?? ""} ${s.series.info?.author ?? ""}`
            .toLowerCase()
            .includes(needle),
        )
      : shelves;
    if (sort === "name") return [...list].sort((a, b) => a.series.name.localeCompare(b.series.name, "th"));
    if (sort === "chapters") return [...list].sort((a, b) => b.chapters.length - a.chapters.length);
    return list;
  }, [shelves, sort, query]);

  if (shelves.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-[1080px] px-4 pb-28 sm:px-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto flex items-center gap-2 text-[17px] font-semibold tracking-tight">
          <Library size={17} className="text-[var(--accent)]" /> ชั้นหนังสือของฉัน
          <span className="text-[13px] font-normal text-[var(--fg-dim)]">
            {shelves.length} เรื่อง
          </span>
        </h2>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          {shelves.length > 4 ? (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาเรื่อง…"
              type="search"
              className="h-9 min-w-0 flex-1 rounded-full border border-[var(--line)] bg-[var(--bg-elev)] px-3.5 text-base outline-none transition-colors placeholder:text-[var(--fg-dim)] focus:border-[var(--accent)] sm:w-48 sm:flex-none sm:text-[13px]"
            />
          ) : null}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="เรียงลำดับ"
            className="h-9 shrink-0 rounded-full border border-[var(--line)] bg-[var(--bg-elev)] px-3 text-[13px] outline-none"
          >
            <option value="recent">อัปเดตล่าสุด</option>
            <option value="name">ชื่อเรื่อง</option>
            <option value="chapters">จำนวนตอน</option>
          </select>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--line)] px-4 py-10 text-center text-[13px] text-[var(--fg-dim)]">
          ไม่พบเรื่องที่ตรงกับ “{query.trim()}”
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 sm:gap-x-5 md:grid-cols-5 lg:grid-cols-6">
          {visible.map((shelf) => (
            <BookCard
              key={shelf.series.id || "orphans"}
              shelf={shelf}
              read={readCount(shelf, marks)}
              translating={activeSeriesId !== null && shelf.series.id === activeSeriesId}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </section>
  );
}
