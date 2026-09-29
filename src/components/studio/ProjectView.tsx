"use client";

import { memo, useMemo, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronDown,
  Feather,
  Globe2,
  Loader2,
  PenLine,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
  Users,
  Wand2,
} from "lucide-react";
import { authorStyle } from "@/lib/authors";
import { estimateWriting, formatUsd } from "@/lib/cost";
import { useSettings } from "@/lib/store";
import type { Chapter, ChapterMeta, OutlineChapter, OutlineCharacter, Series, StoryOutline, WritingProject } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { WriterState } from "@/lib/writer";
import { Cover } from "../Bookshelf";
import { Button, Chip, ConfirmDialog, inputClass } from "../ui";

type RowStatus = "none" | "writing" | "draft" | "error" | "done";

export function ProjectView({
  series,
  chapters,
  writer,
  live,
  onPatch,
  onPlan,
  onWrite,
  onStop,
  onOpenChapter,
  onOpenBook,
  onDelete,
}: {
  series: Series;
  /** this novel's chapters, from the library */
  chapters: ChapterMeta[];
  writer: WriterState;
  /** the chapter being written right now, with its text */
  live: Chapter | null;
  onPatch: (patch: Partial<WritingProject>, name?: string) => void;
  onPlan: () => void;
  onWrite: (numbers: number[]) => void;
  onStop: () => void;
  onOpenChapter: (id: string) => void;
  onOpenBook: () => void;
  onDelete: () => void;
}) {
  const project = series.info!.project!;
  const outline = project.outline;
  const style = authorStyle(project.styleId);
  const config = useSettings((s) => s.config);
  const mine = writer.seriesId === series.id;
  const planning = mine && writer.phase === "outline";
  const writing = mine && writer.phase === "writing";
  const busyElsewhere = writer.phase !== "idle" && !mine;
  const [tab, setTab] = useState<"chapters" | "bible">("chapters");
  const [rewrite, setRewrite] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [batch, setBatch] = useState(5);

  const byId = useMemo(() => new Map(chapters.map((c) => [c.id, c])), [chapters]);

  const statusOf = (n: number): { status: RowStatus; meta?: ChapterMeta } => {
    const id = project.chapterIds[String(n)];
    const meta = id ? byId.get(id) : undefined;
    if (writing && writer.current === n) return { status: "writing", meta };
    if (!meta) return { status: "none" };
    if (meta.status === "done") return { status: "done", meta };
    if (meta.status === "error") return { status: "error", meta };
    return { status: "draft", meta };
  };

  const planned = outline?.chapters.filter((c) => c.n <= project.chapterCount) ?? [];
  const pending = planned.filter((c) => statusOf(c.n).status !== "done").map((c) => c.n);
  const written = planned.length - pending.length;
  const needsMorePlan = Boolean(outline) && planned.length < project.chapterCount;
  const words = chapters.reduce((s, c) => s + (c.status === "done" ? c.paragraphCount : 0), 0);

  const nextBatch = pending.slice(0, batch);
  const estimate = estimateWriting(project, config, nextBatch.length || 1, false);

  return (
    <div className="space-y-6">
      {/* header */}
      <section className="gilded relative overflow-hidden rounded-3xl bg-[var(--bg-elev)]/85 p-5 sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full blur-3xl" style={{ background: `hsl(${style.hue} 70% 50% / .22)` }} />
        <div className="relative flex gap-5">
          <button onClick={onOpenBook} className="group hidden w-[108px] shrink-0 sm:block" aria-label="เปิดหน้าหนังสือ">
            <Cover name={series.name} seed={series.key || series.id} author={series.info?.author} image={series.info?.cover} size="md" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-1.5">
              <Chip tone="magic">
                <Feather size={11} /> สำนวน {style.label}
              </Chip>
              <Chip>{project.language === "th" ? "ภาษาไทย" : "English"}</Chip>
              {project.tags.slice(0, 4).map((t) => (
                <Chip key={t}>#{t}</Chip>
              ))}
            </div>
            <input
              value={series.name}
              onChange={(e) => onPatch({}, e.target.value)}
              aria-label="ชื่อเรื่อง"
              className="mt-3 w-full bg-transparent font-serif text-[24px] font-bold leading-tight outline-none sm:text-[30px]"
            />
            {project.blurb ? (
              <p className="mt-1.5 line-clamp-2 font-serif text-[14px] italic text-[var(--fg-muted)]">“{project.blurb}”</p>
            ) : null}

            <div className="mt-4 flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--line)]">
                <div
                  className={cn("h-full rounded-full transition-[width] duration-700", writing ? "bar-live" : "bg-[var(--accent)]")}
                  style={{ width: `${project.chapterCount ? (written / project.chapterCount) * 100 : 0}%` }}
                />
              </div>
              <span className="shrink-0 text-[12.5px] tabular-nums text-[var(--fg-muted)]">
                เขียนแล้ว {written}/{project.chapterCount} ตอน
              </span>
            </div>
            <p className="mt-1.5 text-[11.5px] text-[var(--fg-dim)]">
              ~{project.wordsPerChapter.toLocaleString()} คำต่อตอน · {words.toLocaleString()} ย่อหน้าที่เขียนแล้ว
            </p>
          </div>
        </div>
      </section>

      {/* live writing */}
      {writing || planning ? (
        <LivePanel writer={writer} live={live} planning={planning} onStop={onStop} onOpen={onOpenChapter} />
      ) : null}

      {!outline ? (
        <section className="gilded rounded-3xl bg-[var(--bg-elev)]/70 p-6 text-center">
          <Wand2 className="mx-auto text-[var(--magic)]" size={28} />
          <h3 className="mt-3 font-serif text-[19px] font-semibold">ยังไม่มีโครงเรื่อง</h3>
          <p className="mx-auto mt-1.5 max-w-[420px] text-[13.5px] leading-relaxed text-[var(--fg-muted)]">
            AI จะสร้างคัมภีร์ของเรื่อง (โลก ระบบพลัง ตัวละคร) และแผนทุกตอนจากเรื่องย่อของคุณ
          </p>
          <Button variant="magic" size="lg" className="mt-5" onClick={onPlan} disabled={planning || busyElsewhere}>
            {planning ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {planning ? "กำลังวางโครงเรื่อง…" : "วางโครงเรื่อง"}
          </Button>
        </section>
      ) : (
        <>
          {/* actions */}
          <section className="flex flex-col gap-3 rounded-3xl border border-[var(--line)] bg-[var(--bg-elev)]/60 p-4 sm:flex-row sm:items-center sm:p-5">
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold">
                {pending.length ? `เหลืออีก ${pending.length} ตอนที่ยังไม่ได้เขียน` : "เขียนครบทุกตอนที่วางไว้แล้ว"}
              </p>
              <p className="mt-0.5 text-[12px] text-[var(--fg-dim)]">
                {pending.length
                  ? `รอบนี้ ${nextBatch.length} ตอน · ประมาณ ${estimate.minutes} นาที${estimate.usd !== null ? ` · ${formatUsd(estimate.usd)}` : ""}`
                  : needsMorePlan
                    ? "วางโครงตอนที่เหลือเพื่อเขียนต่อ"
                    : "เพิ่มจำนวนตอนในแท็บคัมภีร์ถ้าอยากเขียนภาคต่อ"}
              </p>
            </div>
            {pending.length ? (
              <div className="flex items-center gap-2">
                <label className="relative">
                  <span className="sr-only">จำนวนตอนต่อรอบ</span>
                  <select
                    value={batch}
                    onChange={(e) => setBatch(Number(e.target.value))}
                    className="h-11 appearance-none rounded-xl border border-[var(--line)] bg-[var(--bg)] pl-3 pr-8 text-[13.5px] outline-none"
                  >
                    {[1, 3, 5, 10, 20].filter((n) => n < pending.length).map((n) => (
                      <option key={n} value={n}>
                        {n} ตอน
                      </option>
                    ))}
                    <option value={pending.length}>ทั้งหมด ({pending.length})</option>
                  </select>
                  <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--fg-dim)]" />
                </label>
                {needsMorePlan && !writing ? (
                  <Button variant="outline" size="lg" onClick={onPlan} disabled={planning || busyElsewhere} aria-label="วางโครงตอนที่เหลือ">
                    <Sparkles size={16} /> <span className="hidden sm:inline">วางโครงเพิ่ม</span>
                  </Button>
                ) : null}
                {writing ? (
                  <Button variant="danger" size="lg" onClick={onStop}>
                    <Square size={14} fill="currentColor" /> หยุด
                  </Button>
                ) : (
                  <Button variant="magic" size="lg" onClick={() => onWrite(nextBatch)} disabled={busyElsewhere || planning}>
                    <PenLine size={16} /> เขียนต่อ
                  </Button>
                )}
              </div>
            ) : needsMorePlan ? (
              <Button variant="magic" size="lg" onClick={onPlan} disabled={planning || busyElsewhere}>
                <Sparkles size={16} /> วางโครงตอนที่เหลือ
              </Button>
            ) : (
              <Button variant="outline" size="lg" onClick={onOpenBook}>
                <BookOpen size={16} /> ไปอ่าน
              </Button>
            )}
          </section>

          {/* tabs */}
          <div className="flex gap-1 border-b border-[var(--line)]" role="tablist">
            {(
              [
                ["chapters", `แผนรายตอน (${planned.length})`],
                ["bible", "คัมภีร์ของเรื่อง"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn(
                  "relative h-11 px-4 text-[14px] font-medium transition-colors",
                  tab === key ? "text-[var(--fg)]" : "text-[var(--fg-dim)] hover:text-[var(--fg-muted)]",
                )}
              >
                {label}
                {tab === key ? <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t-full bg-[var(--accent)]" /> : null}
              </button>
            ))}
          </div>

          {tab === "chapters" ? (
            <ol className="space-y-2">
              {planned.map((c) => {
                const { status, meta } = statusOf(c.n);
                return (
                  <OutlineRow
                    key={c.n}
                    chapter={c}
                    status={status}
                    disabled={planning}
                    canWrite={!writing && !busyElsewhere && !planning}
                    onChange={(next) =>
                      onPatch({
                        outline: {
                          ...outline,
                          chapters: outline.chapters.map((x) => (x.n === c.n ? { ...x, ...next } : x)),
                        },
                      })
                    }
                    onWrite={() => (status === "done" ? setRewrite(c.n) : onWrite([c.n]))}
                    onRead={meta ? () => onOpenChapter(meta.id) : undefined}
                  />
                );
              })}
            </ol>
          ) : (
            <BibleEditor
              outline={outline}
              project={project}
              disabled={planning}
              onChange={(next) => onPatch({ outline: next })}
              onProject={(next) => onPatch(next)}
            />
          )}
        </>
      )}

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} className="text-[var(--danger)]" disabled={writing || planning}>
          <Trash2 size={14} /> ลบโปรเจกต์นี้
        </Button>
      </div>

      <ConfirmDialog
        open={rewrite !== null}
        title={`เขียนตอนที่ ${rewrite} ใหม่?`}
        confirmLabel="เขียนใหม่"
        onCancel={() => setRewrite(null)}
        onConfirm={() => {
          if (rewrite !== null) onWrite([rewrite]);
          setRewrite(null);
        }}
        body="เนื้อหาเดิมของตอนนี้จะถูกแทนที่ด้วยฉบับที่เขียนใหม่ตามแผนปัจจุบัน"
      />
      <ConfirmDialog
        open={confirmDelete}
        tone="danger"
        title="ลบโปรเจกต์นี้?"
        confirmLabel="ลบทั้งหมด"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          onDelete();
        }}
        body={`จะลบ “${series.name}” ทั้งโครงเรื่องและ ${chapters.length} ตอนที่เขียนไว้ — กู้คืนไม่ได้`}
      />
    </div>
  );
}

/* ------------------------------- live panel ------------------------------- */

function LivePanel({
  writer,
  live,
  planning,
  onStop,
  onOpen,
}: {
  writer: WriterState;
  live: Chapter | null;
  planning: boolean;
  onStop: () => void;
  onOpen: (id: string) => void;
}) {
  const tail = live?.paragraphs.slice(-5) ?? [];
  return (
    <section className="gilded relative overflow-hidden rounded-3xl bg-[linear-gradient(160deg,color-mix(in_oklab,var(--magic)_12%,var(--bg-elev)),var(--bg-elev))] p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="relative grid h-10 w-10 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--magic)_22%,transparent)] text-[var(--magic)]">
          <Feather size={18} />
          <span className="dot-live absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[var(--magic)]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-semibold">
            {planning
              ? `กำลังวางโครงเรื่อง${writer.current ? ` · ถึงตอนที่ ${writer.current}` : ""}`
              : live?.title ?? `กำลังเขียนตอนที่ ${writer.current ?? ""}`}
          </p>
          <p className="mt-0.5 text-[12px] text-[var(--fg-muted)]">
            {writer.notice ??
              (planning
                ? `วางแผนแล้ว ${writer.done} ตอน · ${writer.chars.toLocaleString()} ตัวอักษร`
                : `ตอนที่ ${writer.done + 1} จาก ${writer.total} ในรอบนี้${writer.parts > 1 ? ` · ส่วน ${writer.part}/${writer.parts}` : ""} · ${writer.chars.toLocaleString()} ตัวอักษร`)}
          </p>
        </div>
        {live && !planning ? (
          <Button variant="outline" size="sm" onClick={() => onOpen(live.id)}>
            <Play size={13} /> <span className="hidden sm:inline">อ่านสด</span>
          </Button>
        ) : null}
        <Button variant="danger" size="sm" onClick={onStop} aria-label="หยุด">
          <Square size={12} fill="currentColor" /> <span className="hidden sm:inline">หยุด</span>
        </Button>
      </div>

      <div className="mt-4 h-1 overflow-hidden rounded-full bg-[var(--line)]">
        <div
          className="bar-live h-full rounded-full transition-[width] duration-700"
          style={{
            width: `${Math.max(4, planning ? (writer.done / Math.max(1, writer.total)) * 100 : ((writer.done + (live?.progress ?? 0)) / Math.max(1, writer.total)) * 100)}%`,
          }}
        />
      </div>

      {!planning && tail.length ? (
        <div className="relative mt-4 max-h-[220px] overflow-hidden font-serif text-[15px] leading-[1.95] text-[var(--fg-muted)]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-[color-mix(in_oklab,var(--magic)_6%,var(--bg-elev))] to-transparent" />
          {tail.map((p, i) => (
            <p key={p.id} className={cn("mb-2 [text-indent:2em]", i === tail.length - 1 && "caret text-[var(--fg)]")}>
              {p.target}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/* ------------------------------- outline row ------------------------------ */

const STATUS_CHIP: Record<RowStatus, { label: string; tone: "plain" | "accent" | "magic" | "success" | "danger" }> = {
  none: { label: "ยังไม่เขียน", tone: "plain" },
  writing: { label: "กำลังเขียน", tone: "magic" },
  draft: { label: "เขียนค้าง", tone: "accent" },
  error: { label: "ผิดพลาด", tone: "danger" },
  done: { label: "เสร็จแล้ว", tone: "success" },
};

const OutlineRow = memo(function OutlineRow({
  chapter,
  status,
  disabled,
  canWrite,
  onChange,
  onWrite,
  onRead,
}: {
  chapter: OutlineChapter;
  status: RowStatus;
  disabled: boolean;
  canWrite: boolean;
  onChange: (next: Partial<OutlineChapter>) => void;
  onWrite: () => void;
  onRead?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const chip = STATUS_CHIP[status];
  return (
    <li
      className={cn(
        "cv-auto rounded-2xl border bg-[var(--bg-elev)]/60 transition-colors [contain-intrinsic-size:auto_76px]",
        status === "writing" ? "border-[color-mix(in_oklab,var(--magic)_55%,transparent)]" : "border-[var(--line)]",
      )}
    >
      <div className="flex items-center gap-3 p-3 sm:px-4">
        <span
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-xl font-display text-[14px] font-semibold tabular-nums",
            status === "done" ? "bg-[color-mix(in_oklab,var(--success)_15%,transparent)] text-[var(--success)]" : "bg-[var(--bg-elev-2)] text-[var(--fg-muted)]",
          )}
        >
          {status === "done" ? <Check size={16} /> : status === "writing" ? <Loader2 size={15} className="animate-spin text-[var(--magic)]" /> : chapter.n}
        </span>
        <button onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 text-left" aria-expanded={open}>
          <span className="flex items-center gap-2">
            <span className="truncate text-[14px] font-semibold">
              <span className="text-[var(--fg-dim)]">ตอนที่ {chapter.n} · </span>
              {chapter.title}
            </span>
            <ChevronDown size={14} className={cn("shrink-0 text-[var(--fg-dim)] transition-transform", open && "rotate-180")} />
          </span>
          {!open ? <span className="mt-0.5 block truncate text-[12px] text-[var(--fg-dim)]">{chapter.summary || "— ยังไม่มีแผน —"}</span> : null}
        </button>
        <Chip tone={chip.tone} className="hidden sm:inline-flex">
          {chip.label}
        </Chip>
        {onRead ? (
          <Button variant="ghost" size="icon" onClick={onRead} aria-label="อ่านตอนนี้">
            <BookOpen size={16} />
          </Button>
        ) : null}
        <Button variant="ghost" size="icon" onClick={onWrite} disabled={!canWrite} aria-label={status === "done" ? "เขียนตอนนี้ใหม่" : "เขียนตอนนี้"}>
          {status === "done" ? <RotateCcw size={15} /> : <PenLine size={16} />}
        </Button>
      </div>
      {open ? (
        <div className="space-y-2 border-t border-[var(--line-soft)] p-3 sm:px-4">
          <input
            value={chapter.title}
            disabled={disabled}
            onChange={(e) => onChange({ title: e.target.value })}
            aria-label="ชื่อตอน"
            className={cn(inputClass, "h-10 font-medium")}
          />
          <textarea
            value={chapter.summary}
            disabled={disabled}
            onChange={(e) => onChange({ summary: e.target.value })}
            rows={4}
            aria-label="แผนของตอน"
            placeholder="เกิดอะไรขึ้นในตอนนี้ จุดพลิก และตะขอท้ายตอน"
            className={cn(inputClass, "resize-y leading-relaxed")}
          />
          <p className="text-[11.5px] text-[var(--fg-dim)]">แก้แผนแล้ว AI จะใช้ฉบับนี้ตอนเขียน — บันทึกอัตโนมัติ</p>
        </div>
      ) : null}
    </li>
  );
});

/* ------------------------------- bible editor ------------------------------ */

function BibleEditor({
  outline,
  project,
  disabled,
  onChange,
  onProject,
}: {
  outline: StoryOutline;
  project: WritingProject;
  disabled: boolean;
  onChange: (next: StoryOutline) => void;
  onProject: (next: Partial<WritingProject>) => void;
}) {
  const setCast = (i: number, next: Partial<OutlineCharacter>) =>
    onChange({ ...outline, characters: outline.characters.map((c, k) => (k === i ? { ...c, ...next } : c)) });

  return (
    <div className="space-y-5">
      <section className="gilded rounded-3xl bg-[var(--bg-elev)]/70 p-5">
        <h3 className="mb-3 flex items-center gap-2 font-serif text-[16px] font-semibold">
          <Sparkles size={15} className="text-[var(--accent)]" /> แก่นเรื่อง
        </h3>
        <textarea
          value={outline.logline}
          disabled={disabled}
          onChange={(e) => onChange({ ...outline, logline: e.target.value })}
          rows={2}
          aria-label="แก่นเรื่อง"
          className={cn(inputClass, "resize-y font-serif text-[15px] leading-relaxed")}
        />
      </section>

      <section className="gilded rounded-3xl bg-[var(--bg-elev)]/70 p-5">
        <h3 className="mb-3 flex items-center gap-2 font-serif text-[16px] font-semibold">
          <Globe2 size={15} className="text-[var(--accent)]" /> โลก ระบบพลัง และบรรยากาศ
        </h3>
        <textarea
          value={outline.world}
          disabled={disabled}
          onChange={(e) => onChange({ ...outline, world: e.target.value })}
          rows={8}
          aria-label="โลกของเรื่อง"
          className={cn(inputClass, "resize-y leading-relaxed")}
        />
      </section>

      <section className="gilded rounded-3xl bg-[var(--bg-elev)]/70 p-5">
        <h3 className="mb-3 flex items-center gap-2 font-serif text-[16px] font-semibold">
          <Users size={15} className="text-[var(--accent)]" /> ตัวละคร ({outline.characters.length})
        </h3>
        <div className="grid gap-3 md:grid-cols-2">
          {outline.characters.map((c, i) => (
            <div key={i} className="rounded-2xl border border-[var(--line)] bg-[var(--bg)]/60 p-3">
              <div className="flex gap-2">
                <input
                  value={c.name}
                  disabled={disabled}
                  onChange={(e) => setCast(i, { name: e.target.value })}
                  aria-label="ชื่อตัวละคร"
                  className={cn(inputClass, "h-9 flex-1 font-semibold")}
                />
                <button
                  type="button"
                  onClick={() => onChange({ ...outline, characters: outline.characters.filter((_, k) => k !== i) })}
                  disabled={disabled}
                  aria-label={`ลบ ${c.name}`}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--fg-dim)] hover:bg-[color-mix(in_oklab,var(--danger)_12%,transparent)] hover:text-[var(--danger)]"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <input
                value={c.role}
                disabled={disabled}
                onChange={(e) => setCast(i, { role: e.target.value })}
                placeholder="บทบาท"
                aria-label="บทบาท"
                className={cn(inputClass, "mt-2 h-9 text-[13px]")}
              />
              <textarea
                value={c.profile}
                disabled={disabled}
                onChange={(e) => setCast(i, { profile: e.target.value })}
                rows={3}
                aria-label="รายละเอียดตัวละคร"
                className={cn(inputClass, "mt-2 resize-y text-[13px] leading-relaxed")}
              />
            </div>
          ))}
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange({ ...outline, characters: [...outline.characters, { name: "ตัวละครใหม่", role: "", profile: "" }] })}
            className="grid min-h-[120px] place-items-center rounded-2xl border border-dashed border-[var(--line)] text-[13px] text-[var(--fg-muted)] transition-colors hover:border-[var(--accent-line)] hover:text-[var(--accent)]"
          >
            <span className="flex items-center gap-1.5">
              <Plus size={15} /> เพิ่มตัวละคร
            </span>
          </button>
        </div>
      </section>

      <section className="gilded rounded-3xl bg-[var(--bg-elev)]/70 p-5">
        <h3 className="mb-3 flex items-center gap-2 font-serif text-[16px] font-semibold">
          <PenLine size={15} className="text-[var(--accent)]" /> ความยาวของเรื่อง
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-[var(--fg-muted)]">จำนวนตอนทั้งหมด</span>
            <input
              type="number"
              min={Math.max(1, outline.chapters.length ? 1 : 1)}
              max={500}
              value={project.chapterCount}
              onChange={(e) => onProject({ chapterCount: Math.max(1, Math.min(500, Number(e.target.value) || 1)) })}
              className={cn(inputClass, "h-10")}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-[var(--fg-muted)]">คำต่อตอน</span>
            <input
              type="number"
              min={600}
              max={6000}
              step={100}
              value={project.wordsPerChapter}
              onChange={(e) => onProject({ wordsPerChapter: Math.max(600, Math.min(6000, Number(e.target.value) || 600)) })}
              className={cn(inputClass, "h-10")}
            />
          </label>
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--fg-dim)]">
          เพิ่มจำนวนตอนแล้วกด “วางโครงตอนที่เหลือ” เพื่อต่อภาคใหม่ โดย AI จะอ่านคัมภีร์และแผนเดิมก่อน
        </p>
      </section>
    </div>
  );
}
