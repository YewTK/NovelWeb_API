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
