"use client";

import { useState } from "react";
import {
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  BookOpen,
  BookOpenCheck,
  Check,
  ChevronRight,
  FolderInput,
  Languages,
  Library,
  ListPlus,
  Trash2,
} from "lucide-react";
import type { Chapter, Series } from "@/lib/types";
import { chapterLabel, chapterNumber } from "@/lib/series";
import { useSettings } from "@/lib/store";
import { statusOf, type ReadMark } from "@/lib/reading";
import { cn, formatRelative } from "@/lib/utils";
import { ShelfPicker, type ShelfOption } from "./ShelfPicker";
import { Button, ConfirmDialog, Sheet, useLongPress } from "./ui";

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

  // Reading order, not edit order: a shelf should read 1, 2, 3 like a book.
  // Chapters whose number cannot be worked out sink to the bottom, newest first.
  for (const shelf of shelves) {
    shelf.chapters.sort((a, b) => {
      const na = chapterNumber(a);
      const nb = chapterNumber(b);
      if (na !== null && nb !== null) return na - nb;
      if (na !== null) return -1;
      if (nb !== null) return 1;
      return b.updatedAt - a.updatedAt;
    });
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

/** "ตอนที่ 1780–1782" across a whole shelf, or null when nothing is numbered. */
function chapterRange(chapters: Chapter[]): string | null {
  const numbers = chapters
    .map((c) => chapterNumber(c))
    .filter((n): n is number => n !== null);
  if (!numbers.length) return null;
  const low = Math.min(...numbers);
  const high = Math.max(...numbers);
  return low === high ? `ตอนที่ ${low}` : `ตอนที่ ${low}–${high}`;
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
          const range = chapterRange(shelf.chapters);
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
                  {range ? ` · ${range}` : ""}
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

/* --------------------------------- a row ---------------------------------- */

function ChapterRow({
  chapter,
  mark,
  current,
  onOpen,
  onAskDelete,
}: {
  chapter: Chapter;
  mark: ReadMark | undefined;
  /** The chapter the reader was last in, resumed on the next launch. */
  current: boolean;
  onOpen: () => void;
  onAskDelete: () => void;
}) {
  const press = useLongPress(onAskDelete);
  const read = statusOf(mark);
  const label = chapterLabel(chapterNumber(chapter));

  return (
    <button
      {...press.handlers}
      onClick={() => {
        // The hold already opened the delete prompt; do not also open the chapter.
        if (press.consumed()) return;
        onOpen();
      }}
      className={cn(
        "flex w-full select-none items-start gap-3 rounded-xl border p-3 text-left transition-all",
        current
          ? "border-[var(--accent)] bg-[var(--accent-soft)]"
          : "border-[var(--line)] bg-[var(--bg)] hover:border-[var(--fg-dim)]",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="mb-1 flex flex-wrap items-center gap-1.5">
          {label ? (
            <span className="rounded-md bg-[var(--accent-soft)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--accent)]">
              {label}
            </span>
          ) : null}

          {current ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-[var(--btn)] px-1.5 py-0.5 text-[10.5px] font-semibold text-[var(--btn-fg)]">
              <BookOpenCheck size={10} /> กำลังอ่าน
            </span>
          ) : read === "read" ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10.5px] font-semibold text-emerald-400">
              <Check size={10} /> อ่านแล้ว
            </span>
          ) : read === "reading" ? (
            <span className="rounded-md bg-[var(--bg-elev-2)] px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--fg-muted)]">
              อ่านค้างไว้ {Math.round((mark?.progress ?? 0) * 100)}%
            </span>
          ) : null}
        </span>

        <span
          className={cn(
            "line-clamp-2 text-[13.5px] font-medium leading-snug",
            read === "read" && !current && "text-[var(--fg-muted)]",
          )}
        >
          {chapter.translatedTitle || chapter.title}
        </span>

        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-[var(--fg-dim)]">
          <span>{formatRelative(chapter.updatedAt)}</span>
          <span
            className={cn(
              chapter.status === "done" && "text-emerald-400",
              chapter.status === "error" && "text-red-400",
              chapter.status === "translating" && "text-[var(--accent)]",
            )}
          >
            ·{" "}
            {chapter.status === "done"
              ? "แปลจบแล้ว"
              : chapter.status === "error"
                ? "มีข้อผิดพลาด"
                : `${Math.round(chapter.progress * 100)}%`}
          </span>
        </span>
      </span>
    </button>
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
  onQueueAll,
  marks,
  currentId,
  onDeleteShelf,
}: {
  shelf: Shelf | null;
  /** every other shelf, offered as a destination when merging */
  shelves: Shelf[];
  onClose: () => void;
  onOpenChapter: (id: string) => void;
  onOpenGlossary: (series: Series) => void;
  onDeleteChapter: (id: string) => void;
  onMerge: (shelf: Shelf, targetId: string) => void;
  onQueueAll: (chapters: Chapter[]) => void;
  marks: Record<string, ReadMark>;
  /** Chapter the reader is part-way through, if any. */
  currentId: string | null;
  onDeleteShelf: (shelf: Shelf) => void;
}) {
  const [merging, setMerging] = useState(false);
  const [doomed, setDoomed] = useState<Chapter | null>(null);
  const [killShelf, setKillShelf] = useState(false);
  const { shelfOrder, setShelfOrder } = useSettings();

  if (!shelf) return null;

  const hasSeries = Boolean(shelf.series.id);
  // buildShelves hands these over in reading order; flip for newest-first.
  const ordered =
    shelfOrder === "desc" ? [...shelf.chapters].reverse() : shelf.chapters;

  // Anything not finished is worth offering as one batch.
  const pending = shelf.chapters.filter((c) => c.status !== "done");
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

        {pending.length > 0 ? (
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => {
              onQueueAll(pending);
              onClose();
            }}
          >
            <ListPlus size={15} className="text-[var(--accent)]" />
            <span className="flex-1 text-left">แปลตอนที่ยังไม่เสร็จทั้งหมด</span>
            <span className="text-[12px] text-[var(--fg-dim)]">
              {pending.length} ตอน
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

        {hasSeries ? (
          <Button
            variant="outline"
            className="w-full justify-start text-red-400 hover:border-red-500/40 hover:bg-red-500/10"
            onClick={() => setKillShelf(true)}
          >
            <Trash2 size={15} />
            <span className="flex-1 text-left">ลบชั้นหนังสือนี้</span>
          </Button>
        ) : null}

        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--fg-dim)]">
            รายตอน
          </span>
          <button
            onClick={() => setShelfOrder(shelfOrder === "asc" ? "desc" : "asc")}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--fg-muted)] transition-colors hover:border-[var(--fg-dim)] hover:text-[var(--fg)]"
          >
            {shelfOrder === "asc" ? (
              <ArrowUpNarrowWide size={13} />
            ) : (
              <ArrowDownNarrowWide size={13} />
            )}
            {shelfOrder === "asc" ? "ตอนแรกสุดก่อน" : "ตอนล่าสุดก่อน"}
          </button>
        </div>

        <div className="space-y-2">
          {ordered.map((c) => (
            <ChapterRow
              key={c.id}
              chapter={c}
              mark={marks[c.id]}
              current={c.id === currentId}
              onOpen={() => {
                onOpenChapter(c.id);
                onClose();
              }}
              onAskDelete={() => setDoomed(c)}
            />
          ))}
        </div>

        <p className="px-1 pt-1 text-center text-[11.5px] text-[var(--fg-dim)]">
          กดค้างที่ตอนเพื่อลบ
        </p>
      </div>

      <ConfirmDialog
        open={Boolean(doomed)}
        title="ลบตอนนี้?"
        confirmLabel="ลบ"
        onCancel={() => setDoomed(null)}
        onConfirm={() => {
          if (doomed) onDeleteChapter(doomed.id);
          setDoomed(null);
        }}
        body={
          <p className="line-clamp-3 font-medium text-[var(--fg)]">
            {doomed ? doomed.translatedTitle || doomed.title : ""}
          </p>
        }
      />

      <ConfirmDialog
        open={killShelf}
        title="ลบทั้งเรื่องนี้?"
        confirmLabel="ลบทั้งหมด"
        onCancel={() => setKillShelf(false)}
        onConfirm={() => {
          setKillShelf(false);
          onDeleteShelf(shelf);
          onClose();
        }}
        body={
          <div className="space-y-2">
            <p className="font-medium text-[var(--fg)]">{shelf.series.name}</p>
            <p className="leading-relaxed">
              จะลบทั้ง {shelf.chapters.length} ตอน และคลังคำศัพท์
              {shelf.series.glossary.length} คำของเรื่องนี้ออกทั้งหมด
              ทั้งในเครื่องและบนคลาวด์ — กู้คืนไม่ได้
            </p>
          </div>
        }
      />

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
