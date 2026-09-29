import { del, delMany, get, getMany, keys, set, setMany } from "idb-keyval";
import type { Chapter, ChapterMeta, Series } from "./types";

/**
 * Every cached record is filed under the reader who owns it, so two accounts
 * sharing a browser never see each other's shelves. Records written before
 * logins existed carry no prefix — those are the "legacy" ones below, adopted
 * once by the account named in LEGACY_OWNER.
 */
let scope: string | null = null;

export function setScope(userId: string | null): void {
  scope = userId;
}

const prefix = () => (scope ? `u:${scope}:` : "");

/** Namespaced key for anything else this reader owns locally. */
export function scopedKey(name: string): string {
  return `${prefix()}${name}`;
}

export function hasScope(): boolean {
  return Boolean(scope);
}

const CH = (id: string) => `${prefix()}chapter:${id}`;
/**
 * A chapter's body-less twin. The shelf, the table of contents and duplicate
 * checks only need these, so the home screen never has to pull every
 * paragraph of every chapter out of IndexedDB just to draw a few covers.
 */
const META = (id: string) => `${prefix()}meta:${id}`;
const SE = (id: string) => `${prefix()}series:${id}`;

async function allKeys(): Promise<string[]> {
  return (await keys()).filter((k): k is string => typeof k === "string");
}

/** One read transaction for the lot, instead of one per record. */
async function readAll<T>(ks: string[]): Promise<T[]> {
  if (!ks.length) return [];
  const items = await getMany<T>(ks);
  return items.filter((x): x is Awaited<T> & NonNullable<T> => Boolean(x));
}

async function collectChapters(owner: string): Promise<Chapter[]> {
  const ks = (await allKeys()).filter((k) => k.startsWith(`${owner}chapter:`));
  return readAll<Chapter>(ks);
}

async function collectSeries(owner: string): Promise<Series[]> {
  const ks = (await allKeys()).filter((k) => k.startsWith(`${owner}series:`));
  return readAll<Series>(ks);
}

export function toMeta(chapter: Chapter): ChapterMeta {
  const { paragraphs, glossary, ...rest } = chapter;
  return {
    ...rest,
    paragraphCount: paragraphs.length,
    missingCount: paragraphs.filter((p) => !p.target && p.source.trim()).length,
    glossaryCount: glossary.length,
  };
}

/* -------------------------------- chapters -------------------------------- */

export async function saveChapter(chapter: Chapter): Promise<void> {
  await setMany([
    [CH(chapter.id), chapter],
    [META(chapter.id), toMeta(chapter)],
  ]);
}

export async function loadChapter(id: string): Promise<Chapter | undefined> {
  return get<Chapter>(CH(id));
}

export async function deleteChapter(id: string): Promise<void> {
  await delMany([CH(id), META(id)]);
}

/**
 * Every chapter's metadata, newest first. Chapters saved before the index
 * existed are indexed on the way through, once.
 */
export async function listChapterMetas(): Promise<ChapterMeta[]> {
  // No signed-in reader means nothing to show — never fall through to the
  // unprefixed legacy records, which belong to whoever adopts them.
  if (!scope) return [];
  const p = prefix();
  const ks = await allKeys();

  const metaIds = new Set<string>();
  const chapterIds: string[] = [];
  for (const k of ks) {
    if (k.startsWith(`${p}meta:`)) metaIds.add(k.slice(p.length + 5));
    else if (k.startsWith(`${p}chapter:`)) chapterIds.push(k.slice(p.length + 8));
  }

  const metas = await readAll<ChapterMeta>([...metaIds].map(META));

  const unindexed = chapterIds.filter((id) => !metaIds.has(id));
  if (unindexed.length) {
    const full = await readAll<Chapter>(unindexed.map(CH));
    const built = full.map(toMeta);
    await setMany(built.map((m) => [META(m.id), m]));
    metas.push(...built);
  }

  // A meta whose chapter is gone would be a ghost row on the shelf.
  const alive = new Set(chapterIds);
  return metas
    .filter((m) => alive.has(m.id))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Full chapters — only for bulk uploads; the UI works from metas. */
export async function listChapters(): Promise<Chapter[]> {
  if (!scope) return [];
  const items = await collectChapters(prefix());
  return items.sort((a, b) => b.updatedAt - a.updatedAt);
}

/* --------------------------------- series --------------------------------- */

export async function saveSeries(series: Series): Promise<void> {
  await set(SE(series.id), series);
}

export async function listSeries(): Promise<Series[]> {
  if (!scope) return [];
  const items = await collectSeries(prefix());
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getSeries(id: string): Promise<Series | undefined> {
  return get<Series>(SE(id));
}

export async function getSeriesByKey(key: string): Promise<Series | undefined> {
  const all = await listSeries();
  return all.find((s) => s.key === key);
}

export async function deleteSeries(id: string): Promise<void> {
  await del(SE(id));
}

/* ------------------------------- sync marks -------------------------------- */

/**
 * The server's own `updated_at` for each row the last time this device and
 * the cloud agreed on it. Comparing server time with server time is what lets
 * a pull skip rows it already has — the old client-clock comparison was
 * always "older", so every launch re-downloaded the whole library.
 */
const SYNC = () => `${prefix()}sync`;

export async function loadSyncMarks(): Promise<Record<string, number>> {
  if (!scope) return {};
  return (await get<Record<string, number>>(SYNC())) ?? {};
}

export async function saveSyncMarks(marks: Record<string, number>): Promise<void> {
  if (!scope) return;
  await set(SYNC(), marks);
}

/* --------------------------- pre-login leftovers -------------------------- */

/** Chapters and series saved back when the app had no accounts at all. */
export async function readLegacy(): Promise<{
  chapters: Chapter[];
  series: Series[];
}> {
  const ks = await allKeys();
  const legacy = ks.filter(
    (k) => k.startsWith("chapter:") || k.startsWith("series:"),
  );
  if (!legacy.length) return { chapters: [], series: [] };

  const chapters = await collectChapters("");
  const series = await collectSeries("");
  return { chapters, series };
}

export async function clearLegacy(): Promise<void> {
  const ks = await allKeys();
  await delMany(
    ks.filter(
      (k) => k.startsWith("chapter:") || k.startsWith("series:") || k.startsWith("meta:"),
    ),
  );
}
