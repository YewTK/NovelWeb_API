"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownNarrowWide,
  ArrowLeft,
  ArrowUpNarrowWide,
  BookOpenCheck,
  Check,
  Feather,
  FolderInput,
  Languages,
  ListPlus,
  Loader2,
  MoreHorizontal,
  PenLine,
  Pencil,
  Play,
  Search,
  Trash2,
} from "lucide-react";
import { authorStyle } from "@/lib/authors";
import type { ChapterMeta } from "@/lib/types";
import { chapterLabel, chapterNumber } from "@/lib/series";
import { useSettings } from "@/lib/store";
import { statusOf, type ReadMark } from "@/lib/reading";
import { cn, formatRelative, hostOf } from "@/lib/utils";
import { Cover, chapterRange, isOriginal, readCount, resumeTarget, type Shelf } from "./Bookshelf";
import { ShelfPicker, type ShelfOption } from "./ShelfPicker";
import { Button, Chip, ConfirmDialog, Sheet, useLongPress } from "./ui";

const STATUS_LABEL = {
  ongoing: "ยังไม่จบ",
  completed: "จบแล้ว",
  hiatus: "หยุดพัก",
} as const;

const PAGE = 100;

type ReadFilter = "all" | "unread" | "read";

/* --------------------------------- a row ---------------------------------- */

function ChapterRow({
  chapter,
  mark,
  current,
  busy,
  queued,
  original,
  onOpen,
  onAskDelete,
}: {
  chapter: ChapterMeta;
  mark: ReadMark | undefined;
  current: boolean;
  /** translating or being written right now */
  busy: boolean;
  queued: boolean;
  original: boolean;
  onOpen: () => void;
  onAskDelete: () => void;
}) {
  const press = useLongPress(onAskDelete);
  const read = statusOf(mark);
  const n = chapterNumber(chapter);
  const title = chapter.translatedTitle || chapter.title;
  const dim = read === "read" && !current;

  return (
    <li className="cv-auto [contain-intrinsic-size:auto_68px]">
      <button
        {...press.handlers}
        onClick={() => {
          if (press.consumed()) return;
          onOpen();
        }}
        className={cn(
          "group flex w-full select-none items-center gap-3 px-4 py-3 text-left transition-colors sm:px-5",
          current ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--bg-elev-2)]",
        )}
      >
        <span
          className={cn(
            "w-12 shrink-0 text-center font-display text-[14px] font-semibold tabular-nums",
            dim ? "text-[var(--fg-dim)]" : "text-[var(--fg-muted)]",
          )}
        >
          {n !== null ? (Number.isInteger(n) ? n : n.toFixed(1)) : "—"}
        </span>

        <span className="min-w-0 flex-1">
          <span className={cn("line-clamp-1 text-[14px] font-medium transition-colors group-hover:text-[var(--accent)]", dim && "text-[var(--fg-muted)]")}>
            {title}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-[var(--fg-dim)]">
            <span>{formatRelative(chapter.updatedAt)}</span>
            {busy ? (
              <span className="inline-flex items-center gap-1 text-[var(--accent)]">
                <Loader2 size={10} className="animate-spin" /> {original ? "กำลังเขียน" : "กำลังแปล"}
              </span>
            ) : queued ? (
              <span className="text-[var(--accent)]">รอคิวแปล</span>
            ) : chapter.status === "error" ? (
              <span className="text-[var(--danger)]">{original ? "เขียนไม่สำเร็จ" : "แปลไม่สำเร็จ"}</span>
            ) : chapter.status !== "done" ? (
              <span>
                {original ? "เขียนแล้ว" : "แปลแล้ว"} {Math.round(chapter.progress * 100)}%
              </span>
            ) : null}
          </span>
        </span>

        {current ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--accent-strong)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--accent-ink)]">
            <BookOpenCheck size={10} /> อ่านอยู่
          </span>
        ) : read === "read" ? (
          <Check size={16} className="shrink-0 text-[var(--success)]" aria-label="อ่านแล้ว" />
        ) : read === "reading" ? (
          <span className="shrink-0 text-[11px] tabular-nums text-[var(--fg-dim)]">{Math.round((mark?.progress ?? 0) * 100)}%</span>
        ) : (
          <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" aria-label="ยังไม่อ่าน" />
        )}
      </button>
    </li>
  );
}

/* ---------------------------------- page ---------------------------------- */

export function BookPage({
  shelf,
  shelves,
  marks,
  currentId,
  busyId,
  queuedIds,
  writeNext,
  onBack,
  onOpenChapter,
  onOpenGlossary,
  onEditInfo,
  onDeleteChapter,
  onMerge,
  onQueueAll,
  onDeleteShelf,
  onStudio,
}: {
  shelf: Shelf;
  shelves: Shelf[];
  marks: Record<string, ReadMark>;
  currentId: string | null;
  /** chapter being translated or written right now */
  busyId: string | null;
  queuedIds: Set<string>;
  /** originals: write the next planned chapter, when there is one */
  writeNext: { label: string; run: () => void; disabled: boolean } | null;
  onBack: () => void;
  onOpenChapter: (id: string) => void;
  onOpenGlossary: () => void;
  onEditInfo: () => void;
  onDeleteChapter: (id: string) => void;
  onMerge: (shelf: Shelf, targetId: string) => void;
  onQueueAll: (chapters: ChapterMeta[]) => void;
  onDeleteShelf: (shelf: Shelf) => void;
  onStudio: () => void;
}) {
  const { shelfOrder, setShelfOrder } = useSettings();
  const [tab, setTab] = useState<"toc" | "about">("toc");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ReadFilter>("all");
  const [limit, setLimit] = useState(PAGE);
  const [menu, setMenu] = useState(false);
  const [merging, setMerging] = useState(false);
  const [doomed, setDoomed] = useState<ChapterMeta | null>(null);
  const [killShelf, setKillShelf] = useState(false);
  const [synopsisOpen, setSynopsisOpen] = useState(false);

  const { series, chapters } = shelf;
  const info = series.info ?? {};
  const hasSeries = Boolean(series.id);
  const original = isOriginal(series);
  const project = info.project;
  const style = project ? authorStyle(project.styleId) : null;
  const blurb = info.blurb || project?.blurb;
  const synopsis = info.synopsis || project?.synopsis;

  const read = readCount(shelf, marks);
  const finished = chapters.filter((c) => c.status === "done").length;
  const pending = original ? [] : chapters.filter((c) => c.status !== "done" && c.id !== busyId);
  const resume = resumeTarget(shelf, marks);
  const range = chapterRange(chapters);

  const listed = useMemo(() => {
    let list = shelfOrder === "desc" ? [...chapters].reverse() : chapters;
    if (filter !== "all") list = list.filter((c) => (statusOf(marks[c.id]) === "read") === (filter === "read"));
    const needle = query.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((c) => {
      const n = chapterNumber(c);
      return (n !== null && String(n) === needle) || `${c.translatedTitle} ${c.title}`.toLowerCase().includes(needle);
    });
  }, [chapters, shelfOrder, query, filter, marks]);

  const targets: ShelfOption[] = shelves
    .filter((s) => s.series.id && s.series.id !== series.id)
    .map((s) => ({ series: s.series, chapterCount: s.chapters.length }));

  const resumeN = resume ? chapterNumber(resume.chapter) : null;

  return (
    <main className="relative z-10 min-h-dvh pb-[calc(3rem+env(safe-area-inset-bottom))]">
      {/* top bar */}
      <header className="glass sticky top-0 z-30 border-b border-[var(--line-soft)] pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-[1180px] items-center gap-1 px-2 sm:px-4">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="กลับชั้นหนังสือ">
            <ArrowLeft size={19} />
          </Button>
          <p className="min-w-0 flex-1 truncate px-1 font-serif text-[15px] font-semibold">{series.name}</p>
          {hasSeries ? (
            <Button variant="ghost" size="icon" onClick={() => setMenu(true)} aria-label="ตัวเลือกเพิ่มเติม">
              <MoreHorizontal size={19} />
            </Button>
          ) : null}
        </div>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 scale-110 opacity-50 blur-[60px] saturate-150" aria-hidden>
          <div className="mx-auto h-full max-w-[640px]">
            <Cover name="" seed={series.key || series.id} image={info.cover} className="h-full rounded-none shadow-none ring-0" flat />
          </div>
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--bg)]/30 via-[var(--bg)]/75 to-[var(--bg)]" aria-hidden />

        <div className="relative mx-auto flex max-w-[1180px] gap-5 px-4 pb-6 pt-7 sm:gap-9 sm:px-6 sm:pt-12">
          <div className="group w-[118px] shrink-0 sm:w-[200px]">
            {hasSeries ? (
              <button onClick={onEditInfo} aria-label={info.cover ? "เปลี่ยนรูปปก" : "ใส่รูปปก"} className="relative block w-full">
                <Cover name={series.name} seed={series.key || series.id} author={info.author} image={info.cover} size="lg" priority />
                {!info.cover ? (
                  <span className="absolute inset-x-2 bottom-2 rounded-md bg-black/55 py-1 text-center text-[11px] font-medium text-white backdrop-blur">
                    + ใส่รูปปก
                  </span>
                ) : null}
              </button>
            ) : (
              <Cover name={series.name} seed={series.key || series.id} size="lg" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-1.5">
              {original ? (
                <Chip tone="magic">
                  <Feather size={11} /> AI เขียน · สำนวน {style?.label}
                </Chip>
              ) : null}
              {info.status ? (
                <Chip tone={info.status === "completed" ? "success" : "accent"}>{STATUS_LABEL[info.status]}</Chip>
              ) : null}
            </div>
            <h1 className="mt-2 text-balance font-serif text-[22px] font-bold leading-tight tracking-tight sm:text-[38px]">{series.name}</h1>
            {info.originalTitle ? <p className="mt-1 line-clamp-2 text-[13px] text-[var(--fg-muted)]">{info.originalTitle}</p> : null}
            {info.author ? (
              <p className="mt-1.5 text-[13px] text-[var(--fg-muted)]">
                โดย <span className="font-medium text-[var(--fg)]">{info.author}</span>
              </p>
            ) : null}
            {blurb ? (
              <p className="mt-3 hidden max-w-[620px] border-l-2 border-[var(--accent-line)] pl-3 font-serif text-[15px] italic leading-relaxed text-[var(--fg-muted)] sm:block">
                {blurb}
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-1.5">
              {(info.genres ?? project?.tags ?? []).slice(0, 6).map((g) => (
                <Chip key={g}>{g}</Chip>
              ))}
            </div>

            <dl className="mt-4 hidden max-w-[520px] grid-cols-4 gap-2 sm:grid">
              <Stat label="ตอน" value={chapters.length} />
              <Stat label={original ? "เขียนแล้ว" : "แปลแล้ว"} value={finished} />
              <Stat label="อ่านแล้ว" value={read} />
              <Stat label={original ? "วางแผนไว้" : "คำศัพท์"} value={original ? (project?.chapterCount ?? 0) : series.glossary.length} />
            </dl>
          </div>
        </div>

        {blurb ? (
          <p className="relative mx-4 mb-4 border-l-2 border-[var(--accent-line)] pl-3 font-serif text-[14px] italic leading-relaxed text-[var(--fg-muted)] sm:hidden">
            {blurb}
          </p>
        ) : null}

        <dl className="relative mx-4 grid grid-cols-4 divide-x divide-[var(--line)] rounded-2xl border border-[var(--line)] bg-[var(--bg-elev)]/80 py-2.5 text-center sm:hidden">
          <Stat label="ตอน" value={chapters.length} plain />
          <Stat label={original ? "เขียนแล้ว" : "แปลแล้ว"} value={finished} plain />
          <Stat label="อ่านแล้ว" value={read} plain />
          <Stat label={original ? "วางแผน" : "คำศัพท์"} value={original ? (project?.chapterCount ?? 0) : series.glossary.length} plain />
        </dl>

        <div className="relative mx-auto flex max-w-[1180px] flex-wrap gap-2 px-4 pt-4 sm:px-6">
          {resume ? (
            <Button variant="accent-solid" size="lg" className="min-w-0 flex-1 sm:flex-none" onClick={() => onOpenChapter(resume.chapter.id)}>
              <Play size={15} fill="currentColor" />
              <span className="truncate">
                {resume.started ? "อ่านต่อ" : "เริ่มอ่าน"}
                {resumeN !== null ? ` ${chapterLabel(resumeN)}` : ""}
              </span>
            </Button>
          ) : null}
          {writeNext ? (
            <Button variant="magic" size="lg" onClick={writeNext.run} disabled={writeNext.disabled} className="shrink-0">
              <PenLine size={16} /> <span className="truncate">{writeNext.label}</span>
            </Button>
          ) : null}
          {original ? (
            <Button variant="outline" size="lg" onClick={onStudio} className="shrink-0">
              <Feather size={16} className="text-[var(--magic)]" />
              <span className="hidden min-[420px]:inline">สตูดิโอ</span>
            </Button>
          ) : hasSeries ? (
            <Button variant="outline" size="lg" onClick={onOpenGlossary} className="shrink-0">
              <Languages size={16} className="text-[var(--accent)]" />
              <span className="hidden min-[400px]:inline">คำศัพท์</span>
            </Button>
          ) : null}
          {hasSeries ? (
            <Button variant="outline" size="lg" onClick={onEditInfo} className="shrink-0" aria-label="แก้ไขข้อมูลหนังสือ">
              <Pencil size={15} />
              <span className="hidden sm:inline">ข้อมูลหนังสือ</span>
            </Button>
          ) : null}
        </div>

        {pending.length > 0 ? (
          <div className="relative mx-auto max-w-[1180px] px-4 pt-2 sm:px-6">
            <button
              onClick={() => onQueueAll(pending)}
              className="flex w-full items-center gap-2.5 rounded-xl border border-dashed border-[var(--accent-line)] bg-[var(--accent-soft)] px-3.5 py-2.5 text-left text-[13px] text-[var(--accent)] transition-colors hover:bg-[color-mix(in_oklab,var(--accent)_16%,transparent)] sm:w-auto"
            >
              <ListPlus size={15} />
              <span className="flex-1 font-medium">แปลตอนที่ยังไม่เสร็จทั้งหมด</span>
              <span className="tabular-nums">{pending.length} ตอน</span>
            </button>
          </div>
        ) : null}
      </section>

      {/* tabs */}
      <div className="glass sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 mt-6 border-b border-[var(--line)]">
        <div className="mx-auto flex max-w-[1180px] px-2 sm:px-4" role="tablist">
          {(
            [
              ["toc", `สารบัญ (${chapters.length})`],
              ["about", "รายละเอียด"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "relative h-12 px-4 text-[14px] font-medium transition-colors",
                tab === key ? "text-[var(--fg)]" : "text-[var(--fg-dim)] hover:text-[var(--fg-muted)]",
              )}
            >
              {label}
              {tab === key ? <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t-full bg-[var(--accent)]" /> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-[1180px] sm:px-6">
        {tab === "toc" ? (
          <>
            <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-0">
              <div className="relative min-w-0 flex-1 basis-[220px]">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-dim)]" />
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setLimit(PAGE);
                  }}
                  type="search"
                  inputMode="search"
                  placeholder="ค้นหาเลขตอนหรือชื่อตอน"
                  className="h-10 w-full rounded-xl border border-[var(--line)] bg-[var(--bg-elev)] pl-8 pr-3 text-base outline-none transition-colors placeholder:text-[var(--fg-dim)] focus:border-[var(--accent)] sm:text-[13.5px]"
                />
              </div>
              <div className="flex gap-1 rounded-xl border border-[var(--line)] bg-[var(--bg-elev)] p-1">
                {(
                  [
                    ["all", "ทั้งหมด"],
                    ["unread", "ยังไม่อ่าน"],
                    ["read", "อ่านแล้ว"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setFilter(key);
                      setLimit(PAGE);
                    }}
                    aria-pressed={filter === key}
                    className={cn(
                      "h-8 rounded-lg px-2.5 text-[12.5px] font-medium transition-colors",
                      filter === key ? "bg-[var(--bg-elev-2)] text-[var(--fg)]" : "text-[var(--fg-dim)] hover:text-[var(--fg-muted)]",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShelfOrder(shelfOrder === "asc" ? "desc" : "asc")}
                className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--bg-elev)] px-3 text-[12.5px] font-medium text-[var(--fg-muted)] transition-colors hover:border-[var(--fg-dim)] hover:text-[var(--fg)]"
              >
                {shelfOrder === "asc" ? <ArrowUpNarrowWide size={14} /> : <ArrowDownNarrowWide size={14} />}
                {shelfOrder === "asc" ? "ตอนแรก" : "ล่าสุด"}
              </button>
            </div>

            {range ? <p className="px-4 pb-2 text-[12px] text-[var(--fg-dim)] sm:px-0">{range}</p> : null}

            {listed.length === 0 ? (
              <p className="mx-4 rounded-2xl border border-dashed border-[var(--line)] px-4 py-10 text-center text-[13px] text-[var(--fg-dim)] sm:mx-0">
                {query.trim() ? `ไม่พบตอนที่ตรงกับ “${query.trim()}”` : "ไม่มีตอนในหมวดนี้"}
              </p>
            ) : (
              <ul className="divide-y divide-[var(--line-soft)] overflow-hidden border-y border-[var(--line-soft)] sm:rounded-2xl sm:border sm:border-[var(--line)] sm:bg-[var(--bg-elev)]/70">
                {listed.slice(0, limit).map((c) => (
                  <ChapterRow
                    key={c.id}
                    chapter={c}
                    mark={marks[c.id]}
                    current={c.id === currentId}
                    busy={c.id === busyId}
                    queued={queuedIds.has(c.id)}
                    original={original}
                    onOpen={() => onOpenChapter(c.id)}
                    onAskDelete={() => setDoomed(c)}
                  />
                ))}
              </ul>
            )}

            {listed.length > limit ? (
              <div className="px-4 pt-3 sm:px-0">
                <Button variant="outline" className="w-full" onClick={() => setLimit((l) => l + PAGE)}>
                  แสดงเพิ่มอีก {Math.min(PAGE, listed.length - limit)} ตอน
                </Button>
              </div>
            ) : null}

            <p className="px-4 pt-4 text-center text-[11.5px] text-[var(--fg-dim)]">กดค้างที่ตอนเพื่อลบ</p>
          </>
        ) : (
          <div className="space-y-5 px-4 py-5 sm:px-0">
            <AboutBlock title="เรื่องย่อ">
              {synopsis ? (
                <>
                  <p className={cn("whitespace-pre-line text-[14.5px] leading-[1.9] text-[var(--fg-muted)]", !synopsisOpen && "line-clamp-6")}>{synopsis}</p>
                  {synopsis.length > 280 ? (
                    <button onClick={() => setSynopsisOpen((v) => !v)} className="mt-1 text-[13px] font-medium text-[var(--accent)]">
                      {synopsisOpen ? "ย่อ" : "อ่านเพิ่ม"}
                    </button>
                  ) : null}
                </>
              ) : (
                <Empty onEdit={hasSeries ? onEditInfo : undefined} text="ยังไม่มีเรื่องย่อ" />
              )}
            </AboutBlock>

            {project?.outline ? (
              <AboutBlock title="แก่นเรื่องและโลก">
                <p className="font-serif text-[15px] italic leading-relaxed">{project.outline.logline}</p>
                <p className="mt-3 whitespace-pre-line text-[13.5px] leading-relaxed text-[var(--fg-muted)]">{project.outline.world}</p>
                {project.outline.characters.length ? (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {project.outline.characters.slice(0, 8).map((c) => (
                      <div key={c.name} className="rounded-xl border border-[var(--line)] bg-[var(--bg)]/60 p-3">
                        <p className="text-[13.5px] font-semibold">
                          {c.name} <span className="font-normal text-[var(--fg-dim)]">· {c.role}</span>
                        </p>
                        <p className="mt-1 line-clamp-3 text-[12.5px] leading-relaxed text-[var(--fg-muted)]">{c.profile}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </AboutBlock>
            ) : null}

            <AboutBlock title="ข้อมูลหนังสือ">
              <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-[13.5px]">
                <InfoRow label="ชื่อต้นฉบับ" value={info.originalTitle} />
                <InfoRow label="ผู้แต่ง" value={info.author ?? (style ? `NovelFlow Studio · สำนวน ${style.label}` : undefined)} />
                <InfoRow label="สถานะ" value={info.status ? STATUS_LABEL[info.status] : undefined} />
                <InfoRow label="ภาษาต้นฉบับ" value={info.sourceLanguage} />
                <InfoRow label="แนว" value={(info.genres ?? project?.tags)?.join(", ")} />
                <InfoRow
                  label="แหล่งที่มา"
                  value={
                    info.sourceUrl ? (
                      <a href={info.sourceUrl} target="_blank" rel="noreferrer noopener" className="break-all text-[var(--accent)] hover:underline">
                        {hostOf(info.sourceUrl)}
                      </a>
                    ) : (
                      (chapters.find((c) => c.siteName)?.siteName ?? undefined)
                    )
                  }
                />
              </dl>
            </AboutBlock>

            {!original ? (
              <AboutBlock title="โน้ตสำหรับผู้แปล (AI ใช้ทุกตอน)">
                {info.translatorNotes ? (
                  <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-[var(--fg-muted)]">{info.translatorNotes}</p>
                ) : (
                  <Empty onEdit={hasSeries ? onEditInfo : undefined} text="ยังไม่มีโน้ต — เช่น เพศตัวละคร สรรพนามที่ใช้ มุมมองการเล่าเรื่อง" />
                )}
              </AboutBlock>
            ) : null}

            {hasSeries ? (
              <Button variant="outline" className="w-full" onClick={onEditInfo}>
                <Pencil size={15} /> แก้ไขข้อมูลหนังสือ
              </Button>
            ) : null}
          </div>
        )}
      </div>

      {/* actions */}
      <Sheet open={menu} onClose={() => setMenu(false)} side="bottom" title={series.name}>
        <div className="mx-auto max-w-[520px] space-y-2 pb-4">
          <MenuRow icon={<Pencil size={17} />} label="แก้ไขข้อมูลหนังสือ" onClick={() => { setMenu(false); onEditInfo(); }} />
          {original ? (
            <MenuRow icon={<Feather size={17} />} label="เปิดในสตูดิโอเขียน" onClick={() => { setMenu(false); onStudio(); }} />
          ) : null}
          <MenuRow
            icon={<Languages size={17} />}
            label="คลังคำศัพท์"
            trailing={`${series.glossary.length} คำ`}
            onClick={() => { setMenu(false); onOpenGlossary(); }}
          />
          {targets.length > 0 && !original ? (
            <MenuRow icon={<FolderInput size={17} />} label="รวมเข้ากับเรื่องอื่น" onClick={() => { setMenu(false); setMerging(true); }} />
          ) : null}
          <MenuRow icon={<Trash2 size={17} />} label="ลบเรื่องนี้ทั้งหมด" danger onClick={() => { setMenu(false); setKillShelf(true); }} />
        </div>
      </Sheet>

      <ConfirmDialog
        open={Boolean(doomed)}
        tone="danger"
        title="ลบตอนนี้?"
        confirmLabel="ลบ"
        onCancel={() => setDoomed(null)}
        onConfirm={() => {
          if (doomed) onDeleteChapter(doomed.id);
          setDoomed(null);
        }}
        body={<p className="line-clamp-3 font-medium text-[var(--fg)]">{doomed ? doomed.translatedTitle || doomed.title : ""}</p>}
      />

      <ConfirmDialog
        open={killShelf}
        tone="danger"
        title="ลบทั้งเรื่องนี้?"
        confirmLabel="ลบทั้งหมด"
        onCancel={() => setKillShelf(false)}
        onConfirm={() => {
          setKillShelf(false);
          onDeleteShelf(shelf);
        }}
        body={
          <div className="space-y-2">
            <p className="font-medium text-[var(--fg)]">{series.name}</p>
            <p className="leading-relaxed">
              จะลบทั้ง {chapters.length} ตอน ข้อมูลหนังสือ{original ? " โครงเรื่อง" : ""} และคลังคำศัพท์ {series.glossary.length} คำของเรื่องนี้ออกทั้งหมด
              ทั้งในเครื่องและบนคลาวด์ — กู้คืนไม่ได้
            </p>
          </div>
        }
      />

      <ShelfPicker
        open={merging}
        onClose={() => setMerging(false)}
        options={targets}
        selectedId={series.id}
        onSelect={(id) => {
          if (id) onMerge(shelf, id);
        }}
      />
    </main>
  );
}

function Stat({ label, value, plain }: { label: string; value: number; plain?: boolean }) {
  return (
    <div className={cn(!plain && "rounded-xl border border-[var(--line)] bg-[var(--bg-elev)]/70 px-2 py-2 text-center")}>
      <dd className="font-display text-[17px] font-semibold tabular-nums">{value.toLocaleString()}</dd>
      <dt className="text-[11px] text-[var(--fg-dim)]">{label}</dt>
    </div>
  );
}

function AboutBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="gilded rounded-2xl bg-[var(--bg-elev)]/70 p-4 sm:p-5">
      <h3 className="mb-2.5 font-serif text-[15px] font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <>
      <dt className="text-[var(--fg-dim)]">{label}</dt>
      <dd className="min-w-0 text-[var(--fg)]">{value || <span className="text-[var(--fg-dim)]">—</span>}</dd>
    </>
  );
}

function Empty({ text, onEdit }: { text: string; onEdit?: () => void }) {
  return (
    <p className="text-[13px] leading-relaxed text-[var(--fg-dim)]">
      {text}
      {onEdit ? (
        <>
          {" "}
          <button onClick={onEdit} className="font-medium text-[var(--accent)]">
            เพิ่มเลย
          </button>
        </>
      ) : null}
    </p>
  );
}

function MenuRow({
  icon,
  label,
  trailing,
  danger,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  trailing?: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-4 py-3.5 text-left transition-colors",
        danger
          ? "text-[var(--danger)] hover:border-[color-mix(in_oklab,var(--danger)_40%,transparent)] hover:bg-[color-mix(in_oklab,var(--danger)_10%,transparent)]"
          : "hover:border-[var(--accent-line)]",
      )}
    >
      <span className={cn("shrink-0", !danger && "text-[var(--fg-muted)]")}>{icon}</span>
      <span className="flex-1 text-[14.5px] font-medium">{label}</span>
      {trailing ? <span className="text-[12px] text-[var(--fg-dim)]">{trailing}</span> : null}
    </button>
  );
}
