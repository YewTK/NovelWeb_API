"use client";

import { memo, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Feather,
  Globe2,
  Loader2,
  Map as MapIcon,
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
import { estimateWriting, formatUsd, type WritingEstimate } from "@/lib/cost";
import { useSettings } from "@/lib/store";
import type {
  Chapter,
  ChapterMeta,
  OutlineArc,
  OutlineChapter,
  OutlineCharacter,
  Series,
  StoryOutline,
  WritingProject,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { MAX_CHAPTERS, OUTLINE_BATCH, plannedThrough, type WriterState } from "@/lib/writer";
import { Cover } from "../Bookshelf";
import { Button, Chip, ConfirmDialog, inputClass } from "../ui";

type RowStatus = "none" | "writing" | "draft" | "error" | "done";

/** Chapter plans shown per page — a 4,000-chapter plan never renders at once. */
const PAGE = 50;

const clampTo = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number.isFinite(n) ? n : lo)));

function minutes(m: number): string {
  if (m < 60) return `${m} นาที`;
  if (m < 60 * 48) return `${(m / 60).toFixed(1)} ชม.`;
  return `${Math.round(m / 60 / 24)} วัน`;
}

function costLine(est: WritingEstimate): string {
  return `ประมาณ ${minutes(est.minutes)}${est.usd !== null ? ` · ${formatUsd(est.usd)}` : ""}`;
}

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
  /** plan chapters up to and including `upTo` */
  onPlan: (upTo: number) => void;
  onWrite: (numbers: number[]) => void;
  onStop: () => void;
  onOpenChapter: (id: string) => void;
  onOpenBook: () => void;
  onDelete: () => void;
}) {
  const project = series.info!.project!;
  const outline = project.outline;
  const total = project.chapterCount;
  const style = authorStyle(project.styleId);
  const config = useSettings((s) => s.config);
  const mine = writer.seriesId === series.id;
  const planning = mine && writer.phase === "outline";
  const writing = mine && writer.phase === "writing";
  const busy = writer.phase !== "idle";
  const [tab, setTab] = useState<"chapters" | "bible">("chapters");
  const [rewrite, setRewrite] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

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

  const doneSet = useMemo(() => {
    const out = new Set<number>();
    for (const [n, id] of Object.entries(project.chapterIds)) if (byId.get(id)?.status === "done") out.add(Number(n));
    return out;
  }, [project.chapterIds, byId]);

  const written = doneSet.size;
  const planned = plannedThrough(project);
  const firstGap = (() => {
    for (let n = 1; n <= total; n++) if (!doneSet.has(n)) return n;
    return null;
  })();

  /* --- write up to --- */
  const [writeTo, setWriteTo] = useState(() => Math.min(total, (firstGap ?? total) + 4));
  useEffect(() => {
    // Keep the target ahead of the frontier as chapters get written.
    if (firstGap !== null && writeTo < firstGap) setWriteTo(Math.min(total, firstGap + 4));
  }, [firstGap, writeTo, total]);
  const toWrite = useMemo(() => {
    const out: number[] = [];
    for (let n = firstGap ?? total + 1; n <= Math.min(writeTo, total); n++) if (!doneSet.has(n)) out.push(n);
    return out;
  }, [firstGap, writeTo, total, doneSet]);
  const toPlanForWrite = toWrite.filter((n) => n > planned).length;
  const writeEst = estimateWriting(project, config, { write: toWrite.length, plan: toPlanForWrite });

  /* --- plan up to --- */
  const [planTo, setPlanTo] = useState(() => Math.min(total, planned + OUTLINE_BATCH));
  useEffect(() => {
    if (planTo <= planned) setPlanTo(Math.min(total, planned + OUTLINE_BATCH));
  }, [planned, planTo, total]);
  const planEst = estimateWriting(project, config, { write: 0, plan: Math.max(0, planTo - planned) });

  /* --- chapter list paging --- */
  const pages = Math.max(1, Math.ceil(planned / PAGE));
  const [page, setPage] = useState(() => Math.min(pages - 1, Math.floor(((firstGap ?? 1) - 1) / PAGE)));
  const [jump, setJump] = useState("");
  const visible = (outline?.chapters ?? []).filter((c) => c.n > page * PAGE && c.n <= (page + 1) * PAGE);

  const pct = (n: number) => `${total ? Math.min(100, (n / total) * 100) : 0}%`;

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
              <Chip>{(project.effort ?? "high") === "high" ? "คุณภาพสูงสุด" : "โหมดประหยัด"}</Chip>
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

            {/* two layers: how far it is planned, and how far it is written */}
            <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-[var(--line)]" aria-hidden>
              <div className="absolute inset-y-0 left-0 rounded-full bg-[color-mix(in_oklab,var(--magic)_45%,transparent)] transition-[width] duration-700" style={{ width: pct(planned) }} />
              <div
                className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-700", writing ? "bar-live" : "bg-[var(--accent)]")}
                style={{ width: pct(written) }}
              />
            </div>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] tabular-nums text-[var(--fg-muted)]">
              <span>
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[var(--accent)]" />
                เขียนแล้ว {written.toLocaleString()} ตอน
              </span>
              <span>
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[color-mix(in_oklab,var(--magic)_60%,transparent)]" />
                วางแผนแล้ว {planned.toLocaleString()} ตอน
              </span>
              <span className="text-[var(--fg-dim)]">
                ทั้งเรื่อง {total.toLocaleString()} ตอน · ~{project.wordsPerChapter.toLocaleString()} คำต่อตอน
              </span>
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
          <p className="mx-auto mt-1.5 max-w-[440px] text-[13.5px] leading-relaxed text-[var(--fg-muted)]">
            AI จะสร้างคัมภีร์ของเรื่อง (โลก ระบบพลัง ตัวละคร) แผนภาคของทั้งเรื่อง และแผนรายตอน {Math.min(OUTLINE_BATCH, total)} ตอนแรก
          </p>
          <Button variant="magic" size="lg" className="mt-5" onClick={() => onPlan(Math.min(total, OUTLINE_BATCH))} disabled={busy}>
            {planning ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {planning ? "กำลังวางโครงเรื่อง…" : "วางโครงเรื่อง"}
          </Button>
        </section>
      ) : (
        <>
          {/* controls */}
          <section className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
            <div className="gilded rounded-3xl bg-[var(--bg-elev)]/85 p-5">
              <h3 className="flex items-center gap-2 font-serif text-[16px] font-semibold">
                <PenLine size={16} className="text-[var(--accent)]" /> เขียนนิยาย
              </h3>
              {firstGap === null ? (
                <p className="mt-2 text-[13.5px] text-[var(--fg-muted)]">
                  เขียนครบทั้ง {total.toLocaleString()} ตอนแล้ว — เพิ่มจำนวนตอนในแท็บคัมภีร์ถ้าอยากเขียนภาคต่อ
                </p>
              ) : (
                <>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[13.5px]">
                    <span className="text-[var(--fg-muted)]">เขียนต่อจากตอนที่</span>
                    <span className="rounded-lg bg-[var(--bg-elev-2)] px-2.5 py-1 font-semibold tabular-nums">{firstGap.toLocaleString()}</span>
                    <span className="text-[var(--fg-muted)]">ถึงตอนที่</span>
                    <input
                      type="number"
                      min={firstGap}
                      max={total}
                      value={writeTo}
                      onChange={(e) => setWriteTo(clampTo(Number(e.target.value), firstGap, total))}
                      aria-label="เขียนถึงตอนที่"
                      className={cn(inputClass, "h-9 w-24 py-1 text-right font-semibold tabular-nums")}
                    />
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {[1, 5, 10, 25, 50, 100].map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setWriteTo(Math.min(total, firstGap + k - 1))}
                        aria-pressed={writeTo === Math.min(total, firstGap + k - 1)}
                        className={cn(
                          "h-8 rounded-full border px-3 text-[12.5px] tabular-nums transition-colors",
                          writeTo === Math.min(total, firstGap + k - 1)
                            ? "border-[var(--accent-line)] bg-[var(--accent-soft)] font-medium text-[var(--accent)]"
                            : "border-[var(--line)] text-[var(--fg-muted)] hover:text-[var(--fg)]",
                        )}
                      >
                        {k} ตอน
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-[12px] leading-relaxed text-[var(--fg-dim)]">
                    รอบนี้ {toWrite.length.toLocaleString()} ตอน
                    {toPlanForWrite ? ` (วางแผนเพิ่มอัตโนมัติ ${toPlanForWrite.toLocaleString()} ตอนระหว่างทาง)` : ""} · {costLine(writeEst)}
                  </p>
                  <div className="mt-4 flex gap-2">
                    {writing ? (
                      <Button variant="danger" size="lg" className="flex-1" onClick={onStop}>
                        <Square size={14} fill="currentColor" /> หยุดเขียน
                      </Button>
                    ) : (
                      <Button variant="magic" size="lg" className="flex-1" onClick={() => onWrite(toWrite)} disabled={busy || !toWrite.length}>
                        <PenLine size={16} /> เขียน {toWrite.length.toLocaleString()} ตอน
                      </Button>
                    )}
                    <Button variant="outline" size="lg" onClick={onOpenBook} aria-label="ไปอ่าน">
                      <BookOpen size={16} />
                    </Button>
                  </div>
                </>
              )}
            </div>

            <div className="rounded-3xl border border-[var(--line)] bg-[var(--bg-elev)]/60 p-5">
              <h3 className="flex items-center gap-2 font-serif text-[16px] font-semibold">
                <Sparkles size={16} className="text-[var(--magic)]" /> วางแผนล่วงหน้า
              </h3>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--fg-muted)]">
                วางแผนแล้วถึงตอนที่ {planned.toLocaleString()} — ตรวจแก้แผนก่อนเขียนได้ หรือปล่อยให้ระบบวางให้ทีละ {OUTLINE_BATCH} ตอนเมื่อเขียนถึง
              </p>
              {planned < total ? (
                <>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[13.5px]">
                    <span className="text-[var(--fg-muted)]">วางแผนถึงตอนที่</span>
                    <input
                      type="number"
                      min={planned + 1}
                      max={total}
                      value={planTo}
                      onChange={(e) => setPlanTo(clampTo(Number(e.target.value), planned + 1, total))}
                      aria-label="วางแผนถึงตอนที่"
                      className={cn(inputClass, "h-9 w-24 py-1 text-right font-semibold tabular-nums")}
                    />
                  </div>
                  <p className="mt-2 text-[12px] text-[var(--fg-dim)]">
                    {(planTo - planned).toLocaleString()} ตอน · {costLine(planEst)}
                  </p>
                  <Button variant="outline" size="lg" className="mt-4 w-full" onClick={() => onPlan(planTo)} disabled={busy}>
                    {planning ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} วางแผนเพิ่ม
                  </Button>
                </>
              ) : (
                <p className="mt-3 text-[13px] text-[var(--success)]">วางแผนครบทุกตอนแล้ว</p>
              )}
            </div>
          </section>

          {/* tabs */}
          <div className="flex gap-1 border-b border-[var(--line)]" role="tablist">
            {(
              [
                ["chapters", `แผนรายตอน (${planned.toLocaleString()})`],
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
            <div className="space-y-3">
              {pages > 1 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="icon" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} aria-label="หน้าก่อนหน้า">
                    <ChevronLeft size={16} />
                  </Button>
                  <span className="text-[13px] tabular-nums text-[var(--fg-muted)]">
                    ตอนที่ {(page * PAGE + 1).toLocaleString()}–{Math.min(planned, (page + 1) * PAGE).toLocaleString()}
                  </span>
                  <Button variant="outline" size="icon" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1} aria-label="หน้าถัดไป">
                    <ChevronRight size={16} />
                  </Button>
                  <form
                    className="ml-auto flex items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const n = clampTo(Number(jump), 1, planned);
                      setPage(Math.floor((n - 1) / PAGE));
                      setJump("");
                    }}
                  >
                    <input
                      value={jump}
                      onChange={(e) => setJump(e.target.value.replace(/\D/g, ""))}
                      inputMode="numeric"
                      placeholder="ไปตอนที่…"
                      aria-label="ไปตอนที่"
                      className={cn(inputClass, "h-9 w-28 py-1")}
                    />
                  </form>
                </div>
              ) : null}

              <ol className="space-y-2">
                {visible.map((c) => {
                  const { status, meta } = statusOf(c.n);
                  return (
                    <OutlineRow
                      key={c.n}
                      chapter={c}
                      status={status}
                      disabled={planning}
                      canWrite={!busy}
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

              {planned < total && page >= pages - 1 ? (
                <p className="rounded-2xl border border-dashed border-[var(--line)] px-4 py-4 text-center text-[12.5px] leading-relaxed text-[var(--fg-dim)]">
                  ตอนที่ {(planned + 1).toLocaleString()}–{total.toLocaleString()} ยังไม่ได้วางแผน — ระบบจะวางให้อัตโนมัติเมื่อเขียนถึง
                  หรือกด “วางแผนเพิ่ม” เพื่อตรวจแก้ล่วงหน้า
                </p>
              ) : null}
            </div>
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
        body={`จะลบ “${series.name}” ทั้งโครงเรื่องและ ${chapters.length.toLocaleString()} ตอนที่เขียนไว้ — กู้คืนไม่ได้`}
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
  const latestRecap = [...(outline.recaps ?? [])].sort((a, b) => b.through - a.through)[0];
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

      <ArcsEditor outline={outline} disabled={disabled} onChange={onChange} />

      {latestRecap ? (
        <section className="gilded rounded-3xl bg-[var(--bg-elev)]/70 p-5">
          <h3 className="mb-1 flex items-center gap-2 font-serif text-[16px] font-semibold">
            <BookOpen size={15} className="text-[var(--accent)]" /> เรื่องราวจนถึงตอนที่ {latestRecap.through.toLocaleString()}
          </h3>
          <p className="mb-3 text-[12px] text-[var(--fg-dim)]">
            AI เขียนสรุปนี้ทุกครั้งที่วางแผนเพิ่ม และใช้เป็นความจำระยะยาว — แก้ได้ถ้าอยากเปลี่ยนทิศทาง
          </p>
          <textarea
            value={latestRecap.text}
            disabled={disabled}
            onChange={(e) =>
              onChange({
                ...outline,
                recaps: (outline.recaps ?? []).map((r) => (r.through === latestRecap.through ? { ...r, text: e.target.value } : r)),
              })
            }
            rows={6}
            aria-label="สรุปเรื่องราวล่าสุด"
            className={cn(inputClass, "resize-y leading-relaxed")}
          />
        </section>
      ) : null}

      <section className="gilded rounded-3xl bg-[var(--bg-elev)]/70 p-5">
        <h3 className="mb-3 flex items-center gap-2 font-serif text-[16px] font-semibold">
          <PenLine size={15} className="text-[var(--accent)]" /> ขนาดและคุณภาพ
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-[var(--fg-muted)]">จำนวนตอนทั้งหมด</span>
            <input
              type="number"
              min={1}
              max={MAX_CHAPTERS}
              value={project.chapterCount}
              onChange={(e) => {
                const chapterCount = Math.max(1, Math.min(MAX_CHAPTERS, Math.round(Number(e.target.value) || 1)));
                // The roadmap stretches or shrinks with the book: the last arc absorbs the change.
                const arcs = (outline.arcs ?? []).filter((a) => a.from <= chapterCount).map((a, i, all) =>
                  i === all.length - 1 ? { ...a, to: chapterCount } : { ...a, to: Math.min(a.to, chapterCount) },
                );
                onProject({ chapterCount, outline: { ...outline, arcs } });
              }}
              className={cn(inputClass, "h-10 tabular-nums")}
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
              className={cn(inputClass, "h-10 tabular-nums")}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-[var(--fg-muted)]">คุณภาพการเขียน</span>
            <select
              value={project.effort ?? "high"}
              onChange={(e) => onProject({ effort: e.target.value as "high" | "medium" })}
              className={cn(inputClass, "h-10")}
            >
              <option value="high">ดีที่สุด</option>
              <option value="medium">ประหยัด</option>
            </select>
          </label>
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--fg-dim)]">
          เพิ่มจำนวนตอนได้สูงสุด {MAX_CHAPTERS.toLocaleString()} ตอน — ภาคสุดท้ายในแผนภาคจะยืดออกให้ และตอนใหม่จะถูกวางแผนเมื่อเขียนถึง
        </p>
      </section>
    </div>
  );
}

/* -------------------------------- arc roadmap ------------------------------- */

function ArcsEditor({
  outline,
  disabled,
  onChange,
}: {
  outline: StoryOutline;
  disabled: boolean;
  onChange: (next: StoryOutline) => void;
}) {
  const arcs = outline.arcs ?? [];
  const [open, setOpen] = useState(false);
  const shown = open ? arcs : arcs.slice(0, 6);
  const setArc = (i: number, next: Partial<OutlineArc>) =>
    onChange({ ...outline, arcs: arcs.map((a, k) => (k === i ? { ...a, ...next } : a)) });

  if (!arcs.length) return null;

  return (
    <section className="gilded rounded-3xl bg-[var(--bg-elev)]/70 p-5">
      <h3 className="mb-1 flex items-center gap-2 font-serif text-[16px] font-semibold">
        <MapIcon size={15} className="text-[var(--accent)]" /> แผนภาคของทั้งเรื่อง ({arcs.length})
      </h3>
      <p className="mb-3 text-[12px] text-[var(--fg-dim)]">
        เข็มทิศระยะยาว — ทุกครั้งที่วางแผนรายตอนเพิ่ม AI จะเดินตามภาคที่ตอนนั้นอยู่
      </p>
      <ol className="space-y-2">
        {shown.map((a, i) => (
          <li key={i} className="rounded-2xl border border-[var(--line)] bg-[var(--bg)]/60 p-3">
            <div className="flex items-center gap-2">
              <span className="shrink-0 rounded-md bg-[var(--accent-soft)] px-2 py-0.5 text-[11.5px] font-semibold tabular-nums text-[var(--accent)]">
                {a.from.toLocaleString()}–{a.to.toLocaleString()}
              </span>
              <input
                value={a.name}
                disabled={disabled}
                onChange={(e) => setArc(i, { name: e.target.value })}
                aria-label="ชื่อภาค"
                className={cn(inputClass, "h-9 flex-1 font-semibold")}
              />
            </div>
            <textarea
              value={a.summary}
              disabled={disabled}
              onChange={(e) => setArc(i, { summary: e.target.value })}
              rows={2}
              aria-label="เนื้อหาของภาค"
              className={cn(inputClass, "mt-2 resize-y text-[13px] leading-relaxed")}
            />
          </li>
        ))}
      </ol>
      {arcs.length > 6 ? (
        <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setOpen((v) => !v)}>
          <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} />
          {open ? "ย่อ" : `ดูอีก ${arcs.length - 6} ภาค`}
        </Button>
      ) : null}
    </section>
  );
}
