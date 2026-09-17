"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Eye, EyeOff, KeyRound, Plus, RotateCcw, Trash2 } from "lucide-react";
import { keyHealth, resetKey, subscribeKeys, type KeyHealth } from "@/lib/keypool";
import { DEFAULT_RPM, keysFor, rpmFor, useSettings } from "@/lib/store";
import type { ProviderId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { inputClass } from "./ui";

const HEALTH: Record<KeyHealth, { label: string; dot: string }> = {
  ready: { label: "พร้อมใช้", dot: "bg-emerald-400" },
  busy: { label: "กำลังใช้งาน", dot: "bg-sky-400 dot-live" },
  rate: { label: "พักรอลิมิต", dot: "bg-amber-400" },
  day: { label: "โควตาวันนี้หมด", dot: "bg-red-400" },
  invalid: { label: "คีย์ใช้ไม่ได้", dot: "bg-red-500" },
};

const RPM_OPTIONS = [0, 5, 8, 10, 15, 30, 60];

function mask(key: string): string {
  if (key.length <= 12) return "•".repeat(key.length);
  return `${key.slice(0, 6)}••••${key.slice(-4)}`;
}

/** Re-renders every second while any key is cooling, for the countdown. */
function useKeyTicker(keys: string[]) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const unsub = subscribeKeys(() => setTick((t) => t + 1));
    const timer = setInterval(() => {
      if (keys.some((k) => keyHealth(k).until > Date.now())) setTick((t) => t + 1);
    }, 1000);
    return () => {
      unsub();
      clearInterval(timer);
    };
  }, [keys]);
}

/**
 * Several API keys for one provider, used in rotation. When one key hits its
 * rate limit or daily quota the translator moves straight on to the next.
 */
export function KeyList({
  provider,
  label,
  placeholder,
  helpUrl,
}: {
  provider: ProviderId;
  label: string;
  placeholder: string;
  helpUrl: string;
}) {
  const state = useSettings();
  const { setKeys, setRpm } = state;
  const keys = keysFor(state, provider);
  const rpm = rpmFor(state, provider);
  const [draft, setDraft] = useState("");
  const [reveal, setReveal] = useState(false);

  useKeyTicker(keys);

  const add = () => {
    // Accept a whole pasted list — one per line, or separated by commas/spaces.
    const incoming = draft
      .split(/[\s,;]+/)
      .map((k) => k.trim())
      .filter((k) => k.length >= 8);
    if (!incoming.length) return;
    setKeys(provider, [...keys, ...incoming.filter((k) => !keys.includes(k))]);
    setDraft("");
  };

  const remove = (key: string) => {
    resetKey(key);
    setKeys(provider, keys.filter((k) => k !== key));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-[var(--fg-muted)]">
          {label}
          {keys.length > 1 ? (
            <span className="ml-1.5 rounded-md bg-[var(--accent-soft)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--accent)]">
              สลับใช้ {keys.length} คีย์
            </span>
          ) : null}
        </span>
        {keys.length > 0 ? (
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            className="grid h-9 w-9 place-items-center rounded-lg text-[var(--fg-dim)] transition-colors hover:bg-[var(--bg-elev-2)] hover:text-[var(--fg)]"
            aria-label={reveal ? "ซ่อนคีย์" : "แสดงคีย์"}
          >
            {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        ) : null}
      </div>

      {keys.length > 0 ? (
        <ul className="space-y-1.5">
          {keys.map((key, i) => {
            const { health, until } = keyHealth(key);
            const h = HEALTH[health];
            const seconds = Math.max(0, Math.ceil((until - Date.now()) / 1000));
            return (
              <li
                key={key}
                className="flex items-center gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] py-1.5 pl-3 pr-1.5"
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[var(--bg-elev-2)] text-[11px] font-semibold tabular-nums text-[var(--fg-muted)]">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[12.5px]">
                    {reveal ? key : mask(key)}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--fg-dim)]">
                    <span className={cn("inline-block h-1.5 w-1.5 rounded-full", h.dot)} />
                    {h.label}
                    {health === "rate" && seconds > 0 ? ` · ${seconds} วิ` : ""}
                    {health === "day" && seconds > 0
                      ? ` · ลองใหม่ใน ${Math.ceil(seconds / 60)} นาที`
                      : ""}
                  </span>
                </span>
                {health === "day" || health === "invalid" || health === "rate" ? (
                  <button
                    type="button"
                    onClick={() => resetKey(key)}
                    aria-label="ลองใช้คีย์นี้อีกครั้ง"
                    title="ลองใช้คีย์นี้อีกครั้ง"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[var(--fg-dim)] transition-colors hover:bg-[var(--bg-elev-2)] hover:text-[var(--fg)]"
                  >
                    <RotateCcw size={15} />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => remove(key)}
                  aria-label={`ลบคีย์ที่ ${i + 1}`}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[var(--fg-dim)] transition-colors hover:bg-red-500/10 hover:text-red-400"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <KeyRound
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-dim)]"
          />
          <input
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            onPaste={(e) => {
              // A pasted list goes straight in; a single key waits for "add".
              const text = e.clipboardData.getData("text");
              if (/[\s,;]/.test(text.trim())) {
                e.preventDefault();
                setDraft(text);
                setTimeout(() => document.getElementById(`add-key-${provider}`)?.click(), 0);
              }
            }}
            placeholder={keys.length ? "เพิ่มคีย์สำรอง…" : placeholder}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="done"
            className={cn(inputClass, "h-11 pl-8 font-mono text-base sm:text-[13px]")}
          />
        </div>
        <button
          id={`add-key-${provider}`}
          type="button"
          onClick={add}
          disabled={draft.trim().length < 8}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-[var(--btn)] px-4 text-[13.5px] font-medium text-[var(--btn-fg)] transition-opacity disabled:opacity-35"
        >
          <Plus size={15} /> เพิ่ม
        </button>
      </div>

      <p className="text-[12px] leading-relaxed text-[var(--fg-dim)]">
        ใส่ได้หลายคีย์ ระบบจะสลับใช้ให้อัตโนมัติ และข้ามคีย์ที่ติดลิมิตหรือโควตาหมดทันที
        {provider === "google"
          ? " — คีย์ Gemini ต้องสร้างจากคนละ Google Cloud project (หรือคนละบัญชี) โควตาจึงจะแยกกันจริง"
          : ""}{" "}
        <a
          href={helpUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
        >
          ขอ API Key <ExternalLink size={11} />
        </a>
      </p>

      <div>
        <p className="mb-2 text-[13px] font-medium text-[var(--fg-muted)]">
          จำกัดคำขอต่อนาที (ต่อคีย์)
        </p>
        <div className="flex flex-wrap gap-1.5">
          {RPM_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRpm(provider, n)}
              aria-pressed={rpm === n}
              className={cn(
                "h-9 min-w-11 rounded-lg border px-3 text-[13px] tabular-nums transition-colors",
                rpm === n
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] font-semibold text-[var(--accent)]"
                  : "border-[var(--line)] text-[var(--fg-muted)] hover:border-[var(--fg-dim)]",
              )}
            >
              {n === 0 ? "ไม่จำกัด" : n}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--fg-dim)]">
          ค่าแนะนำ {DEFAULT_RPM[provider] === 0 ? "ไม่จำกัด" : `${DEFAULT_RPM[provider]} ครั้ง/นาที`}
          {provider === "google"
            ? " — Gemini ฟรี: Flash ≈10, Flash-Lite ≈15, Pro ≈5 ครั้ง/นาที ตั้งต่ำกว่าลิมิตเล็กน้อยจะไม่เจอ 429"
            : " — ถ้าเจอ 429 บ่อย ให้ลดค่านี้ลงหรือเพิ่มคีย์"}
        </p>
      </div>
    </div>
  );
}
