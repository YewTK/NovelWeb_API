"use client";

import { useEffect, useMemo, useState } from "react";
import { BookText, Clock3, Coins, Hash, Loader2, Plus, ScrollText, Wand2, X } from "lucide-react";
import { TAG_SUGGESTIONS, authorStyle } from "@/lib/authors";
import { estimateWriting, formatUsd, type WritingEstimate } from "@/lib/cost";
import { useSettings } from "@/lib/store";
import type { Pov, WritingProject } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MAX_CHAPTERS, OUTLINE_BATCH, blankProject } from "@/lib/writer";
import { Button, Field, Segmented, Slider, inputClass } from "../ui";
import { StyleCards } from "./StyleCards";

const DRAFT_KEY = "novelflow.studioDraft";

const LENGTHS = [
  { words: 1200, label: "สั้น" },
  { words: 2200, label: "มาตรฐาน" },
  { words: 3500, label: "ยาว" },
  { words: 5000, label: "จัดเต็ม" },
];

const COUNTS = [30, 100, 300, 1000, 2000, 4000];

function clampCount(n: number): number {
  return Math.max(1, Math.min(MAX_CHAPTERS, Math.round(Number.isFinite(n) ? n : 1)));
}

/* The count slider is logarithmic, so both 10 and 4,000 chapters are easy to hit. */
function sliderToCount(v: number): number {
  const raw = Math.exp((v / 1000) * Math.log(MAX_CHAPTERS));
  const step = raw < 100 ? 1 : raw < 1000 ? 10 : 50;
  return clampCount(Math.round(raw / step) * step);
}

function countToSlider(n: number): number {
  return Math.round((Math.log(Math.max(1, n)) / Math.log(MAX_CHAPTERS)) * 1000);
}

function formatWords(words: number): string {
  if (words >= 1_000_000) return `~${(words / 1_000_000).toFixed(1)}M`;
  return `~${(words / 1000).toFixed(words < 10000 ? 1 : 0)}K`;
}

function formatMinutes(m: number): string {
  if (m < 60) return `${m} นาที`;
  if (m < 60 * 48) return `${(m / 60).toFixed(1)} ชม.`;
  return `${Math.round(m / 60 / 24)} วัน`;
}

export interface NewProjectDraft {
  title: string;
  project: WritingProject;
}

function loadDraft(): NewProjectDraft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as NewProjectDraft;
      return { title: saved.title ?? "", project: { ...blankProject(), ...saved.project, outline: null, chapterIds: {} } };
    }
  } catch {
    /* no storage, or an old shape: start fresh */
  }
  return { title: "", project: blankProject() };
}

export function clearStudioDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export function NewProject({
  busy,
  onCreate,
}: {
  /** a plan or a chapter is being written right now */
  busy: boolean;
  onCreate: (draft: NewProjectDraft) => void;
}) {
  const [draft, setDraft] = useState<NewProjectDraft>(() => ({ title: "", project: blankProject() }));
  const [tagDraft, setTagDraft] = useState("");
  const [touched, setTouched] = useState(false);
  const config = useSettings((s) => s.config);

  // Restored after mount: the server render has no storage to read.
  useEffect(() => setDraft(loadDraft()), []);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {
        /* private mode */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [draft]);

  const p = draft.project;
  const patch = (next: Partial<WritingProject>) => setDraft((d) => ({ ...d, project: { ...d.project, ...next } }));
  const style = authorStyle(p.styleId);
  const firstBatch = Math.min(OUTLINE_BATCH, p.chapterCount);
  const opening = useMemo(
    () => estimateWriting(p, config, { write: 0, plan: firstBatch, bible: true }),
    [p, config, firstBatch],
  );
  const perTen = useMemo(
    () => estimateWriting(p, config, { write: Math.min(10, p.chapterCount), plan: Math.min(10, p.chapterCount) }),
    [p, config],
  );
  const whole = useMemo(
    () => estimateWriting(p, config, { write: p.chapterCount, plan: p.chapterCount, bible: true }),
    [p, config],
  );

  const addTag = (raw: string) => {
    const tag = raw.trim().replace(/^#/, "");
    if (!tag || p.tags.includes(tag) || p.tags.length >= 12) return;
    patch({ tags: [...p.tags, tag] });
    setTagDraft("");
  };

  const suggestions = [...new Set([...style.tags, ...TAG_SUGGESTIONS])].filter((t) => !p.tags.includes(t)).slice(0, 14);

  const problems: string[] = [];
  if (p.synopsis.trim().length < 30) problems.push("เขียนเรื่องย่ออย่างน้อยสักสองสามประโยค (30 ตัวอักษรขึ้นไป)");
  if (p.styleId === "custom" && p.styleNotes.trim().length < 10) problems.push("สไตล์กำหนดเองต้องอธิบายน้ำเสียงที่ต้องการในช่องโน้ต");

  const submit = () => {
    setTouched(true);
    if (problems.length || busy) return;
    onCreate({ title: draft.title.trim(), project: { ...p, createdAt: Date.now(), outline: null, chapterIds: {} } });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <Card step="1" title="เรื่องของคุณ" icon={<BookText size={16} />}>
          <div className="space-y-4">
            <Field label="ชื่อเรื่อง" hint="เว้นว่างไว้ได้ — AI จะตั้งชื่อให้ตอนวางโครงเรื่อง">
              <input
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                placeholder="เช่น ผู้พิทักษ์แห่งเงาจันทร์"
                className={cn(inputClass, "h-11 font-serif text-[15px]")}
              />
            </Field>
            <Field label="คำโปรย" hint="ประโยคเด็ดหลังปก ที่ทำให้คนอยากเปิดอ่าน">
              <textarea
                value={p.blurb}
                onChange={(e) => patch({ blurb: e.target.value })}
                rows={2}
                placeholder="“เมื่อเงาของเขาเริ่มพูดได้ โลกทั้งใบก็ไม่ใช่ที่ปลอดภัยอีกต่อไป”"
                className={cn(inputClass, "resize-y leading-relaxed")}
              />
            </Field>
            <Field label="เรื่องย่อ" hint="ยิ่งละเอียด โครงเรื่องยิ่งตรงใจ — ตัวเอก โลก ความขัดแย้งหลัก จุดจบที่อยากได้">
              <textarea
                value={p.synopsis}
                onChange={(e) => patch({ synopsis: e.target.value })}
                rows={7}
                placeholder="เด็กหนุ่มกำพร้าในเมืองท่าที่ถูกหมอกกลืน ได้รับพลังควบคุมเงาหลังรอดจากพิธีบูชายัญ…"
                className={cn(
                  inputClass,
                  "resize-y leading-relaxed",
                  touched && p.synopsis.trim().length < 30 && "border-[var(--danger)]",
                )}
              />
            </Field>

            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-[var(--fg-muted)]">
                <Hash size={13} /> แท็ก <span className="text-[var(--fg-dim)]">({p.tags.length}/12)</span>
              </p>
              <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] p-2 focus-within:border-[var(--accent)]">
                {p.tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex h-7 items-center gap-1 rounded-full bg-[var(--accent-soft)] pl-2.5 pr-1 text-[12.5px] font-medium text-[var(--accent)]"
                  >
                    #{t}
                    <button
                      type="button"
                      onClick={() => patch({ tags: p.tags.filter((x) => x !== t) })}
                      aria-label={`เอา ${t} ออก`}
                      className="grid h-5 w-5 place-items-center rounded-full hover:bg-[var(--accent)]/20"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
                <input
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTag(tagDraft);
                    }
                    if (e.key === "Backspace" && !tagDraft && p.tags.length) {
                      patch({ tags: p.tags.slice(0, -1) });
                    }
                  }}
                  placeholder={p.tags.length ? "" : "พิมพ์แล้วกด Enter"}
                  className="h-7 min-w-[120px] flex-1 bg-transparent px-1.5 text-base outline-none placeholder:text-[var(--fg-dim)] sm:text-[13px]"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {suggestions.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => addTag(t)}
                    className="inline-flex h-7 items-center gap-1 rounded-full border border-[var(--line)] px-2.5 text-[12px] text-[var(--fg-muted)] transition-colors hover:border-[var(--accent-line)] hover:text-[var(--accent)]"
                  >
                    <Plus size={11} /> {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card step="2" title="สำนวนแบบนักเขียนคนไหน" icon={<ScrollText size={16} />}>
          <StyleCards value={p.styleId} onChange={(styleId) => patch({ styleId, pov: authorStyle(styleId).pov })} />
          <div className="mt-4">
            <Field
              label={p.styleId === "custom" ? "อธิบายสำนวนที่ต้องการ" : "โน้ตน้ำเสียงเพิ่มเติม (ไม่บังคับ)"}
              hint="เช่น “ขำแบบแห้ง ๆ มากขึ้น” “ตัวเอกใช้สรรพนาม ข้า” “ห้ามมีฉากโรแมนติก” “ผสมความลึกลับแบบ LOTM”"
            >
              <textarea
                value={p.styleNotes}
                onChange={(e) => patch({ styleNotes: e.target.value })}
                rows={3}
                className={cn(
                  inputClass,
                  "resize-y leading-relaxed",
                  touched && p.styleId === "custom" && p.styleNotes.trim().length < 10 && "border-[var(--danger)]",
                )}
              />
            </Field>
          </div>
        </Card>

        <Card step="3" title="ขนาดของเรื่อง" icon={<Clock3 size={16} />}>
          <div className="space-y-6">
            <div>
              <Slider
                label="จำนวนตอนทั้งเรื่อง"
                min={0}
                max={1000}
                value={countToSlider(p.chapterCount)}
                onChange={(v) => patch({ chapterCount: sliderToCount(v) })}
                display={`${p.chapterCount.toLocaleString()} ตอน`}
              />
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {COUNTS.map((n) => (
                  <Preset key={n} on={p.chapterCount === n} onClick={() => patch({ chapterCount: n })}>
                    {n.toLocaleString()}
                  </Preset>
                ))}
                <label className="ml-auto flex items-center gap-2 text-[12.5px] text-[var(--fg-muted)]">
                  ระบุเอง
                  <input
                    type="number"
                    min={1}
                    max={MAX_CHAPTERS}
                    value={p.chapterCount}
                    onChange={(e) => patch({ chapterCount: clampCount(Number(e.target.value)) })}
                    className={cn(inputClass, "h-8 w-24 py-1 text-right tabular-nums")}
                  />
                </label>
              </div>
              <p className="mt-2.5 rounded-xl bg-[var(--accent-soft)] px-3 py-2 text-[12px] leading-relaxed text-[var(--fg-muted)]">
                AI จะวาง <b className="text-[var(--fg)]">แผนภาคของทั้งเรื่อง</b> กับแผนรายตอน {Math.min(OUTLINE_BATCH, p.chapterCount)} ตอนแรกก่อน —
                ตอนที่เหลือจะถูกวางแผนทีละชุดอัตโนมัติเมื่อเขียนใกล้ถึง จึงจ่ายเฉพาะส่วนที่ใช้จริง
              </p>
            </div>
            <div>
              <Slider
                label="ความยาวต่อตอน"
                min={600}
                max={6000}
                step={100}
                value={p.wordsPerChapter}
                onChange={(wordsPerChapter) => patch({ wordsPerChapter })}
                display={`~${p.wordsPerChapter.toLocaleString()} คำ`}
              />
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {LENGTHS.map((l) => (
                  <Preset key={l.words} on={p.wordsPerChapter === l.words} onClick={() => patch({ wordsPerChapter: l.words })}>
                    {l.label} · {l.words.toLocaleString()}
                  </Preset>
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="มุมมองการเล่า">
                <Segmented<Pov>
                  value={p.pov}
                  onChange={(pov) => patch({ pov })}
                  options={[
                    { value: "first", label: "บุรุษที่ 1" },
                    { value: "third-limited", label: "บุรุษที่ 3", title: "ติดตัวเอก" },
                    { value: "third-omniscient", label: "สัพพัญญู", title: "ผู้เล่ารู้ทุกอย่าง" },
                  ]}
                />
              </Field>
              <Field label="ภาษาที่เขียน">
                <Segmented
                  value={p.language}
                  onChange={(language) => patch({ language })}
                  options={[
                    { value: "th", label: "ไทย" },
                    { value: "en", label: "English" },
                  ]}
                />
              </Field>
            </div>
            <Field
              label="คุณภาพการเขียน"
              hint="“ดีที่สุด” ให้โมเดลคิดวางฉากอย่างละเอียดก่อนเขียน สำนวนแน่นกว่าแต่ใช้ token มากกว่า"
            >
              <Segmented<"high" | "medium">
                value={p.effort ?? "high"}
                onChange={(effort) => patch({ effort })}
                options={[
                  { value: "high", label: "ดีที่สุด" },
                  { value: "medium", label: "ประหยัด" },
                ]}
              />
            </Field>
          </div>
        </Card>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="gilded rounded-3xl bg-[var(--bg-elev)]/90 p-5">
          <p className="text-[12.5px] font-semibold text-[var(--fg-dim)]">สรุปโปรเจกต์</p>
          <p className="mt-2 line-clamp-2 font-serif text-[19px] font-semibold leading-snug">
            {draft.title.trim() || "ให้ AI ตั้งชื่อเรื่อง"}
          </p>
          <p className="mt-1 text-[12.5px] text-[var(--fg-muted)]">
            สำนวน {style.label} · {p.language === "th" ? "ภาษาไทย" : "English"}
          </p>

          <dl className="mt-4 grid grid-cols-2 gap-2">
            <Stat label="ตอนทั้งเรื่อง" value={p.chapterCount.toLocaleString()} />
            <Stat label="คำทั้งเรื่อง" value={formatWords(whole.words)} />
          </dl>

          <div className="mt-3 space-y-1.5 rounded-2xl border border-[var(--line)] bg-[var(--bg)]/60 p-3 text-[12.5px]">
            <CostRow label={`เริ่มต้น: โครงเรื่อง + แผน ${firstBatch} ตอน`} est={opening} />
            <CostRow label="เขียนเพิ่มทุก ๆ 10 ตอน" est={perTen} />
            <CostRow label="ถ้าเขียนจนจบทั้งเรื่อง" est={whole} muted />
          </div>
          <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--fg-dim)]">
            เป็นตัวเลขประมาณ — หลังสร้างโปรเจกต์ คุณเลือกได้ว่าจะเขียนถึงตอนที่เท่าไหร่ และหยุดได้ทุกเมื่อ
          </p>

          {touched && problems.length ? (
            <ul className="mt-4 space-y-1.5 rounded-xl border border-[color-mix(in_oklab,var(--danger)_40%,transparent)] bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] p-3 text-[12.5px] text-[var(--danger)]">
              {problems.map((m) => (
                <li key={m}>• {m}</li>
              ))}
            </ul>
          ) : null}

          <Button variant="magic" size="lg" className="mt-5 w-full" onClick={submit} disabled={busy}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
            {busy ? "มีงานเขียนค้างอยู่" : "สร้างโปรเจกต์และวางโครงเรื่อง"}
          </Button>
          <p className="mt-2 text-center text-[11.5px] text-[var(--fg-dim)]">ขั้นต่อไป: ตรวจแก้โครงเรื่องก่อนเริ่มเขียน</p>
        </div>
      </aside>
    </div>
  );
}

function Card({ step, title, icon, children }: { step: string; title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="gilded rounded-3xl bg-[var(--bg-elev)]/85 p-5 sm:p-6">
      <h2 className="mb-5 flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] ring-1 ring-[var(--accent-line)]">
          {icon}
        </span>
        <span>
          <span className="block font-display text-[11px] font-semibold tracking-[0.2em] text-[var(--fg-dim)]">STEP {step}</span>
          <span className="block font-serif text-[17px] font-semibold leading-tight">{title}</span>
        </span>
      </h2>
      {children}
    </section>
  );
}

function Preset({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "h-8 rounded-full border px-3 text-[12.5px] transition-colors",
        on
          ? "border-[var(--accent-line)] bg-[var(--accent-soft)] font-medium text-[var(--accent)]"
          : "border-[var(--line)] text-[var(--fg-muted)] hover:text-[var(--fg)]",
      )}
    >
      {children}
    </button>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg)]/60 px-3 py-2.5">
      <dd className="font-display text-[17px] font-semibold tabular-nums">{value}</dd>
      <dt className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--fg-dim)]">
        {icon}
        {label}
      </dt>
    </div>
  );
}

function CostRow({ label, est, muted }: { label: string; est: WritingEstimate; muted?: boolean }) {
  return (
    <div className={cn("flex items-baseline gap-2", muted && "text-[var(--fg-dim)]")}>
      <span className="min-w-0 flex-1 leading-snug">{label}</span>
      <span className="shrink-0 tabular-nums text-[var(--fg-muted)]">{formatMinutes(est.minutes)}</span>
      <span className={cn("w-[72px] shrink-0 text-right font-semibold tabular-nums", !muted && "text-[var(--accent)]")}>
        {est.usd === null ? "—" : formatUsd(est.usd)}
      </span>
    </div>
  );
}
