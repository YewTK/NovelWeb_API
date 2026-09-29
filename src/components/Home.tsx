"use client";

import { useMemo, type ReactNode, type RefObject } from "react";
import { ArrowRight, BookMarked, Feather, Languages, Link2, Lock, Sparkles, Wand2 } from "lucide-react";
import { AUTHOR_STYLES } from "@/lib/authors";
import type { ReadMark } from "@/lib/reading";
import { chapterLabel, chapterNumber } from "@/lib/series";
import {
  Bookshelf,
  ContinueReading,
  Cover,
  SectionTitle,
  hueOf,
  isOriginal,
  lastOpened,
  readCount,
  resumeTarget,
  type Shelf,
} from "./Bookshelf";
import { Composer, type ComposerHandle } from "./Composer";
import type { ShelfOption } from "./ShelfPicker";
import { GrimoireScene, Shelf3D, type ShelfItem } from "./three/Scenes";

export function Home({
  shelves,
  marks,
  activity,
  jobBanner,
  composerRef,
  composer,
  onOpenBook,
  onOpenChapter,
  onStudio,
}: {
  shelves: Shelf[];
  marks: Record<string, ReadMark>;
  activity: Record<string, string>;
  jobBanner: ReactNode;
  composerRef: RefObject<ComposerHandle | null>;
  composer: {
    busy: boolean;
    onSubmit: (input: string, kind: "url" | "text") => void;
    onOpenSettings: () => void;
    shelves: ShelfOption[];
    shelfId: string;
    onShelfChange: (id: string) => void;
    onImportPdf: () => void;
  };
  onOpenBook: (id: string) => void;
  onOpenChapter: (id: string) => void;
  onStudio: () => void;
}) {
  const totals = useMemo(() => {
    let chapters = 0;
    let read = 0;
    for (const s of shelves) {
      chapters += s.chapters.length;
      read += readCount(s, marks);
    }
    return { books: shelves.length, chapters, read };
  }, [shelves, marks]);

  // The 3D shelf: the dozen novels touched most recently.
  const spotlight = useMemo<ShelfItem[]>(() => {
    return [...shelves]
      .filter((s) => s.series.id)
      .sort((a, b) => Math.max(lastOpened(b, marks), b.updatedAt) - Math.max(lastOpened(a, marks), a.updatedAt))
      .slice(0, 12)
      .map((s) => {
        const resume = resumeTarget(s, marks);
        const read = readCount(s, marks);
        const n = resume ? chapterNumber(resume.chapter) : null;
        return {
          id: s.series.id,
          title: s.series.name,
          author: s.series.info?.author,
          cover: s.series.info?.cover,
          hue: hueOf(s.series.key || s.series.id),
          subtitle: `${s.chapters.length} ตอน · อ่านแล้ว ${read}${isOriginal(s.series) ? " · AI เขียน" : ""}`,
          progress: s.chapters.length ? read / s.chapters.length : 0,
          action: resume?.started ? `อ่านต่อ${n !== null ? ` ${chapterLabel(n)}` : ""}` : "เปิดเรื่องนี้",
        };
      });
  }, [shelves, marks]);

  const hasOriginals = shelves.some((s) => isOriginal(s.series));

  return (
    <main className="relative z-10 pb-24 md:pb-10">
      {/* ------------------------------- hero ------------------------------- */}
      <section className="relative mx-auto grid max-w-[1180px] items-center gap-2 px-4 pt-2 sm:px-6 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[1.05fr_1fr] lg:gap-8 lg:pt-0">
        <div className="relative order-2 lg:order-1">
          <p className="rise inline-flex items-center gap-2 rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] px-3.5 py-1.5 text-[12px] font-medium text-[var(--accent)]">
            <Sparkles size={12} /> ห้องสมุดนิยาย · แปล · แต่ง ด้วย AI ของคุณเอง
          </p>
          <h1
            className="rise mt-5 font-serif text-[32px] font-bold leading-[1.22] tracking-tight sm:text-[46px] lg:text-[52px]"
            style={{ animationDelay: "60ms" }}
          >
            ทุกตำนานจากทั่วโลก
            <br />
            <span className="text-gilded">อ่านเป็นภาษาไทยทันที</span>
          </h1>
          <p
            className="rise mt-4 max-w-[520px] text-pretty text-[15px] leading-relaxed text-[var(--fg-muted)] sm:text-[16px]"
            style={{ animationDelay: "120ms" }}
          >
            วางลิงก์ตอนนิยาย ระบบดึงเนื้อหา ล็อกชื่อตัวละครให้คงเส้นคงวาทั้งเรื่อง แล้วแปลสดทีละย่อหน้า —
            หรือเปิดสตูดิโอให้ AI แต่งนิยายทั้งเรื่องจากเรื่องย่อของคุณ
          </p>

          <div className="rise mt-7" style={{ animationDelay: "180ms" }}>
            <Composer ref={composerRef} busyLabel="กำลังดึงเนื้อหา…" {...composer} />
          </div>

          <ul className="rise mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] text-[var(--fg-dim)]" style={{ animationDelay: "240ms" }}>
            <li className="flex items-center gap-1.5">
              <Link2 size={13} className="text-[var(--accent)]" /> ดึงจากลิงก์ได้เกือบทุกเว็บ
            </li>
            <li className="flex items-center gap-1.5">
              <Languages size={13} className="text-[var(--accent)]" /> คลังคำศัพท์ระดับเรื่อง
            </li>
            <li className="flex items-center gap-1.5">
              <Lock size={13} className="text-[var(--accent)]" /> API Key อยู่ในเครื่องคุณเท่านั้น
            </li>
          </ul>
        </div>

        <div className="relative order-1 -mx-4 h-[250px] sm:mx-0 sm:h-[340px] lg:order-2 lg:h-[620px]">
          <GrimoireScene className="absolute inset-0" />
          {totals.books > 0 ? (
            <div className="glass float-y absolute bottom-[8%] left-[4%] hidden rounded-2xl border border-[var(--line)] px-4 py-3 shadow-[var(--shadow-card)] lg:block">
              <p className="font-display text-[26px] font-semibold leading-none text-[var(--accent)]">{totals.books}</p>
              <p className="mt-1 text-[12px] text-[var(--fg-muted)]">เรื่องบนชั้น · {totals.chapters.toLocaleString()} ตอน</p>
            </div>
          ) : null}
          <button
            onClick={onStudio}
            className="glass gilded group absolute right-[4%] top-[10%] hidden items-center gap-3 rounded-2xl px-4 py-3 text-left shadow-[var(--shadow-card)] transition-transform hover:-translate-y-0.5 lg:flex"
            style={{ animation: "float-y 6s ease-in-out infinite 1s" }}
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--magic)_22%,transparent)] text-[var(--magic)]">
              <Feather size={17} />
            </span>
            <span>
              <span className="block text-[13px] font-semibold">สตูดิโอเขียนนิยาย</span>
              <span className="block text-[11.5px] text-[var(--fg-muted)]">ให้ AI แต่งทั้งเรื่องในสไตล์ที่คุณชอบ</span>
            </span>
            <ArrowRight size={15} className="text-[var(--fg-dim)] transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </section>

      {jobBanner ? <div className="mx-auto max-w-[1180px] px-4 pb-8 sm:px-6">{jobBanner}</div> : null}

      {shelves.length === 0 ? <EmptyLibrary onStudio={onStudio} /> : null}

      <ContinueReading shelves={shelves} marks={marks} onOpenChapter={onOpenChapter} />

      {spotlight.length >= 2 ? (
        <section className="relative mx-auto w-full max-w-[1180px] px-4 pb-12 sm:px-6">
          <SectionTitle icon={<BookMarked size={15} />} title="หยิบเล่มถัดไป" />
          <div className="gilded relative overflow-hidden rounded-[28px] bg-[radial-gradient(90%_70%_at_50%_0%,color-mix(in_oklab,var(--magic)_14%,transparent),transparent),var(--bg-elev)]/60 pb-8 pt-2">
            <Shelf3D
              items={spotlight}
              onOpen={onOpenBook}
              fallback={
                <div className="no-scrollbar flex gap-4 overflow-x-auto px-6 py-6">
                  {spotlight.map((b) => (
                    <button key={b.id} onClick={() => onOpenBook(b.id)} className="group w-[120px] shrink-0 text-left">
                      <Cover name={b.title} seed={b.id} image={b.cover} author={b.author} />
                      <p className="mt-2 line-clamp-2 text-[13px] font-semibold">{b.title}</p>
                    </button>
                  ))}
                </div>
              }
            />
          </div>
        </section>
      ) : null}

      {!hasOriginals ? <StudioInvite onStudio={onStudio} /> : null}

      <Bookshelf shelves={shelves} marks={marks} activity={activity} onOpen={onOpenBook} />
    </main>
  );
}

function EmptyLibrary({ onStudio }: { onStudio: () => void }) {
  const steps = [
    { icon: <Link2 size={18} />, title: "วางลิงก์ตอนแรก", text: "จากเว็บนิยายต่างประเทศ หรือวางเนื้อหาดิบก็ได้" },
    { icon: <Languages size={18} />, title: "AI ล็อกคำศัพท์แล้วแปล", text: "ชื่อตัวละครคงที่ทุกตอน แปลสดทีละย่อหน้า" },
    { icon: <BookMarked size={18} />, title: "อ่านต่อบนชั้นหนังสือ", text: "จัดเป็นเรื่อง เรียงตอน จำตำแหน่งที่อ่านค้าง" },
  ];
  return (
    <section className="mx-auto max-w-[1180px] px-4 pb-14 sm:px-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {steps.map((s, i) => (
          <div key={s.title} className="rise gilded rounded-2xl bg-[var(--bg-elev)]/70 p-5" style={{ animationDelay: `${300 + i * 80}ms` }}>
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">{s.icon}</span>
            <p className="mt-3 font-serif text-[16px] font-semibold">
              <span className="mr-1.5 font-display text-[var(--accent)]">{i + 1}.</span>
              {s.title}
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--fg-muted)]">{s.text}</p>
          </div>
        ))}
      </div>
      <button
        onClick={onStudio}
        className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-dashed border-[var(--accent-line)] px-5 py-4 text-left text-[13.5px] text-[var(--fg-muted)] transition-colors hover:bg-[var(--accent-soft)]"
      >
        <Wand2 size={17} className="text-[var(--magic)]" />
        <span className="flex-1">หรือยังไม่มีเรื่องในใจ? ให้ AI แต่งนิยายเรื่องใหม่ให้คุณในสตูดิโอ</span>
        <ArrowRight size={15} />
      </button>
    </section>
  );
}

function StudioInvite({ onStudio }: { onStudio: () => void }) {
  const faces = AUTHOR_STYLES.filter((s) => s.id !== "custom").slice(0, 6);
  return (
    <section className="mx-auto w-full max-w-[1180px] px-4 pb-14 sm:px-6">
      <div className="gilded relative overflow-hidden rounded-[28px] bg-[linear-gradient(120deg,color-mix(in_oklab,var(--magic)_16%,var(--bg-elev)),var(--bg-elev)_60%)] p-6 sm:p-9">
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--magic)_40%,transparent),transparent_70%)] blur-2xl" />
        <div className="relative grid items-center gap-6 md:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-[var(--magic)]">
              <Feather size={13} /> Writing Studio
            </p>
            <h2 className="mt-2 text-balance font-serif text-[26px] font-bold leading-tight sm:text-[32px]">
              มีพล็อตในหัว? ให้ AI แต่งเป็นนิยายทั้งเรื่อง
            </h2>
            <p className="mt-3 max-w-[480px] text-[14px] leading-relaxed text-[var(--fg-muted)]">
              ใส่เรื่องย่อ คำโปรย แท็ก จำนวนตอน และความยาวต่อตอน เลือกสำนวนแบบนักเขียนเว็บนิยายระดับโลก
              แล้ว AI จะวางโครงเรื่องทั้งเล่มให้คุณตรวจแก้ก่อนลงมือเขียนทีละตอน
            </p>
            <button
              onClick={onStudio}
              className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-[var(--btn)] px-5 text-[14px] font-semibold text-[var(--btn-fg)] transition hover:bg-[var(--btn-hover)]"
            >
              เปิดสตูดิโอ <ArrowRight size={15} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {faces.map((f) => (
              <div
                key={f.id}
                className="rounded-xl border border-[var(--line)] bg-[var(--bg)]/60 px-3 py-2.5"
                style={{ boxShadow: `inset 3px 0 0 hsl(${f.hue} 70% 60%)` }}
              >
                <p className="truncate text-[12.5px] font-semibold">{f.label}</p>
                <p className="truncate text-[11px] text-[var(--fg-dim)]">{f.works}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
