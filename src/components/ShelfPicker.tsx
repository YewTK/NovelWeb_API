"use client";

import { BookOpen, Check, Languages, Sparkles } from "lucide-react";
import type { Series } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Sheet } from "./ui";

export interface ShelfOption {
  series: Series;
  chapterCount: number;
}

/**
 * Lets the reader say which novel a link belongs to before it is translated.
 * The same novel carried on two sites produces two different auto-derived
 * keys, so without this the second site would start its own glossary from
 * scratch and rename every character.
 */
export function ShelfPicker({
  open,
  onClose,
  options,
  selectedId,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  options: ShelfOption[];
  /** empty string means "let the app decide" */
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const choose = (id: string) => {
    onSelect(id);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      side="bottom"
      title="ตอนนี้เป็นของเรื่องไหน"
      description="เลือกชั้นหนังสือที่มีอยู่แล้ว เพื่อให้ตอนใหม่ใช้คลังคำศัพท์ชุดเดิม แม้จะมาจากคนละเว็บ"
    >
      <div className="mx-auto max-w-[520px] space-y-2 pb-4">
        <button
          onClick={() => choose("")}
          className={cn(
            "flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition-colors",
            selectedId === ""
              ? "border-[var(--accent)] bg-[var(--accent-soft)]"
              : "border-[var(--line)] bg-[var(--bg)] hover:border-[var(--fg-dim)]",
          )}
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--bg-elev-2)]">
            <Sparkles size={17} className="text-[var(--accent)]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-medium">จัดกลุ่มให้อัตโนมัติ</span>
            <span className="mt-0.5 block text-[12px] leading-snug text-[var(--fg-dim)]">
              เดาชื่อเรื่องจากลิงก์และหัวข้อ แล้วรวมเข้าชั้นที่ชื่อตรงกัน
            </span>
          </span>
          {selectedId === "" ? (
            <Check size={17} className="shrink-0 text-[var(--accent)]" />
          ) : null}
        </button>

        {options.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[var(--line)] px-4 py-8 text-center text-[13px] text-[var(--fg-dim)]">
            ยังไม่มีชั้นหนังสือ — แปลตอนแรกแล้วชั้นจะถูกสร้างให้เอง
          </p>
        ) : (
          options.map(({ series, chapterCount }) => {
            const active = series.id === selectedId;
            return (
              <button
                key={series.id}
                onClick={() => choose(series.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition-colors",
                  active
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                    : "border-[var(--line)] bg-[var(--bg)] hover:border-[var(--fg-dim)]",
                )}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--bg-elev-2)]">
                  <BookOpen size={17} className="text-[var(--fg-muted)]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-1 text-[14px] font-medium">
                    {series.name}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-[var(--fg-dim)]">
                    <span>{chapterCount} ตอน</span>
                    {series.glossary.length > 0 ? (
                      <span className="inline-flex items-center gap-1 text-[var(--accent)]">
                        <Languages size={11} />
                        {series.glossary.length} คำ
                      </span>
                    ) : null}
                  </span>
                </span>
                {active ? (
                  <Check size={17} className="shrink-0 text-[var(--accent)]" />
                ) : null}
              </button>
            );
          })
        )}
      </div>
    </Sheet>
  );
}
