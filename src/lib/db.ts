import { del, get, set, keys } from "idb-keyval";
import type { Chapter, Series } from "./types";

const CH = (id: string) => `chapter:${id}`;
const SE = (id: string) => `series:${id}`;

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
  const ks = (await keys()) as string[];
  const items = await Promise.all(
    ks.filter((k) => typeof k === "string" && k.startsWith("chapter:")).map((k) => get<Chapter>(k)),
  );
  return items
    .filter((c): c is Chapter => Boolean(c))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveSeries(series: Series): Promise<void> {
  await set(SE(series.id), series);
}

export async function listSeries(): Promise<Series[]> {
  const ks = (await keys()) as string[];
  const items = await Promise.all(
    ks.filter((k) => typeof k === "string" && k.startsWith("series:")).map((k) => get<Series>(k)),
  );
  return items
    .filter((s): s is Series => Boolean(s))
    .sort((a, b) => b.createdAt - a.createdAt);
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
