import { estimateTokens } from "./utils";
import type { ProviderConfig } from "./types";

/** USD per 1M tokens. Only providers with a stable public price list are included. */
const PRICES: Record<string, { in: number; out: number }> = {
  "claude-opus-5": { in: 5, out: 25 },
  "claude-sonnet-5": { in: 2, out: 10 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};

/** Prompt overhead charged once per chunk: system prompt, glossary and continuity context. */
const PER_CHUNK_OVERHEAD = 750;

export interface Estimate {
  sourceTokens: number;
  chunks: number;
  usd: number | null;
}

export function estimateJob(
  paragraphs: string[],
  chunkCount: number,
  config: ProviderConfig,
): Estimate {
  const sourceTokens = paragraphs.reduce((sum, p) => sum + estimateTokens(p), 0);
  const price = PRICES[config.model];

  if (!price) return { sourceTokens, chunks: chunkCount, usd: null };

  const inputTokens = sourceTokens + chunkCount * PER_CHUNK_OVERHEAD;
  // Translations into Thai run longer than the source; thinking tokens are billed as output too.
  const outputTokens = sourceTokens * 1.4;
  const usd = (inputTokens * price.in + outputTokens * price.out) / 1_000_000;

  return { sourceTokens, chunks: chunkCount, usd };
}

export function formatUsd(usd: number): string {
  if (usd < 0.01) return "< $0.01";
  return `~$${usd.toFixed(2)}`;
}

/* ------------------------------ writing studio ----------------------------- */

export interface WritingEstimate {
  words: number;
  requests: number;
  outputTokens: number;
  usd: number | null;
  /** rough wall-clock minutes at typical streaming speed */
  minutes: number;
}

/**
 * What writing a whole novel is likely to cost. Thai prose runs about four
 * characters a word and close to a token a character; every part of every
 * chapter also re-sends the story bible, mostly served from the prompt cache.
 */
export function estimateWriting(
  project: { chapterCount: number; wordsPerChapter: number; language: string },
  config: ProviderConfig,
  chapters = project.chapterCount,
  /** false when the plan already exists and only chapters remain */
  withOutline = true,
): WritingEstimate {
  const perWord = project.language === "th" ? 4.4 : 1.5;
  const parts = Math.max(1, Math.ceil(project.wordsPerChapter / 1400));
  const words = chapters * project.wordsPerChapter;
  const outline = withOutline ? project.chapterCount * (project.language === "th" ? 260 : 130) + 3500 : 0;
  const outputTokens = Math.round(words * perWord + outline);
  const requests = chapters * parts + (withOutline ? Math.ceil(project.chapterCount / 25) : 0);
  // ~4k tokens of bible and context per request, ~70% of it cache reads at a tenth of the price.
  const inputTokens = requests * 4000;
  const price = PRICES[config.model];
  const usd = price
    ? (inputTokens * price.in * 0.37 + outputTokens * price.out) / 1_000_000
    : null;
  return { words, requests, outputTokens, usd, minutes: Math.max(1, Math.round(outputTokens / 70 / 60)) };
}
