"use client";

import { useState } from "react";
import {
  BookOpen,
  ChevronRight,
  FolderInput,
  Languages,
  Library,
  Trash2,
} from "lucide-react";
import type { Chapter, Series } from "@/lib/types";
import { cn, formatRelative } from "@/lib/utils";
import { ShelfPicker, type ShelfOption } from "./ShelfPicker";
import { Button, Sheet } from "./ui";

export interface Shelf {
  series: Series;
  chapters: Chapter[];
  updatedAt: number;
}

/** Groups the library into one shelf per novel, newest activity first. */
export function buildShelves(series: Series[], chapters: Chapter[]): Shelf[] {
  const byId = new Map<string, Shelf>();

  for (const s of series) {
    byId.set(s.id, { series: s, chapters: [], updatedAt: s.updatedAt });
  }

  const orphans: Chapter[] = [];
  for (const c of chapters) {
    const shelf = c.seriesId ? byId.get(c.seriesId) : undefined;
    if (shelf) {
      shelf.chapters.push(c);
      shelf.updatedAt = Math.max(shelf.updatedAt, c.updatedAt);
    } else {
      orphans.push(c);
    }
  }

  const shelves = [...byId.values()].filter((s) => s.chapters.length > 0);

  if (orphans.length) {
    shelves.push({
      series: {
        id: "",
        key: "",
        name: "ยังไม่ได้จัดเข้าเรื่อง",
        glossary: [],
        createdAt: 0,
        updatedAt: 0,
      },
      chapters: orphans,
      updatedAt: Math.max(...orphans.map((c) => c.updatedAt)),
    });
  }

  for (const shelf of shelves) {
    shelf.chapters.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  return shelves.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Gives every novel a stable colour so its spine is recognisable at a glance. */
function hueOf(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

function Spine({ name, seed }: { name: string; seed: string }) {
  const hue = hueOf(seed || name);
  return (
    <div
      className="relative grid h-[74px] w-[52px] shrink-0 place-items-center overflow-hidden rounded-md shadow-md"
      style={{
        background: `linear-gradient(160deg, hsl(${hue} 62% 58%), hsl(${(hue + 38) % 360} 58% 40%))`,
      }}
      aria-hidden
    >
      <span className="absolute inset-y-0 left-[5px] w-px bg-white/25" />
      <BookOpen size={18} className="text-white/85" />
    </div>
  );
}

/* -------------------------------- the shelf ------------------------------- */

export function Bookshelf({
  shelves,
  onOpen,
}: {
  shelves: Shelf[];
  onOpen: (shelf: Shelf) => void;
}) {
  if (shelves.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-[680px] px-5 pb-24">
      <h2 className="mb-3 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-[var(--fg-dim)]">
        <Library size={13} /> ชั้นหนังสือของฉัน
      </h2>

      <div className="grid gap-2 sm:grid-cols-2">
        {shelves.map((shelf) => {
          const done = shelf.chapters.filter((c) => c.status === "done").length;
          return (
            <button
              key={shelf.series.id || "orphans"}
              onClick={() => onOpen(shelf)}
              className="group flex items-center gap-3.5 rounded-2xl border border-[var(--line)] bg-[var(--bg-elev)]/60 p-3.5 text-left backdrop-blur transition-all hover:border-[var(--fg-dim)] hover:bg-[var(--bg-elev)]"
            >
              <Spine name={shelf.series.name} seed={shelf.series.key} />

              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-[14px] font-medium leading-snug">
                  {shelf.series.name}
                </span>
                <span className="mt-1.5 block text-[11.5px] text-[var(--fg-dim)]">
                  {shelf.chapters.length} ตอน
                  {done > 0 ? ` · แปลจบ ${done}` : ""}
                </span>
                <span className="mt-0.5 block text-[11.5px] text-[var(--fg-dim)]">
                  {formatRelative(shelf.updatedAt)}
                </span>
                {shelf.series.glossary.length > 0 ? (
                  <span className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--accent)]">
                    <Languages size={10} />
                    {shelf.series.glossary.length} คำ
                  </span>
                ) : null}
              </span>

              <ChevronRight
                size={16}
                className="shrink-0 text-[var(--fg-dim)] transition-transform group-hover:translate-x-0.5"
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------------------- one novel's shelf --------------------------- */

export function ShelfSheet({
  shelf,
  shelves,
  onClose,
  onOpenChapter,
  onOpenGlossary,
  onDeleteChapter,
  onMerge,
}: {
  shelf: Shelf | null;
  /** every other shelf, offered as a destination when merging */
  shelves: Shelf[];
  onClose: () => void;
  onOpenChapter: (id: string) => void;
  onOpenGlossary: (series: Series) => void;
  onDeleteChapter: (id: string) => void;
  onMerge: (shelf: Shelf, targetId: string) => void;
}) {
  const [merging, setMerging] = useState(false);

  if (!shelf) return null;

  const hasSeries = Boolean(shelf.series.id);
  const targets: ShelfOption[] = shelves
    .filter((s) => s.series.id && s.series.id !== shelf.series.id)
    .map((s) => ({ series: s.series, chapterCount: s.chapters.length }));

  return (
    <Sheet
      open
      onClose={onClose}
      title={shelf.series.name}
      description={`${shelf.chapters.length} ตอนในเรื่องนี้`}
    >
      <div className="space-y-3">
        {hasSeries ? (
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => onOpenGlossary(shelf.series)}
          >
            <Languages size={15} className="text-[var(--accent)]" />
            <span className="flex-1 text-left">คลังคำศัพท์ของเรื่องนี้</span>
            <span className="text-[12px] text-[var(--fg-dim)]">
              {shelf.series.glossary.length} คำ
            </span>
          </Button>
        ) : null}

        {targets.length > 0 ? (
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => setMerging(true)}
          >
            <FolderInput size={15} className="text-[var(--fg-muted)]" />
            <span className="flex-1 text-left">รวมเข้ากับชั้นหนังสืออื่น</span>
          </Button>
        ) : null}

        <div className="space-y-2 pt-1">
          {shelf.chapters.map((c) => (
            <div
              key={c.id}
              className="group flex items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 transition-all hover:border-[var(--fg-dim)]"
            >
              <button
                onClick={() => {
                  onOpenChapter(c.id);
                  onClose();
                }}
                className="min-w-0 flex-1 text-left"
              >
                <span className="line-clamp-2 text-[13.5px] font-medium leading-snug">
                  {c.translatedTitle || c.title}
                </span>
                <span className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-[var(--fg-dim)]">
                  <span>{formatRelative(c.updatedAt)}</span>
                  <span
                    className={cn(
                      c.status === "done" && "text-emerald-400",
                      c.status === "error" && "text-red-400",
                      c.status === "translating" && "text-[var(--accent)]",
                    )}
                  >
                    ·{" "}
                    {c.status === "done"
                      ? "แปลจบแล้ว"
                      : c.status === "error"
                        ? "มีข้อผิดพลาด"
                        : `${Math.round(c.progress * 100)}%`}
                  </span>
                </span>
              </button>
              <button
                onClick={() => onDeleteChapter(c.id)}
                aria-label="ลบตอนนี้"
                className="shrink-0 rounded-lg p-1.5 text-[var(--fg-dim)] opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <ShelfPicker
        open={merging}
        onClose={() => setMerging(false)}
        options={targets}
        selectedId={shelf.series.id}
        onSelect={(id) => {
          if (id) onMerge(shelf, id);
        }}
      />
    </Sheet>
  );
}
