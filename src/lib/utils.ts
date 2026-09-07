import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Rough token estimate that behaves sanely for CJK, Thai and Latin scripts. */
export function estimateTokens(text: string): number {
  let dense = 0;
  let loose = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (
      (code >= 0x0e00 && code <= 0x0e7f) || // Thai
      (code >= 0x3040 && code <= 0x30ff) || // Kana
      (code >= 0x3400 && code <= 0x9fff) || // CJK
      (code >= 0xac00 && code <= 0xd7af) || // Hangul
      (code >= 0xf900 && code <= 0xfaff)
    ) {
      dense++;
    } else {
      loose++;
    }
  }
  return Math.ceil(dense * 0.9 + loose / 3.6);
}

export function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "เมื่อสักครู่";
  if (min < 60) return `${min} นาทีที่แล้ว`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ชั่วโมงที่แล้ว`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} วันที่แล้ว`;
  return new Date(ts).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

export function isProbablyUrl(text: string): boolean {
  const t = text.trim();
  if (/\s/.test(t)) return false;
  return /^https?:\/\/\S+$/i.test(t) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t);
}

export function normalizeUrl(text: string): string {
  const t = text.trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
