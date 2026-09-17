import type { GlossaryEntry } from "./types";

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Folds newly discovered terms into the running series glossary.
 * Existing entries win, so a rendering the reader edited by hand is never
 * silently overwritten by a later chapter's extraction pass. There is no cap:
 * a long novel legitimately collects thousands of names.
 */
export function mergeGlossary(
  existing: GlossaryEntry[],
  incoming: GlossaryEntry[],
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

  return [...seen.values()];
}

/** Drops blank rows left behind by the glossary editor. */
export function cleanGlossary(entries: GlossaryEntry[]): GlossaryEntry[] {
  return entries.filter((e) => e.source.trim() && e.target.trim());
}

/**
 * The terms that actually occur in this chapter. Sending a novel's whole
 * glossary with every request grows the prompt without bound — slower, dearer,
 * and it dilutes the model's attention — so only what the text uses goes out.
 */
export function relevantGlossary(
  glossary: GlossaryEntry[],
  texts: string[],
): GlossaryEntry[] {
  if (glossary.length <= 60) return glossary;
  const haystack = texts.join("\n").toLowerCase();
  return glossary.filter((g) => {
    const needle = g.source.trim().toLowerCase();
    return needle.length > 0 && haystack.includes(needle);
  });
}

/**
 * Reads terms pasted as lines: "source = target", "source → target | note",
 * tab-separated spreadsheet rows, or CSV. Lines that don't parse are skipped.
 */
export function parseGlossaryText(text: string): GlossaryEntry[] {
  const out: GlossaryEntry[] = [];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    let source = "";
    let rest = "";
    const sep = line.match(/\s*(?:=>|->|→|=|\t|:)\s*/);
    if (sep && sep.index !== undefined && sep.index > 0) {
      source = line.slice(0, sep.index);
      rest = line.slice(sep.index + sep[0].length);
    } else if (line.includes(",")) {
      const [a, ...b] = line.split(",");
      source = a;
      rest = b.join(",");
    } else {
      continue;
    }

    let target = rest;
    let note = "";
    const noteSep = rest.match(/\s*(?:\||\t|\(|,)\s*/);
    if (noteSep && noteSep.index !== undefined && noteSep.index > 0) {
      target = rest.slice(0, noteSep.index);
      note = rest.slice(noteSep.index + noteSep[0].length).replace(/\)\s*$/, "");
    }

    source = source.trim().replace(/^["']|["']$/g, "");
    target = target.trim().replace(/^["']|["']$/g, "");
    if (source && target) out.push({ source, target, note: note.trim() });
  }
  return out;
}

/** One term per line, in the same format parseGlossaryText reads back. */
export function glossaryToText(entries: GlossaryEntry[]): string {
  return entries
    .map((g) => `${g.source} = ${g.target}${g.note ? ` | ${g.note}` : ""}`)
    .join("\n");
}
