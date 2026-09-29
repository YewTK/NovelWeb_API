"use client";

import { ArrowLeft, Feather, Plus } from "lucide-react";
import { authorStyle } from "@/lib/authors";
import type { Chapter, ChapterMeta, Series, WritingProject } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { WriterState } from "@/lib/writer";
import { Cover } from "../Bookshelf";
import { GrimoireScene } from "../three/Scenes";
import { NewProject, type NewProjectDraft } from "./NewProject";
import { ProjectView } from "./ProjectView";

export function Studio({
  projects,
  chaptersOf,
  activeId,
  writer,
  live,
  hasKey,
  onSelect,
  onCreate,
  onPatch,
  onPlan,
  onWrite,
  onStop,
  onOpenChapter,
  onOpenBook,
  onDelete,
  onOpenSettings,
}: {
  /** novels that carry a writing project, newest first */
  projects: Series[];
  chaptersOf: (seriesId: string) => ChapterMeta[];
  activeId: string | null;
  writer: WriterState;
  live: Chapter | null;
  hasKey: boolean;
  onSelect: (id: string | null) => void;
  onCreate: (draft: NewProjectDraft) => void;
  onPatch: (id: string, patch: Partial<WritingProject>, name?: string) => void;
  onPlan: (id: string) => void;
  onWrite: (id: string, numbers: number[]) => void;
  onStop: () => void;
  onOpenChapter: (id: string) => void;
  onOpenBook: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenSettings: () => void;
}) {
  const active = activeId ? projects.find((p) => p.id === activeId) ?? null : null;
  const working = writer.phase !== "idle";

  return (
    <main className="relative z-10 pb-28 md:pb-12">
      {/* header */}
      <section className="relative mx-auto grid max-w-[1180px] items-center gap-4 px-4 pb-4 pt-6 sm:px-6 md:grid-cols-[1fr_300px]">
        <div>
          {active ? (
            <button
              onClick={() => onSelect(null)}
              className="mb-3 flex w-fit items-center gap-1.5 text-[13px] text-[var(--fg-muted)] transition-colors hover:text-[var(--fg)]"
            >
              <ArrowLeft size={15} /> โปรเจกต์ทั้งหมด
            </button>
          ) : null}
          <p className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.2em] text-[var(--magic)]">
            <Feather size={13} /> Writing Studio
          </p>
          <h1 className="mt-2 text-balance font-serif text-[30px] font-bold leading-tight sm:text-[40px]">
            {active ? "โต๊ะเขียนของคุณ" : (
              <>
                แต่งนิยายทั้งเรื่อง <span className="text-gilded">ด้วยสำนวนระดับตำนาน</span>
              </>
            )}
          </h1>
          <p className="mt-2 max-w-[560px] text-[14px] leading-relaxed text-[var(--fg-muted)]">
            {active
              ? "ตรวจแก้คัมภีร์และแผนรายตอนได้ตลอด แล้วสั่ง AI เขียนทีละกี่ตอนก็ได้ — ปิดหน้านี้ไปอ่านตอนที่เสร็จแล้วระหว่างรอได้"
              : "เรื่องย่อ คำโปรย แท็ก จำนวนตอน ความยาว และสำนวนแบบนักเขียนที่คุณรัก — AI วางโครงทั้งเล่มให้ตรวจก่อน แล้วค่อยเขียนทีละตอนโดยจำเรื่องที่ผ่านมาได้"}
          </p>
          {!hasKey ? (
            <button
              onClick={onOpenSettings}
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] px-4 py-2 text-[13px] font-medium text-[var(--accent)]"
            >
              ใส่ API Key ก่อนเริ่มเขียน →
            </button>
          ) : null}
        </div>
        <GrimoireScene mode={working ? "writing" : "idle"} compact className="hidden h-[240px] md:block" />
      </section>

      <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
        {active ? (
          <ProjectView
            key={active.id}
            series={active}
            chapters={chaptersOf(active.id)}
            writer={writer}
            live={live && live.seriesId === active.id ? live : null}
            onPatch={(patch, name) => onPatch(active.id, patch, name)}
            onPlan={() => onPlan(active.id)}
            onWrite={(numbers) => onWrite(active.id, numbers)}
            onStop={onStop}
            onOpenChapter={onOpenChapter}
            onOpenBook={() => onOpenBook(active.id)}
            onDelete={() => onDelete(active.id)}
          />
        ) : (
          <>
            {projects.length ? (
              <section className="mb-10">
                <h2 className="mb-3 font-serif text-[18px] font-semibold">โปรเจกต์ของฉัน</h2>
                <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
                  {projects.map((s) => (
                    <ProjectCard
                      key={s.id}
                      series={s}
                      written={chaptersOf(s.id).filter((c) => c.status === "done").length}
                      live={writer.seriesId === s.id && working}
                      onOpen={() => onSelect(s.id)}
                    />
                  ))}
                </div>
                <p className="mt-8 flex items-center gap-2 font-serif text-[18px] font-semibold">
                  <Plus size={17} className="text-[var(--accent)]" /> เริ่มเรื่องใหม่
                </p>
              </section>
            ) : null}
            <NewProject busy={working} onCreate={onCreate} />
          </>
        )}
      </div>
    </main>
  );
}

function ProjectCard({
  series,
  written,
  live,
  onOpen,
}: {
  series: Series;
  written: number;
  live: boolean;
  onOpen: () => void;
}) {
  const project = series.info!.project!;
  const style = authorStyle(project.styleId);
  const pct = project.chapterCount ? written / project.chapterCount : 0;
  return (
    <button
      onClick={onOpen}
      className={cn(
        "group gilded flex w-[280px] shrink-0 gap-3 rounded-2xl bg-[var(--bg-elev)]/75 p-3 text-left transition-colors hover:bg-[var(--bg-elev-2)] sm:w-auto",
        live && "shadow-[0_0_0_1.5px_var(--magic)]",
      )}
    >
      <div className="w-[64px] shrink-0">
        <Cover name={series.name} seed={series.key || series.id} image={series.info?.cover} size="sm" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[14px] font-semibold leading-snug">{series.name}</p>
        <p className="mt-0.5 truncate text-[11.5px] text-[var(--fg-dim)]">สำนวน {style.label}</p>
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-[var(--line)]">
          <div className={cn("h-full rounded-full", live ? "bar-live" : "bg-[var(--accent)]")} style={{ width: `${Math.max(3, pct * 100)}%` }} />
        </div>
        <p className="mt-1 text-[11.5px] tabular-nums text-[var(--fg-muted)]">
          {live ? "กำลังเขียน… " : ""}
          {written}/{project.chapterCount} ตอน{project.outline ? "" : " · ยังไม่วางโครง"}
        </p>
      </div>
    </button>
  );
}
