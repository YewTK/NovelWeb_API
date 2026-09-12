import { hostOf } from "./utils";

export interface SeriesRef {
  /** stable identity used to group chapters of the same novel */
  key: string;
  /** human-facing name shown in the glossary panel */
  name: string;
}

/** Path segments that carry no series identity. */
const GENERIC_SEGMENTS = new Set([
  "novel", "novels", "manga", "manhwa", "manhua", "series", "book", "books",
  "read", "reader", "reading", "comic", "comics", "story", "stories",
  "chapter", "chapters", "translation", "translations", "n", "c", "b",
  "en", "th", "jp", "cn", "kr", "index", "home", "wp", "content",
]);

/** A path segment that names a chapter rather than the novel. */
const CHAPTER_SEGMENT =
  /^(?:chapter|chap|ch|episode|ep|part|vol|volume|บทที่|ตอนที่|ตอน|บท)?[-_ ]?\d+/i;

/**
 * Trailing "Chapter 12 - whatever" suffixes on a page title.
 * The ASCII keywords carry \b; the Thai/Chinese/Korean ones must not, because
 * \b only recognises ASCII word characters and would never match beside them.
 */
const CHAPTER_SUFFIX =
  /[\s\-–—|:,]*(?:\b(?:chapter|chap\.?|ch\.?|episode|epis\.?|ep\.?|part|vol\.?|volume)|บทที่|ตอนที่|ตอน|บท|第|제|화)\s*[\d๐-๙一二三四五六七八九十百千零两]+.*$/i;

/** Site-name tails such as " | RoliaScan". */
const SEPARATORS = /\s*[|｜]\s*/;

const TRAILING_PUNCT = /[\s\-–—:|,]+$/;

function humanizeSlug(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Pulls the novel slug out of a chapter URL — far more reliable than the title. */
function slugFromUrl(url: string): string | null {
  let segments: string[];
  try {
    segments = new URL(url).pathname
      .split("/")
      .filter(Boolean)
      .map((s) => {
        try {
          return decodeURIComponent(s);
        } catch {
          return s;
        }
      });
  } catch {
    return null;
  }

  const chapterAt = segments.findIndex((s) => CHAPTER_SEGMENT.test(s));
  const candidates = chapterAt > 0 ? segments.slice(0, chapterAt) : segments;

  for (let i = candidates.length - 1; i >= 0; i--) {
    const seg = candidates[i].replace(/\.(html?|php|aspx?)$/i, "");
    if (seg.length < 2) continue;
    if (/^\d+$/.test(seg)) continue;
    if (GENERIC_SEGMENTS.has(seg.toLowerCase())) continue;
    return seg.toLowerCase();
  }
  return null;
}

/** "Shadow Slave Chapter 1780 - Moonriver Plain" → "Shadow Slave" */
export function stripChapterMarkers(title: string): string {
  const head = title.split(SEPARATORS)[0] ?? title;
  return head.replace(CHAPTER_SUFFIX, "").replace(TRAILING_PUNCT, "").trim();
}

/**
 * "Chapter 1782 | Shadow Slave | RoliaScan" → "Shadow Slave".
 * Read left to right: the first segment that is not purely a chapter marker is
 * the series, while the site name sits at the far right.
 */
function nameFromSeparators(title: string): string {
  const parts = title.split(SEPARATORS).map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const candidate = part.replace(CHAPTER_SUFFIX, "").replace(TRAILING_PUNCT, "").trim();
    if (candidate.length >= 2) return candidate;
  }
  return "";
}

export function deriveSeries(title: string, url: string | null): SeriesRef {
  const host = url ? hostOf(url) : "";
  const slug = url ? slugFromUrl(url) : null;

  const name =
    stripChapterMarkers(title) ||
    (slug ? humanizeSlug(slug) : "") ||
    nameFromSeparators(title) ||
    host ||
    "งานแปลของฉัน";

  const identity = (slug ?? name).toLowerCase().replace(/\s+/g, "-");
  return { key: `${host}::${identity}`, name };
}

/**
 * Comparison key for "is this the same novel?" across sites.
 * Strips everything but letters and digits, so "Shadow Slave", "shadow-slave"
 * and "Shadow  Slave!" all collapse onto the same value.
 */
export function nameKey(name: string): string {
  return name.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}
