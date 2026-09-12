"use client";

import * as local from "./db";
import { cloudConfigured, supabase } from "./supabase";
import type { Chapter, Paragraph, GlossaryEntry, Series } from "./types";
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

/** Points the local cache at this reader and refreshes the cloud status. */
async function applyUser(next: AuthUser | null): Promise<void> {
  const changed = next?.id !== userId;
  user = next;
  userId = next?.id ?? null;
  local.setScope(userId);
  status = next ? "ready" : "signedOut";
  emit();
  if (next && changed) await adoptLegacy(next);
}

let initPromise: Promise<void> | null = null;

/** Restores a saved session on boot; no session simply means "show the login". */
export function initCloud(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const sb = supabase();
    if (!sb) {
      status = "disabled";
      emit();
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

export async function listChapters(): Promise<Chapter[]> {
  return local.listChapters();
}

export async function getChapter(id: string): Promise<Chapter | undefined> {
  return local.loadChapter(id);
}

/** Pulls the cloud library down and merges it into the local cache (newest wins). */
export async function pullChapters(): Promise<Chapter[]> {
  const sb = supabase();
  if (!sb || !userId) return local.listChapters();

  const { data, error } = await sb
    .from("chapters")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(300);

  if (error) {
    status = "offline";
    emit();
    return local.listChapters();
  }

  const remote = (data as Row[]).map(rowToChapter);
  const localList = await local.listChapters();
  const byId = new Map(localList.map((c) => [c.id, c]));

  for (const r of remote) {
    const existing = byId.get(r.id);
    if (!existing || r.updatedAt > existing.updatedAt) {
      byId.set(r.id, r);
      await local.saveChapter(r);
    }
  }

  status = "ready";
  emit();
  return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

/* --------------------------------- writes -------------------------------- */

const pending = new Map<string, ReturnType<typeof setTimeout>>();

async function pushChapter(chapter: Chapter): Promise<void> {
  const sb = supabase();
  if (!sb || !userId) return;
  const { error } = await sb
    .from("chapters")
    .upsert(chapterToRow(chapter, userId), { onConflict: "id" });
  if (error) {
    status = "offline";
    emit();
  } else if (status !== "ready") {
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
  if (novels.length) {
    await sb
      .from("series")
      .upsert(novels.map((n) => seriesToRow(n, owner)), { onConflict: "id" });
  }

  const all = await local.listChapters();
  if (!all.length) return 0;
  const { error } = await sb
    .from("chapters")
    .upsert(all.map((c) => chapterToRow(c, owner)), { onConflict: "id" });
  return error ? 0 : all.length;
}

/* -------------------------------- series --------------------------------- */

interface SeriesRow {
  id: string;
  key: string;
  name: string;
  glossary: GlossaryEntry[];
  created_at: string;
  updated_at: string;
}

function rowToSeries(r: SeriesRow): Series {
  return {
    id: r.id,
    key: r.key ?? "",
    name: r.name,
    glossary: Array.isArray(r.glossary) ? r.glossary : [],
    createdAt: new Date(r.created_at).getTime(),
    updatedAt: new Date(r.updated_at).getTime(),
  };
}

function seriesToRow(s: Series, owner: string) {
  return {
    id: s.id,
    user_id: owner,
    key: s.key,
    name: s.name,
    glossary: s.glossary,
  };
}

/** Mirrors the cloud series list into the local cache (newest wins). */
export async function pullSeries(): Promise<Series[]> {
  const sb = supabase();
  if (!sb || !userId) return local.listSeries();

  const { data, error } = await sb
    .from("series")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) return local.listSeries();

  const remote = (data as SeriesRow[]).map(rowToSeries);
  const cached = await local.listSeries();
  const byId = new Map(cached.map((s) => [s.id, s]));

  for (const r of remote) {
    const existing = byId.get(r.id);
    if (!existing || r.updatedAt > existing.updatedAt) {
      byId.set(r.id, r);
      await local.saveSeries(r);
    }
  }
  return [...byId.values()];
}

async function pushSeries(series: Series): Promise<void> {
  const sb = supabase();
  if (!sb || !userId) return;
  await sb.from("series").upsert(seriesToRow(series, userId), { onConflict: "id" });
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

/** Renames a shelf — the handle the reader recognises the novel by. */
export async function renameSeries(id: string, name: string): Promise<Series | undefined> {
  const found = await local.getSeries(id);
  if (!found) return undefined;
  const next = { ...found, name: name.trim() || found.name, updatedAt: Date.now() };
  await local.saveSeries(next);
  void pushSeries(next);
  return next;
}
