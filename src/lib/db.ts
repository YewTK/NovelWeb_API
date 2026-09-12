import { del, get, set, keys } from "idb-keyval";
import type { Chapter, Series } from "./types";

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
const SE = (id: string) => `${prefix()}series:${id}`;

async function allKeys(): Promise<string[]> {
  return (await keys()).filter((k): k is string => typeof k === "string");
}

async function collectChapters(owner: string): Promise<Chapter[]> {
  const ks = (await allKeys()).filter((k) => k.startsWith(`${owner}chapter:`));
  const items = await Promise.all(ks.map((k) => get<Chapter>(k)));
  return items.filter((x): x is Chapter => Boolean(x));
}

async function collectSeries(owner: string): Promise<Series[]> {
  const ks = (await allKeys()).filter((k) => k.startsWith(`${owner}series:`));
  const items = await Promise.all(ks.map((k) => get<Series>(k)));
  return items.filter((x): x is Series => Boolean(x));
}

/* -------------------------------- chapters -------------------------------- */

export async function saveChapter(chapter: Chapter): Promise<void> {
  await set(CH(chapter.id), chapter);
}

export async function loadChapter(id: string): Promise<Chapter | undefined> {
  return get<Chapter>(CH(id));
}

export async function deleteChapter(id: string): Promise<void> {
  await del(CH(id));
}

export async function listChapters(): Promise<Chapter[]> {
  // No signed-in reader means nothing to show — never fall through to the
  // unprefixed legacy records, which belong to whoever adopts them.
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
  await Promise.all(
    ks
      .filter((k) => k.startsWith("chapter:") || k.startsWith("series:"))
      .map((k) => del(k)),
  );
}
