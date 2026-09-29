"use client";

import { Check, Quote } from "lucide-react";
import { AUTHOR_STYLES, authorStyle } from "@/lib/authors";
import { cn } from "@/lib/utils";

/** Pick the author whose craft the novel should be written in. */
export function StyleCards({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const selected = authorStyle(value);
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="สไตล์นักเขียน">
        {AUTHOR_STYLES.map((s) => {
          const on = s.id === value;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(s.id)}
              className={cn(
                "group relative overflow-hidden rounded-2xl border p-3 text-left transition-all duration-200",
                on
                  ? "border-transparent bg-[var(--bg-elev-2)] shadow-[0_0_0_1.5px_var(--accent),0_14px_30px_-16px_var(--accent)]"
                  : "border-[var(--line)] bg-[var(--bg)]/60 hover:-translate-y-0.5 hover:border-[var(--fg-dim)]",
              )}
            >
              <span
                className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-60 blur-xl transition-opacity group-hover:opacity-90"
                style={{ background: `hsl(${s.hue} 80% 55% / .45)` }}
              />
              <span className="relative flex items-start justify-between gap-2">
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg font-display text-[14px] font-bold text-white"
                  style={{ background: `linear-gradient(140deg, hsl(${s.hue} 70% 55%), hsl(${(s.hue + 40) % 360} 60% 32%))` }}
                >
                  {s.author.slice(0, 1).toUpperCase()}
                </span>
                {on ? (
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--accent-strong)] text-[var(--accent-ink)]">
                    <Check size={12} strokeWidth={3} />
                  </span>
                ) : null}
              </span>
              <span className="relative mt-2 block truncate text-[13.5px] font-semibold">{s.label}</span>
              <span className="relative mt-0.5 line-clamp-1 text-[11px] text-[var(--fg-dim)]">{s.works}</span>
            </button>
          );
        })}
      </div>

      <div key={selected.id} className="rise mt-3 rounded-2xl border border-[var(--line)] bg-[var(--bg)]/60 p-4">
        <p className="flex items-start gap-2 text-[13.5px] font-medium leading-relaxed">
          <Quote size={14} className="mt-1 shrink-0 text-[var(--accent)]" />
          {selected.tagline}
        </p>
        <ul className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
          {selected.traits.map((t) => (
            <li key={t} className="flex items-start gap-2 text-[12.5px] leading-relaxed text-[var(--fg-muted)]">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full" style={{ background: `hsl(${selected.hue} 70% 60%)` }} />
              {t}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--fg-dim)]">
          AI เลียนแบบ “วิธีเล่าเรื่อง” เท่านั้น — ตัวละคร โลก ระบบพลัง และถ้อยคำทั้งหมดจะถูกสร้างขึ้นใหม่ ไม่คัดลอกจากงานต้นฉบับ
        </p>
      </div>
    </div>
  );
}
