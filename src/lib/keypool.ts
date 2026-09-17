"use client";

/**
 * Hands out API keys so a translation never trips the provider's rate limit,
 * and routes around a key the moment it does.
 *
 * - Each key keeps a sliding one-minute window of request start times; a key
 *   at its per-minute budget is skipped until a slot frees up.
 * - A 429 puts the key on cooldown for as long as the provider asked (or a
 *   sensible default), and the work moves to the next key.
 * - A key whose daily quota or credit is gone sits out for hours; a key the
 *   provider rejects outright sits out for the rest of the session.
 *
 * State lives at module level so every chapter, glossary pass and retry shares
 * one view of each key.
 */

interface KeyState {
  starts: number[];
  cooldownUntil: number;
  inFlight: number;
  lastUsed: number;
  /** why the key is resting, for the settings screen */
  reason?: "rate" | "day" | "invalid";
}

const states = new Map<string, KeyState>();
const listeners = new Set<() => void>();

const WINDOW_MS = 60_000;
const DEFAULT_COOLDOWN_MS = 20_000;
const DAY_COOLDOWN_MS = 3 * 60 * 60_000;
const INVALID_COOLDOWN_MS = 24 * 60 * 60_000;

function stateOf(key: string): KeyState {
  let s = states.get(key);
  if (!s) {
    s = { starts: [], cooldownUntil: 0, inFlight: 0, lastUsed: 0 };
    states.set(key, s);
  }
  return s;
}

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeKeys(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export type KeyHealth = "ready" | "busy" | "rate" | "day" | "invalid";

export function keyHealth(key: string): { health: KeyHealth; until: number } {
  const s = states.get(key);
  if (!s) return { health: "ready", until: 0 };
  const now = Date.now();
  if (s.cooldownUntil > now) return { health: s.reason ?? "rate", until: s.cooldownUntil };
  if (s.inFlight > 0) return { health: "busy", until: 0 };
  return { health: "ready", until: 0 };
}

/** Clears every penalty — used when the reader edits their keys by hand. */
export function resetKey(key: string) {
  states.delete(key);
  emit();
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export class NoKeyAvailableError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export interface Lease {
  key: string;
  release: () => void;
}

/**
 * Waits for a key that is off cooldown and under its per-minute budget, then
 * reserves one request on it. Among eligible keys the least recently used wins,
 * so traffic spreads evenly instead of hammering the first key.
 *
 * @param rpm requests per minute allowed per key; 0 means no client-side limit
 */
export async function acquireKey(
  keys: string[],
  rpm: number,
  signal?: AbortSignal,
  onWait?: (ms: number) => void,
): Promise<Lease> {
  if (!keys.length) throw new NoKeyAvailableError("ยังไม่ได้ตั้งค่า API Key");

  while (true) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const now = Date.now();
    let best: string | null = null;
    let bestScore = Infinity;
    let wakeAt = Infinity;
    let usable = 0;

    for (const key of keys) {
      const s = stateOf(key);
      s.starts = s.starts.filter((t) => now - t < WINDOW_MS);

      if (s.reason === "invalid" && s.cooldownUntil > now) continue;
      if (s.reason === "day" && s.cooldownUntil > now) continue;
      usable += 1;

      if (s.cooldownUntil > now) {
        wakeAt = Math.min(wakeAt, s.cooldownUntil);
        continue;
      }
      if (rpm > 0 && s.starts.length >= rpm) {
        wakeAt = Math.min(wakeAt, s.starts[0] + WINDOW_MS);
        continue;
      }

      // Prefer idle keys, then the one that has rested longest.
      const score = s.inFlight * 1e13 + s.lastUsed;
      if (score < bestScore) {
        bestScore = score;
        best = key;
      }
    }

    if (best) {
      const s = stateOf(best);
      s.starts.push(now);
      s.inFlight += 1;
      s.lastUsed = now;
      if (s.cooldownUntil <= now) s.reason = undefined;
      emit();
      let released = false;
      return {
        key: best,
        release: () => {
          if (released) return;
          released = true;
          s.inFlight = Math.max(0, s.inFlight - 1);
          emit();
        },
      };
    }

    if (usable === 0) {
      const reasons = keys.map((k) => stateOf(k).reason);
      throw new NoKeyAvailableError(
        reasons.every((r) => r === "invalid")
          ? "API Key ทุกตัวใช้ไม่ได้ ตรวจสอบคีย์ในหน้าตั้งค่า"
          : "โควตารายวันของ API Key ทุกตัวหมดแล้ว — เพิ่มคีย์จากบัญชี/โปรเจกต์อื่น หรือรอโควตารีเซ็ต",
      );
    }

    const wait = Math.max(250, Math.min(wakeAt - now, 65_000));
    onWait?.(wait);
    await sleep(wait, signal);
  }
}

/** Records what the provider said about a key after a failed request. */
export function penalize(
  key: string,
  kind: "rate" | "day" | "invalid" | "server",
  retryAfterMs?: number,
) {
  const s = stateOf(key);
  const now = Date.now();
  if (kind === "invalid") {
    s.cooldownUntil = now + INVALID_COOLDOWN_MS;
    s.reason = "invalid";
  } else if (kind === "day") {
    s.cooldownUntil = now + DAY_COOLDOWN_MS;
    s.reason = "day";
  } else if (kind === "rate") {
    // A little past what was asked, so a stampede of retries does not land
    // on the exact same second.
    const wait = (retryAfterMs ?? DEFAULT_COOLDOWN_MS) + 500 + Math.random() * 1500;
    s.cooldownUntil = Math.max(s.cooldownUntil, now + Math.min(wait, 5 * 60_000));
    s.reason = "rate";
  } else {
    // Provider overloaded — a short breather, not the key's fault.
    s.cooldownUntil = Math.max(s.cooldownUntil, now + (retryAfterMs ?? 4000));
    s.reason = "rate";
  }
  emit();
}
