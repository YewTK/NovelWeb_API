"use client";

import * as local from "./db";
import { cloudConfigured, supabase } from "./supabase";
import type { BookInfo, Chapter, ChapterMeta, Paragraph, GlossaryEntry, Series } from "./types";
import { nameKey, type SeriesRef } from "./series";
import { mergeGlossary } from "./glossary";
import {
  LEGACY_OWNER,
  currentUser,
  onAuthChange,
  signIn as authSignIn,
  signOut as authSignOut,
  signUp as authSignUp,
  type AuthUser,
} from "./auth";

export type CloudStatus =
  | "disabled"
  | "connecting"
  | "signedOut"
  | "ready"
  | "offline"
  | "error";

interface Row {
  id: string;
  series_id: string | null;
  title: string;
  translated_title: string;
  source_url: string | null;
  site_name: string | null;
  next_url: string | null;
  prev_url: string | null;
  paragraphs: Paragraph[];
  glossary: GlossaryEntry[];
  status: Chapter["status"];
  progress: number;
  model: string;
  target_language: string;
  created_at: string;
  updated_at: string;
}

function rowToChapter(r: Row): Chapter {
  return {
    id: r.id,
    seriesId: r.series_id ?? "",
    title: r.title,
    translatedTitle: r.translated_title,
    sourceUrl: r.source_url,
    siteName: r.site_name,
    nextUrl: r.next_url,
    prevUrl: r.prev_url,
    paragraphs: Array.isArray(r.paragraphs) ? r.paragraphs : [],
    glossary: Array.isArray(r.glossary) ? r.glossary : [],
    status: r.status,
    progress: r.progress,
    model: r.model,
    targetLanguage: r.target_language,
    createdAt: new Date(r.created_at).getTime(),
    updatedAt: new Date(r.updated_at).getTime(),
  };
}

function chapterToRow(c: Chapter, userId: string) {
  return {
    id: c.id,
    user_id: userId,
    series_id: c.seriesId || null,
    title: c.title,
    translated_title: c.translatedTitle,
    source_url: c.sourceUrl,
    site_name: c.siteName,
    next_url: c.nextUrl,
    prev_url: c.prevUrl,
    paragraphs: c.paragraphs,
    glossary: c.glossary,
    status: c.status,
    progress: c.progress,
    model: c.model,
    target_language: c.targetLanguage,
  };
}

/* ------------------------------- auth state ------------------------------ */

export const ADOPT_FLAG = "novelflow.legacyAdopted";

let status: CloudStatus = cloudConfigured ? "connecting" : "disabled";
let user: AuthUser | null = null;
let userId: string | null = null;
let adoptedCount = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeCloud(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function cloudSnapshot() {
  return { status, user, userId, username: user?.username ?? null };
}

/**
 * How many chapters were inherited from the pre-login bookshelf. Read once by
 * the UI so it can say so, then reset.
 */
export function consumeAdoptionNotice(): number {
  const n = adoptedCount;
  adoptedCount = 0;
  return n;
}

/**
 * Hands the bookshelf built before accounts existed to the owner named in
 * LEGACY_OWNER, once per browser. Everything is merged in as-is — same ids,
 * same shelves — then pushed up so other devices see it too.
 */
async function adoptLegacy(owner: AuthUser): Promise<void> {
  if (owner.username !== LEGACY_OWNER) return;
  try {
    if (localStorage.getItem(ADOPT_FLAG)) return;
  } catch {
    return;
  }

  const { chapters, series } = await local.readLegacy();
  if (chapters.length || series.length) {
    for (const novel of series) await local.saveSeries(novel);
    for (const chapter of chapters) await local.saveChapter(chapter);
    await local.clearLegacy();
    adoptedCount = chapters.length;
  }

  try {
    localStorage.setItem(ADOPT_FLAG, "1");
  } catch {
    /* private mode — it will simply be attempted again next time */
  }

  if (chapters.length || series.length) await pushAllLocal();
}

/** Scope used when the project has no Supabase at all: one reader, this device. */
export const LOCAL_SCOPE = "local";

/* Server timestamps per row, cached in memory and written back lazily. */
let syncMarks: Record<string, number> = {};
let syncTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSyncSave() {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => void local.saveSyncMarks(syncMarks), 800);
}

function markSynced(id: string, serverTime: string | null | undefined) {
  const at = serverTime ? Date.parse(serverTime) : NaN;
  if (!Number.isFinite(at)) return;
  syncMarks[id] = at;
  scheduleSyncSave();
}

function forgetSynced(id: string) {
  if (!(id in syncMarks)) return;
  delete syncMarks[id];
  scheduleSyncSave();
}

/** Points the local cache at this reader and refreshes the cloud status. */
async function applyUser(next: AuthUser | null): Promise<void> {
  const changed = next?.id !== userId;
  user = next;
  userId = next?.id ?? null;
  local.setScope(userId);
  if (changed) syncMarks = userId ? await local.loadSyncMarks() : {};
  status = next ? "ready" : "signedOut";
  emit();
  if (next && changed) await adoptLegacy(next);
}

/**
 * Without Supabase the app still works — everything simply stays on this
 * device. The pre-account bookshelf, if there is one, moves into this scope.
 */
async function enterLocalMode(): Promise<void> {
  local.setScope(LOCAL_SCOPE);
  status = "disabled";
  try {
    if (!localStorage.getItem(ADOPT_FLAG)) {
      const { chapters, series } = await local.readLegacy();
      for (const novel of series) await local.saveSeries(novel);
      for (const chapter of chapters) await local.saveChapter(chapter);
      if (chapters.length || series.length) await local.clearLegacy();
      adoptedCount = chapters.length;
      localStorage.setItem(ADOPT_FLAG, "1");
    }
  } catch {
    /* private mode: nothing to adopt, nothing to remember */
  }
  emit();
}

let initPromise: Promise<void> | null = null;

/** Restores a saved session on boot; no session simply means "show the login". */
export function initCloud(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const sb = supabase();
    if (!sb) {
      await enterLocalMode();
      return;
    }

    onAuthChange((next) => void applyUser(next));

    try {
      await applyUser(await currentUser());
    } catch {
      status = navigator.onLine ? "error" : "offline";
      emit();
    }
  })();

  return initPromise;
}

export async function signInCloud(
  username: string,
  password: string,
): Promise<AuthUser> {
  const next = await authSignIn(username, password);
  await applyUser(next);
  return next;
}

export async function signUpCloud(
  username: string,
  password: string,
): Promise<AuthUser> {
  const next = await authSignUp(username, password);
  await applyUser(next);
  return next;
}

export async function signOutCloud(): Promise<void> {
  for (const timer of pending.values()) clearTimeout(timer);
  pending.clear();
  await authSignOut();
  await applyUser(null);
}

/* --------------------------------- reads --------------------------------- */

/** The whole library as lightweight metadata — never the chapter bodies. */
export async function listChapters(): Promise<ChapterMeta[]> {
  return local.listChapterMetas();
}

export async function getChapter(id: string): Promise<Chapter | undefined> {
  return local.loadChapter(id);
}

/**
 * Brings this device up to date with the cloud in two steps: a cheap listing
 * of ids and server timestamps, then full rows only for chapters that changed
 * since this device last saw them. The whole library — every paragraph of
 * every chapter — used to be downloaded again on every launch.
 */
export async function pullChapters(): Promise<void> {
  const sb = supabase();
  if (!sb || !userId) return;

  const PAGE = 1000;
  const listing: { id: string; updated_at: string }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("chapters")
      .select("id, updated_at")
      .order("updated_at", { ascending: false })
      .range(from, from + PAGE - 1);

    if (error) {
      status = "offline";
      emit();
      return;
    }
    listing.push(...(data as { id: string; updated_at: string }[]));
    if (data.length < PAGE) break;
  }

  const metas = await local.listChapterMetas();
  const mine = new Map(metas.map((m) => [m.id, m]));

  const stale = listing
    .filter((r) => {
      if (!mine.has(r.id)) return true;
      const known = syncMarks[r.id];
      return known === undefined || Date.parse(r.updated_at) > known;
    })
    .map((r) => r.id);

  const BATCH = 40;
  for (let i = 0; i < stale.length; i += BATCH) {
    const { data, error } = await sb
      .from("chapters")
      .select("*")
      .in("id", stale.slice(i, i + BATCH));
    if (error) {
      status = "offline";
      emit();
      return;
    }
    for (const row of data as Row[]) {
      const remote = rowToChapter(row);
      const here = mine.get(remote.id);
      // An edit on this device that has not reached the cloud yet wins.
      const unsent = pending.has(remote.id);
      const known = row.id in syncMarks;
      // Never synced before: fall back to comparing the two clocks.
      const take = !here || (!unsent && (known || remote.updatedAt >= here.updatedAt));
      if (take) await local.saveChapter(remote);
      markSynced(remote.id, row.updated_at);
    }
  }

  if (status !== "ready") {
    status = "ready";
    emit();
  }
}

/* --------------------------------- writes -------------------------------- */

const pending = new Map<string, ReturnType<typeof setTimeout>>();

async function pushChapter(chapter: Chapter): Promise<void> {
  const sb = supabase();
  if (!sb || !userId) return;
  const { data, error } = await sb
    .from("chapters")
    .upsert(chapterToRow(chapter, userId), { onConflict: "id" })
    .select("id, updated_at");
  if (error) {
    status = "offline";
    emit();
    return;
  }
  const row = (data as { id: string; updated_at: string }[] | null)?.[0];
  if (row) markSynced(row.id, row.updated_at);
  if (status !== "ready") {
    status = "ready";
    emit();
  }
}

/**
 * Writes locally right away, then debounces the cloud upsert so a streaming
 * translation does not fire one request per paragraph.
 */
export async function saveChapter(chapter: Chapter, immediate = false): Promise<void> {
  await local.saveChapter(chapter);

  const existing = pending.get(chapter.id);
  if (existing) clearTimeout(existing);

  if (immediate) {
    pending.delete(chapter.id);
    await pushChapter(chapter);
    return;
  }

  pending.set(
    chapter.id,
    setTimeout(() => {
      pending.delete(chapter.id);
      void pushChapter(chapter);
    }, 2500),
  );
}

export async function deleteChapter(id: string): Promise<void> {
  const timer = pending.get(id);
  if (timer) {
    clearTimeout(timer);
    pending.delete(id);
  }
  await local.deleteChapter(id);
  forgetSynced(id);
  const sb = supabase();
  if (sb && userId) await sb.from("chapters").delete().eq("id", id);
}

/** Uploads anything created while the device was offline / signed out. */
export async function pushAllLocal(): Promise<number> {
  const sb = supabase();
  if (!sb || !userId) return 0;
  const owner = userId;

  // Shelves go first so the chapters that point at them never land orphaned.
  const novels = await local.listSeries();
  if (novels.length) await upsertSeries(novels, owner);

  const all = await local.listChapters();
  if (!all.length) return 0;
  // In batches: a whole library in one request can exceed the gateway's body
  // limit and fail as a single all-or-nothing error.
  let sent = 0;
  const BATCH = 25;
  for (let i = 0; i < all.length; i += BATCH) {
    const slice = all.slice(i, i + BATCH);
    const { data, error } = await sb
      .from("chapters")
      .upsert(slice.map((c) => chapterToRow(c, owner)), { onConflict: "id" })
      .select("id, updated_at");
    if (error) break;
    for (const row of (data ?? []) as { id: string; updated_at: string }[]) {
      markSynced(row.id, row.updated_at);
    }
    sent += slice.length;
  }
  return sent;
}

/* -------------------------------- series --------------------------------- */

interface SeriesRow {
  id: string;
  key: string;
  name: string;
  glossary: GlossaryEntry[];
  info?: BookInfo | null;
  created_at: string;
  updated_at: string;
}

function rowToSeries(r: SeriesRow): Series {
  return {
    id: r.id,
    key: r.key ?? "",
    name: r.name,
    glossary: Array.isArray(r.glossary) ? r.glossary : [],
    info: r.info && typeof r.info === "object" ? r.info : undefined,
    createdAt: new Date(r.created_at).getTime(),
    updatedAt: new Date(r.updated_at).getTime(),
  };
}

/**
 * Book details live in a series.info column added after launch. Until the
 * owner re-runs schema.sql the column is missing, so writes fall back to the
 * old shape and the details stay on this device instead of failing the sync.
 */
let infoColumn = true;

function seriesToRow(s: Series, owner: string) {
  return {
    id: s.id,
    user_id: owner,
    key: s.key,
    name: s.name,
    glossary: s.glossary,
    ...(infoColumn ? { info: s.info ?? {} } : {}),
  };
}

async function upsertSeries(list: Series[], owner: string): Promise<void> {
  const sb = supabase();
  if (!sb) return;
  const { error } = await sb
    .from("series")
    .upsert(list.map((n) => seriesToRow(n, owner)), { onConflict: "id" });
  if (error && infoColumn && /info/i.test(error.message ?? "")) {
    infoColumn = false;
    await sb
      .from("series")
      .upsert(list.map((n) => seriesToRow(n, owner)), { onConflict: "id" });
  }
}

/** Mirrors the cloud series list into the local cache (newest wins). */
export async function pullSeries(): Promise<Series[]> {
  const sb = supabase();
  if (!sb || !userId) return local.listSeries();

  const { data, error } = await sb
    .from("series")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1000);

  if (error) return local.listSeries();

  const remote = (data as SeriesRow[]).map(rowToSeries);
  const cached = await local.listSeries();
  const byId = new Map(cached.map((s) => [s.id, s]));

  for (const r of remote) {
    const existing = byId.get(r.id);
    if (!existing || r.updatedAt > existing.updatedAt) {
      // Without the cloud column, keep the details this device already has.
      const merged = r.info ? r : { ...r, info: existing?.info };
      byId.set(r.id, merged);
      await local.saveSeries(merged);
    }
  }
  return [...byId.values()];
}

async function pushSeries(series: Series): Promise<void> {
  if (!userId) return;
  await upsertSeries([series], userId);
}

/**
 * Finds the novel this chapter belongs to, creating it on first sight.
 * The returned glossary is the accumulated one for the whole novel.
 */
export async function ensureSeries(ref: SeriesRef): Promise<Series> {
  const existing = await local.getSeriesByKey(ref.key);
  if (existing) return existing;

  // The key carries the host, so the same novel read on a second site would
  // otherwise open a second shelf. Fall back to matching on the novel's name.
  const twin = await findSeriesByName(ref.name);
  if (twin) return twin;

  const created: Series = {
    id: crypto.randomUUID(),
    key: ref.key,
    name: ref.name,
    glossary: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await local.saveSeries(created);
  void pushSeries(created);
  return created;
}

export async function saveSeries(series: Series): Promise<void> {
  const next = { ...series, updatedAt: Date.now() };
  await local.saveSeries(next);
  void pushSeries(next);
}

export async function getSeriesById(id: string): Promise<Series | undefined> {
  return local.getSeries(id);
}

export async function listSeries(): Promise<Series[]> {
  return local.listSeries();
}

export async function deleteSeries(id: string): Promise<void> {
  await local.deleteSeries(id);
  const sb = supabase();
  if (sb && userId) await sb.from("series").delete().eq("id", id);
}

/** Finds an existing shelf whose name means the same novel, whatever site it came from. */
export async function findSeriesByName(name: string): Promise<Series | undefined> {
  const key = nameKey(name);
  // Two or fewer characters is too thin a match to merge two shelves on.
  if (key.length < 3) return undefined;
  const all = await local.listSeries();
  return all.find((s) => nameKey(s.name) === key);
}

/**
 * Pulls chapters onto another novel's shelf, folding the two glossaries
 * together so no locked term is lost, and retires the shelf they came from.
 */
export async function mergeIntoSeries(
  source: { seriesId: string; chapterIds: string[] },
  targetId: string,
): Promise<Series | undefined> {
  const target = await local.getSeries(targetId);
  if (!target || targetId === source.seriesId) return undefined;

  const from = source.seriesId ? await local.getSeries(source.seriesId) : undefined;
  const merged: Series = {
    ...target,
    glossary: from ? mergeGlossary(target.glossary, from.glossary) : target.glossary,
    updatedAt: Date.now(),
  };
  await local.saveSeries(merged);
  void pushSeries(merged);

  for (const id of source.chapterIds) {
    const chapter = await local.loadChapter(id);
    if (!chapter) continue;
    await saveChapter({ ...chapter, seriesId: targetId, updatedAt: Date.now() }, true);
  }

  if (from) await deleteSeries(from.id);
  return merged;
}

/**
 * Removes a whole novel: every chapter filed under it, then the shelf itself
 * along with its glossary. There is no undo, so callers must confirm first.
 */
export async function deleteShelf(
  seriesId: string,
  chapterIds: string[],
): Promise<void> {
  for (const id of chapterIds) await deleteChapter(id);
  if (seriesId) await deleteSeries(seriesId);
}

/** Renames a shelf — the handle the reader recognises the novel by. */
export async function renameSeries(id: string, name: string): Promise<Series | undefined> {
  const found = await local.getSeries(id);
  if (!found) return undefined;
  const next = { ...found, name: name.trim() || found.name, updatedAt: Date.now() };
  await local.saveSeries(next);
  void pushSeries(next);
  return next;
}
