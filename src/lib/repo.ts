"use client";

import * as local from "./db";
import { cloudConfigured, supabase } from "./supabase";
import type { Chapter, Paragraph, GlossaryEntry, Series } from "./types";
import type { SeriesRef } from "./series";

export type CloudStatus =
  | "disabled"
  | "connecting"
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

let status: CloudStatus = cloudConfigured ? "connecting" : "disabled";
let userId: string | null = null;
let userEmail: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeCloud(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function cloudSnapshot() {
  return { status, userId, userEmail };
}

let initPromise: Promise<void> | null = null;

/** Signs in anonymously so every device gets an RLS-protected identity with no signup friction. */
export function initCloud(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const sb = supabase();
    if (!sb) {
      status = "disabled";
      emit();
      return;
    }

    sb.auth.onAuthStateChange((_event, session) => {
      userId = session?.user?.id ?? null;
      userEmail = session?.user?.email ?? null;
      if (userId) status = "ready";
      emit();
    });

    try {
      const { data } = await sb.auth.getSession();
      if (data.session) {
        userId = data.session.user.id;
        userEmail = data.session.user.email ?? null;
        status = "ready";
      } else {
        const { data: anon, error } = await sb.auth.signInAnonymously();
        if (error || !anon.user) {
          // Anonymous sign-ins not enabled, or the device is offline.
          status = navigator.onLine ? "error" : "offline";
        } else {
          userId = anon.user.id;
          status = "ready";
        }
      }
    } catch {
      status = navigator.onLine ? "error" : "offline";
    }
    emit();
  })();

  return initPromise;
}

export async function linkEmail(email: string): Promise<void> {
  const sb = supabase();
  if (!sb) throw new Error("ยังไม่ได้ตั้งค่า Supabase");
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw new Error(error.message);
}

export async function signOutCloud(): Promise<void> {
  const sb = supabase();
  if (!sb) return;
  await sb.auth.signOut();
  userId = null;
  userEmail = null;
  status = "connecting";
  emit();
  initPromise = null;
  await initCloud();
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
  const all = await local.listChapters();
  if (!all.length) return 0;
  const { error } = await sb
    .from("chapters")
    .upsert(all.map((c) => chapterToRow(c, userId!)), { onConflict: "id" });
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
