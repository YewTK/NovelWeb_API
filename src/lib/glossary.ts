import type { GlossaryEntry } from "./types";

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Folds newly discovered terms into the running series glossary.
 * Existing entries win, so a rendering the reader edited by hand is never
 * silently overwritten by a later chapter's extraction pass.
 */
export function mergeGlossary(
  existing: GlossaryEntry[],
  incoming: GlossaryEntry[],
  limit = 400,
): GlossaryEntry[] {
  const seen = new Map<string, GlossaryEntry>();

  for (const entry of existing) {
    if (!entry?.source?.trim() || !entry?.target?.trim()) continue;
    seen.set(norm(entry.source), entry);
  }

  for (const entry of incoming) {
    if (!entry?.source?.trim() || !entry?.target?.trim()) continue;
    const key = norm(entry.source);
    if (seen.has(key)) continue;
    seen.set(key, entry);
  }

  return [...seen.values()].slice(0, limit);
}

/** Drops blank rows left behind by the glossary editor. */
export function cleanGlossary(entries: GlossaryEntry[]): GlossaryEntry[] {
  return entries.filter((e) => e.source.trim() && e.target.trim());
}
