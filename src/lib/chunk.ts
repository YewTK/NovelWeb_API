import { estimateTokens } from "./utils";

export interface ChunkUnit {
  id: number;
  text: string;
}

export interface Chunk {
  index: number;
  units: ChunkUnit[];
}

const TARGET_TOKENS = 1100;
const HARD_MAX_UNITS = 40;

/**
 * Groups paragraphs into batches small enough that the model reliably keeps
 * the [[n]] markers aligned, while staying big enough for good context.
 * A paragraph is never split across chunks.
 */
export function buildChunks(paragraphs: string[]): Chunk[] {
  const chunks: Chunk[] = [];
  let current: ChunkUnit[] = [];
  let budget = 0;

  paragraphs.forEach((text, i) => {
    const unit: ChunkUnit = { id: i, text };
    const cost = estimateTokens(text);

    if (
      current.length > 0 &&
      (budget + cost > TARGET_TOKENS || current.length >= HARD_MAX_UNITS)
    ) {
      chunks.push({ index: chunks.length, units: current });
      current = [];
      budget = 0;
    }

    current.push(unit);
    budget += cost;
  });

  if (current.length) chunks.push({ index: chunks.length, units: current });
  return chunks;
}

/** Tail of a chunk used as continuity context for the next one. */
export function tailOf(units: { text: string }[], maxChars = 420): string {
  const joined = units.map((u) => u.text).join("\n\n");
  return joined.length <= maxChars ? joined : "…" + joined.slice(-maxChars);
}

/**
 * Incrementally parses a stream of `[[n]] text` blocks.
 * Feed it the full accumulated text each time; it returns the current
 * best-known translation per paragraph id.
 */
export function parseMarkers(raw: string): Map<number, string> {
  const out = new Map<number, string>();
  const re = /\[\[(\d+)\]\]/g;
  const hits: { id: number; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    hits.push({ id: Number(m[1]), start: m.index, end: m.index + m[0].length });
  }
  hits.forEach((hit, i) => {
    const next = hits[i + 1];
    const body = raw.slice(hit.end, next ? next.start : raw.length);
    out.set(hit.id, body.replace(/^[ \t]+/, "").trimEnd());
  });
  return out;
}

/** Client-safe splitter for text the reader pasted in by hand. */
export function splitPastedText(text: string): { title: string; paragraphs: string[] } {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const first = lines[0] ?? "";
  const looksLikeTitle = first.length > 0 && first.length <= 90 && lines.length > 1;

  return {
    title: looksLikeTitle ? first : "ข้อความที่วางไว้",
    paragraphs: looksLikeTitle ? lines.slice(1) : lines,
  };
}
