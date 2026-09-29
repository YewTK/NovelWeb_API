"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { BookOpen, Feather, Library, Loader2, Play, Search } from "lucide-react";
import type { ChapterMeta, Series } from "@/lib/types";
import { chapterLabel, chapterNumber } from "@/lib/series";
import { statusOf, type ReadMark } from "@/lib/reading";
import { cn } from "@/lib/utils";

export interface Shelf {
  series: Series;
  chapters: ChapterMeta[];
  updatedAt: number;
}

/** Novels written in the studio, as opposed to translated from a source. */
export function isOriginal(series: Series): boolean {
  return Boolean(series.info?.project);
}

/** Groups the library into one shelf per novel, newest activity first. */
export function buildShelves(series: Series[], chapters: ChapterMeta[]): Shelf[] {
  const byId = new Map<string, Shelf>();

  for (const s of series) {
    byId.set(s.id, { series: s, chapters: [], updatedAt: s.updatedAt });
  }

  const orphans: ChapterMeta[] = [];
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
 * A book cover: the reader's own image, or a generated one in the novel's
 * colour with a gilt frame and a title set like a hardback. Sized by its
 * parent; tilts toward the pointer when its card is hovered.
 */
export function Cover({
  name,
  seed,
  author,
  image,
  className,
  size = "md",
  priority = false,
  flat = false,
}: {
  name: string;
  seed: string;
  author?: string;
  /** the reader's own cover; the generated one is the fallback */
  image?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  /** above the fold: fetch eagerly */
  priority?: boolean;
  /** no hover tilt, e.g. inside a form */
  flat?: boolean;
}) {
  const hue = hueOf(seed || name);
  const [broken, setBroken] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setBroken(false);
    setLoaded(false);
  }, [image]);

  const shell = cn(
    "relative aspect-[2/3] w-full overflow-hidden rounded-[6px_10px_10px_6px]",
    "shadow-[0_18px_30px_-16px_rgba(0,0,0,.75),0_2px_6px_-2px_rgba(0,0,0,.4)] ring-1 ring-black/10",
    !flat && "book-tilt",
    className,
  );

  if (image && !broken) {
    return (
      <div className={cn(shell, "bg-[var(--bg-elev-2)]")}>
        {!loaded ? <div className="shimmer absolute inset-0" aria-hidden /> : null}
        {/* eslint-disable-next-line @next/next/no-img-element -- data URLs and arbitrary hosts */}
        <img
          src={image}
          alt={name ? `ปก ${name}` : ""}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={priority ? "high" : "auto"}
          referrerPolicy="no-referrer"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setBroken(true)}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-500",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
        <span className="book-spine-light" />
        <span className="book-sheen" />
      </div>
    );
  }

  return (
    <div
      className={shell}
      style={{
        background: `radial-gradient(120% 70% at 70% 75%, hsl(${(hue + 20) % 360} 60% 60% / .35), transparent 60%), linear-gradient(160deg, hsl(${hue} 52% 46%) 0%, hsl(${(hue + 30) % 360} 48% 28%) 58%, hsl(${(hue + 50) % 360} 45% 14%) 100%)`,
      }}
      aria-hidden
    >
      <span className="absolute inset-[6%] rounded-[3px] border border-[rgba(255,226,160,.55)]" />
      <span className="absolute inset-[8%] rounded-[2px] border border-[rgba(255,226,160,.25)]" />
      <div
        className={cn(
          "absolute inset-x-[14%] top-[15%] font-serif font-semibold leading-snug text-white [text-shadow:0_1px_3px_rgba(0,0,0,.45)]",
          size === "sm" && "line-clamp-4 text-[10.5px]",
          size === "md" && "line-clamp-5 text-[13px] sm:text-[14px]",
          size === "lg" && "line-clamp-5 text-[17px]",
        )}
      >
        {name}
      </div>
      <span className="absolute inset-x-[30%] top-[11%] h-px bg-[rgba(255,226,160,.6)]" />
      {author ? (
        <div
          className={cn(
            "absolute inset-x-[14%] bottom-[11%] truncate text-white/80",
            size === "sm" ? "text-[8.5px]" : "text-[11px]",
          )}
        >
          {author}
        </div>
      ) : (
        <BookOpen className="absolute bottom-[11%] right-[14%] text-[rgba(255,226,160,.7)]" size={size === "sm" ? 11 : 16} />
      )}
      <span className="book-spine-light" />
      <span className="book-sheen" />
    </div>
  );
}

/** "ตอนที่ 1780–1782" across a whole shelf, or null when nothing is numbered. */
export function chapterRange(chapters: ChapterMeta[]): string | null {
  const numbers = chapters.map((c) => chapterNumber(c)).filter((n): n is number => n !== null);
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
): { chapter: ChapterMeta; started: boolean } | null {
  if (!shelf.chapters.length) return null;
  let latest: ChapterMeta | null = null;
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

export function lastOpened(shelf: Shelf, marks: Record<string, ReadMark>): number {
  let at = 0;
  for (const c of shelf.chapters) at = Math.max(at, marks[c.id]?.openedAt ?? 0);
  return at;
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
        return { shelf, chapter: target.chapter, lastOpened: lastOpened(shelf, marks) };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
      .sort((a, b) => b.lastOpened - a.lastOpened)
      .slice(0, 10);
  }, [shelves, marks]);

  if (!items.length) return null;

  return (
    <section className="mx-auto w-full max-w-[1180px] px-4 pb-10 sm:px-6">
      <SectionTitle icon={<Play size={15} />} title="อ่านต่อจากที่ค้างไว้" />
      <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
        {items.map(({ shelf, chapter }) => {
          const mark = marks[chapter.id];
          const pct = Math.round((mark?.progress ?? 0) * 100);
          const label = chapterLabel(chapterNumber(chapter));
          const title = chapter.translatedTitle || chapter.title;
          return (
            <button
              key={shelf.series.id || "orphans"}
              onClick={() => onOpenChapter(chapter.id)}
              className="group gilded flex w-[290px] shrink-0 snap-start items-center gap-3 rounded-2xl bg-[var(--bg-elev)]/80 p-3 text-left transition-colors hover:bg-[var(--bg-elev-2)]"
            >
              <div className="w-[54px] shrink-0">
                <Cover
                  name={shelf.series.name}
                  seed={shelf.series.key || shelf.series.id}
                  image={shelf.series.info?.cover}
                  size="sm"
                />
              </div>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-1 text-[14px] font-semibold">{shelf.series.name}</span>
                <span className="mt-0.5 line-clamp-1 text-[12.5px] text-[var(--fg-muted)]">
                  {label && !title.includes(label) ? `${label} · ` : ""}
                  {title}
                </span>
                <span className="mt-2 flex items-center gap-2">
                  <span className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--line)]">
                    <span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="text-[11px] tabular-nums text-[var(--fg-dim)]">{pct}%</span>
                </span>
              </span>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--accent-strong)] text-[var(--accent-ink)] transition-transform group-hover:scale-110">
                <Play size={14} className="translate-x-px" fill="currentColor" />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function SectionTitle({
  icon,
  title,
  trailing,
}: {
  icon: React.ReactNode;
  title: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] ring-1 ring-[var(--accent-line)]">
        {icon}
      </span>
      <h2 className="font-serif text-[19px] font-semibold tracking-tight">{title}</h2>
      <div className="flex-1" />
      {trailing}
    </div>
  );
}

/* -------------------------------- the shelf ------------------------------- */

type SortKey = "recent" | "name" | "chapters";
type FilterKey = "all" | "translated" | "original" | "unread";

const BookCard = memo(function BookCard({
  shelf,
  read,
  busy,
  onOpen,
  priority,
}: {
  shelf: Shelf;
  read: number;
  /** "translating" / "writing" while a job for this novel runs */
  busy: string | null;
  onOpen: (id: string) => void;
  priority: boolean;
}) {
  const total = shelf.chapters.length;
  const done = shelf.chapters.filter((c) => c.status === "done").length;
  const pct = total ? Math.round((read / total) * 100) : 0;
  const original = isOriginal(shelf.series);

  return (
    <button onClick={() => onOpen(shelf.series.id)} className="group cv-auto block w-full text-left [contain-intrinsic-size:auto_300px]">
      <div className="relative">
        <Cover
          name={shelf.series.name}
          seed={shelf.series.key || shelf.series.id}
          author={shelf.series.info?.author}
          image={shelf.series.info?.cover}
          priority={priority}
        />
        <div className="pointer-events-none absolute left-1.5 top-1.5 flex flex-col items-start gap-1">
          {busy ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[10.5px] font-medium text-white backdrop-blur">
              <Loader2 size={10} className="animate-spin" /> {busy}
            </span>
          ) : null}
          {original ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--magic)_80%,black)] px-2 py-0.5 text-[10px] font-semibold text-white">
              <Feather size={9} /> AI เขียน
            </span>
          ) : null}
        </div>
        {read > 0 ? (
          <span className="absolute inset-x-1 bottom-1 h-1 overflow-hidden rounded-full bg-black/40">
            <span className="block h-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
          </span>
        ) : null}
      </div>
      <p className="mt-2.5 line-clamp-2 text-[13.5px] font-semibold leading-snug transition-colors group-hover:text-[var(--accent)]">
        {shelf.series.name}
      </p>
      <p className="mt-0.5 text-[11.5px] text-[var(--fg-dim)]">
        {total} ตอน
        {done < total ? ` · ${original ? "เขียน" : "แปล"}แล้ว ${done}` : ""}
        {read > 0 ? ` · อ่าน ${read}` : ""}
      </p>
    </button>
  );
});

export function Bookshelf({
  shelves,
  marks,
  activity,
  onOpen,
}: {
  shelves: Shelf[];
  marks: Record<string, ReadMark>;
  /** novel id → what is running for it right now */
  activity: Record<string, string>;
  onOpen: (seriesId: string) => void;
}) {
  const [sort, setSort] = useState<SortKey>("recent");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(
    () => ({
      all: shelves.length,
      translated: shelves.filter((s) => !isOriginal(s.series)).length,
      original: shelves.filter((s) => isOriginal(s.series)).length,
      unread: shelves.filter((s) => readCount(s, marks) === 0).length,
    }),
    [shelves, marks],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let list = shelves;
    if (filter === "translated") list = list.filter((s) => !isOriginal(s.series));
    if (filter === "original") list = list.filter((s) => isOriginal(s.series));
    if (filter === "unread") list = list.filter((s) => readCount(s, marks) === 0);
    if (needle) {
      list = list.filter((s) =>
        `${s.series.name} ${s.series.info?.originalTitle ?? ""} ${s.series.info?.author ?? ""} ${(s.series.info?.genres ?? []).join(" ")}`
          .toLowerCase()
          .includes(needle),
      );
    }
    if (sort === "name") return [...list].sort((a, b) => a.series.name.localeCompare(b.series.name, "th"));
    if (sort === "chapters") return [...list].sort((a, b) => b.chapters.length - a.chapters.length);
    return list;
  }, [shelves, sort, filter, query, marks]);

  if (shelves.length === 0) return null;

  const FILTERS: [FilterKey, string][] = [
    ["all", "ทั้งหมด"],
    ["translated", "แปล"],
    ["original", "AI เขียน"],
    ["unread", "ยังไม่อ่าน"],
  ];

  return (
    <section id="library" className="mx-auto w-full max-w-[1180px] scroll-mt-20 px-4 pb-32 sm:px-6">
      <SectionTitle
        icon={<Library size={15} />}
        title="ชั้นหนังสือของฉัน"
        trailing={<span className="text-[13px] text-[var(--fg-dim)]">{shelves.length} เรื่อง</span>}
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {FILTERS.filter(([k]) => k === "all" || counts[k] > 0).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
              className={cn(
                "h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
                filter === key
                  ? "border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border-[var(--line)] bg-[var(--bg-elev)]/60 text-[var(--fg-muted)] hover:text-[var(--fg)]",
              )}
            >
              {label} <span className="ml-0.5 tabular-nums opacity-60">{counts[key]}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-1 items-center gap-2 sm:justify-end">
          <label className="relative min-w-0 flex-1 sm:max-w-[240px]">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-dim)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาชื่อ ผู้แต่ง แนว…"
              type="search"
              className="h-9 w-full rounded-full border border-[var(--line)] bg-[var(--bg-elev)]/70 pl-8 pr-3.5 text-base outline-none transition-colors placeholder:text-[var(--fg-dim)] focus:border-[var(--accent)] sm:text-[13px]"
            />
          </label>
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
        <p className="rounded-2xl border border-dashed border-[var(--line)] px-4 py-12 text-center text-[13px] text-[var(--fg-dim)]">
          {query.trim() ? `ไม่พบเรื่องที่ตรงกับ “${query.trim()}”` : "ยังไม่มีเรื่องในหมวดนี้"}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-x-3 gap-y-7 sm:grid-cols-4 sm:gap-x-5 md:grid-cols-5 lg:grid-cols-6">
          {visible.map((shelf, i) => (
            <BookCard
              key={shelf.series.id || "orphans"}
              shelf={shelf}
              read={readCount(shelf, marks)}
              busy={activity[shelf.series.id] ?? null}
              onOpen={onOpen}
              priority={i < 6}
            />
          ))}
        </div>
      )}
    </section>
  );
}
