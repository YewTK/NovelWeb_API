import { chapterNumber } from "./series";
import type { Chapter, Series } from "./types";

/** What routing needs of a chapter; full chapters and metas both qualify. */
type ChapterLike = Pick<Chapter, "id" | "title" | "translatedTitle" | "sourceUrl">;

/**
 * URLs for the reader: `/` is the shelf, `/<novel>` a novel's page and
 * `/<novel>/<chapter>` a chapter, e.g. `/shadow-slave/2423`. Everything lives
 * on the device or in the reader's own cloud rows, so these are resolved in
 * the browser against the loaded library rather than on the server.
 */

/** Shelf segment for chapters filed under no novel. */
export const UNSORTED_SLUG = "unsorted";

/** The writing studio lives at `/studio`, `/studio/<novel>` opens one project. */
export const STUDIO_SLUG = "studio";

/** Top-level segments that belong to the app, never to a novel. */
const RESERVED = new Set([UNSORTED_SLUG, STUDIO_SLUG, "api", "_next"]);

/** "Shadow Slave" → "shadow-slave"; Thai and other scripts are kept as-is. */
export function slugify(name: string): string {
  return (
    name
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "novel"
  );
}

/** A novel's segment; a short id suffix only when two novels share a name. */
export function bookSlug(series: Series, all: Series[]): string {
  if (!series.id) return UNSORTED_SLUG;
  const base = slugify(series.name);
  const clash =
    RESERVED.has(base) || all.some((s) => s.id !== series.id && slugify(s.name) === base);
  return clash ? `${base}-${series.id.slice(0, 6)}` : base;
}

/** The chapter's number when it is unique within the novel, else a short id. */
export function chapterSlug(chapter: ChapterLike, siblings: ChapterLike[]): string {
  const n = chapterNumber(chapter);
  if (n !== null && siblings.filter((c) => chapterNumber(c) === n).length === 1) {
    return String(n);
  }
  return chapter.id.slice(0, 8);
}

const enc = (s: string) => encodeURIComponent(s);

export function bookPath(series: Series, all: Series[]): string {
  return `/${enc(bookSlug(series, all))}`;
}

export function chapterPath(
  chapter: ChapterLike,
  series: Series | null,
  all: Series[],
  siblings: ChapterLike[],
): string {
  const book = series ? bookSlug(series, all) : UNSORTED_SLUG;
  return `/${enc(book)}/${enc(chapterSlug(chapter, siblings))}`;
}

export interface ParsedPath {
  book: string | null;
  chapter: string | null;
}

/** `/studio` or `/studio/<novel>` — null for every other address. */
export function parseStudioPath(pathname: string): { book: string | null } | null {
  const { book, chapter } = parsePath(pathname);
  if (book !== STUDIO_SLUG) return null;
  return { book: chapter };
}

export function studioPath(series?: Series | null, all: Series[] = []): string {
  return series ? `/${STUDIO_SLUG}/${enc(bookSlug(series, all))}` : `/${STUDIO_SLUG}`;
}

export function parsePath(pathname: string): ParsedPath {
  const parts = pathname
    .split("/")
    .filter(Boolean)
    .map((p) => {
      try {
        return decodeURIComponent(p);
      } catch {
        return p;
      }
    });
  return { book: parts[0] ?? null, chapter: parts[1] ?? null };
}

/** Which novel a book segment means; "" for the unsorted shelf, null if none. */
export function resolveBook(segment: string, all: Series[]): Series | "" | null {
  if (segment === UNSORTED_SLUG) return "";
  const exact = all.find((s) => bookSlug(s, all) === segment);
  if (exact) return exact;
  // A renamed novel keeps working through the id suffix, if the link had one.
  const suffix = segment.match(/-([0-9a-f]{6})$/i)?.[1];
  if (suffix) return all.find((s) => s.id.startsWith(suffix)) ?? null;
  return all.find((s) => slugify(s.name) === segment) ?? null;
}

export function resolveChapter<C extends ChapterLike>(segment: string, chapters: C[]): C | null {
  const byId = chapters.find((c) => c.id.startsWith(segment));
  if (byId && segment.length >= 8) return byId;
  const n = Number(segment);
  if (Number.isFinite(n)) {
    return chapters.find((c) => chapterNumber(c) === n) ?? null;
  }
  return null;
}
