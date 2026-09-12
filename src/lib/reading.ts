"use client";

import { get, set } from "idb-keyval";
import { hasScope, scopedKey } from "./db";

/**
 * Where the reader has got to. Kept on the device rather than in the cloud
 * tables: it needs no schema migration against a live database, and "the
 * chapter I am part-way through" is a per-device thing anyway.
 */
export interface ReadMark {
  /** Last time this chapter was opened. */
  openedAt: number;
  /** Set once the reader reached the end of it. */
  finishedAt?: number;
  /** How far down the chapter they were, 0..1. */
  progress?: number;
}

export interface ReadingState {
  marks: Record<string, ReadMark>;
  /** Chapter to reopen on the next launch, if they left mid-read. */
  current: string | null;
}

const EMPTY: ReadingState = { marks: {}, current: null };

const KEY = () => scopedKey("reading");

/** A chapter counts as read once the reader has seen almost all of it. */
export const FINISHED_AT = 0.92;

export async function loadReading(): Promise<ReadingState> {
  if (!hasScope()) return EMPTY;
  const saved = await get<ReadingState>(KEY());
  if (!saved || typeof saved !== "object") return EMPTY;
  return {
    marks: saved.marks ?? {},
    current: saved.current ?? null,
  };
}

export async function saveReading(state: ReadingState): Promise<void> {
  if (!hasScope()) return;
  await set(KEY(), state);
}

/* --------------------------- pure state helpers --------------------------- */

export function openChapterMark(
  state: ReadingState,
  id: string,
): ReadingState {
  const existing = state.marks[id];
  return {
    current: id,
    marks: {
      ...state.marks,
      [id]: { ...existing, openedAt: Date.now() },
    },
  };
}

export function progressMark(
  state: ReadingState,
  id: string,
  progress: number,
): ReadingState {
  const existing = state.marks[id];
  if (!existing) return state;

  // Only ever move a chapter forward into "finished"; re-reading the start of
  // something already finished should not un-finish it.
  const finishedAt =
    existing.finishedAt ?? (progress >= FINISHED_AT ? Date.now() : undefined);

  return {
    ...state,
    marks: { ...state.marks, [id]: { ...existing, progress, finishedAt } },
  };
}

export function clearCurrent(state: ReadingState): ReadingState {
  return { ...state, current: null };
}

export function forgetChapter(state: ReadingState, id: string): ReadingState {
  const marks = { ...state.marks };
  delete marks[id];
  return { marks, current: state.current === id ? null : state.current };
}

export type ReadStatus = "unread" | "reading" | "read";

export function statusOf(mark: ReadMark | undefined): ReadStatus {
  if (!mark) return "unread";
  if (mark.finishedAt) return "read";
  return "reading";
}
