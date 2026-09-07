"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  Check,
  Cloud,
  CloudOff,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import type { Chapter, GlossaryEntry } from "@/lib/types";
import { useSettings, type ReaderPrefs, type ThemeName } from "@/lib/store";
import { cn, formatRelative, hostOf } from "@/lib/utils";
import {
  cloudSnapshot,
  linkEmail,
  pullChapters,
  pushAllLocal,
  signOutCloud,
  subscribeCloud,
  type CloudStatus,
} from "@/lib/repo";
import { Button, Field, Segmented, Sheet, Slider, Switch, inputClass } from "./ui";

/* ------------------------------- Typography ------------------------------ */

export function TypographySheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { reader, setReader, theme, setTheme } = useSettings();

  const set = <K extends keyof ReaderPrefs>(key: K, value: ReaderPrefs[K]) =>
    setReader({ [key]: value } as Partial<ReaderPrefs>);

  return (
    <Sheet open={open} onClose={onClose} title="การแสดงผล" side="bottom">
      <div className="mx-auto max-w-[520px] space-y-6 pb-4">
        <Field label="ธีม">
          <Segmented<ThemeName>
            value={theme}
            onChange={setTheme}
            options={[
              { value: "dark", label: "มืด" },
              { value: "light", label: "สว่าง" },
              { value: "sepia", label: "กระดาษ" },
            ]}
          />
        </Field>

        <Field label="ฟอนต์">
          <Segmented<ReaderPrefs["fontFamily"]>
            value={reader.fontFamily}
            onChange={(v) => set("fontFamily", v)}
            options={[
              { value: "sans", label: "ไม่มีหัว" },
              { value: "serif", label: "มีหัว" },
            ]}
          />
        </Field>

        <Slider
          label="ขนาดตัวอักษร"
          min={15}
          max={28}
          value={reader.fontSize}
          onChange={(v) => set("fontSize", v)}
          display={`${reader.fontSize}px`}
        />
        <Slider
          label="ระยะห่างบรรทัด"
          min={1.5}
          max={2.6}
          step={0.05}
          value={reader.lineHeight}
          onChange={(v) => set("lineHeight", v)}
          display={reader.lineHeight.toFixed(2)}
        />
        <Slider
          label="ระยะห่างย่อหน้า"
          min={0.6}
          max={2.4}
          step={0.05}
          value={reader.paragraphGap}
          onChange={(v) => set("paragraphGap", v)}
          display={`${reader.paragraphGap.toFixed(2)}em`}
        />
        <Slider
          label="ความกว้างคอลัมน์"
          min={520}
          max={980}
          step={20}
          value={reader.maxWidth}
          onChange={(v) => set("maxWidth", v)}
          display={`${reader.maxWidth}px`}
        />

        <Switch
          checked={reader.showSource}
          onChange={(v) => set("showSource", v)}
          label="แสดงต้นฉบับควบคู่"
          hint="เทียบทีละย่อหน้าเพื่อตรวจงานแปล"
        />
      </div>
    </Sheet>
  );
}

/* -------------------------------- Glossary ------------------------------- */

export function GlossarySheet({
  open,
  onClose,
  glossary,
  onChange,
  onRetranslate,
}: {
  open: boolean;
  onClose: () => void;
  glossary: GlossaryEntry[];
  onChange: (next: GlossaryEntry[]) => void;
  onRetranslate: () => void;
}) {
  const [dirty, setDirty] = useState(false);

  const update = (i: number, patch: Partial<GlossaryEntry>) => {
    const next = glossary.map((g, idx) => (idx === i ? { ...g, ...patch } : g));
    onChange(next);
    setDirty(true);
  };

  const remove = (i: number) => {
    onChange(glossary.filter((_, idx) => idx !== i));
    setDirty(true);
  };

  const add = () => {
    onChange([...glossary, { source: "", target: "", note: "" }]);
    setDirty(true);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="คลังคำศัพท์ของตอนนี้"
      description="ชื่อตัวละคร สถานที่ ท่าไม้ตาย — AI จะใช้คำเหล่านี้แบบเดิมทุกครั้ง แก้แล้วกดแปลใหม่ได้"
    >
      <div className="space-y-3">
        {glossary.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--line)] px-4 py-8 text-center text-[13px] text-[var(--fg-dim)]">
            ยังไม่มีคำศัพท์ — ระบบจะดึงให้อัตโนมัติเมื่อเริ่มแปล
          </p>
        ) : (
          glossary.map((g, i) => (
            <div
              key={i}
              className="rounded-xl border border-[var(--line)] bg-[var(--bg)] p-2.5"
            >
              <div className="flex items-center gap-2">
                <input
                  value={g.source}
                  onChange={(e) => update(i, { source: e.target.value })}
                  placeholder="ต้นฉบับ"
                  className="min-w-0 flex-1 rounded-lg bg-[var(--bg-elev-2)] px-2.5 py-1.5 text-[13px] outline-none"
                />
                <span className="shrink-0 text-[var(--fg-dim)]">→</span>
                <input
                  value={g.target}
                  onChange={(e) => update(i, { target: e.target.value })}
                  placeholder="คำแปล"
                  className="min-w-0 flex-1 rounded-lg bg-[var(--bg-elev-2)] px-2.5 py-1.5 text-[13px] outline-none"
                />
                <button
                  onClick={() => remove(i)}
                  aria-label="ลบคำนี้"
                  className="shrink-0 rounded-lg p-1.5 text-[var(--fg-dim)] transition-colors hover:bg-red-500/10 hover:text-red-400"
                >
                  <X size={14} />
                </button>
              </div>
              {g.note ? (
                <p className="mt-1.5 px-1 text-[11.5px] text-[var(--fg-dim)]">
                  {g.note}
                </p>
              ) : null}
            </div>
          ))
        )}

        <Button variant="outline" className="w-full" onClick={add}>
          <Plus size={15} /> เพิ่มคำศัพท์
        </Button>

        {dirty ? (
          <Button
            variant="primary"
            className="w-full"
            onClick={() => {
              setDirty(false);
              onClose();
              onRetranslate();
            }}
          >
            <RefreshCw size={15} /> แปลใหม่ด้วยคำศัพท์ชุดนี้
          </Button>
        ) : null}
      </div>
    </Sheet>
  );
}

/* --------------------------------- Library ------------------------------- */

export function LibrarySheet({
  open,
  onClose,
  chapters,
  currentId,
  onOpenChapter,
  onDelete,
  onRefresh,
}: {
  open: boolean;
  onClose: () => void;
  chapters: Chapter[];
  currentId: string | null;
  onOpenChapter: (id: string) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
}) {
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    await pullChapters().catch(() => undefined);
    onRefresh();
    setRefreshing(false);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="ห้องสมุดของฉัน"
      description={`${chapters.length} ตอนที่แปลไว้`}
    >
      <div className="space-y-2">
        <Button
          variant="ghost"
          size="sm"
          className="mb-1 w-full"
          onClick={refresh}
          disabled={refreshing}
        >
          {refreshing ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
          ดึงข้อมูลจากคลาวด์
        </Button>

        {chapters.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--line)] px-4 py-10 text-center text-[13px] text-[var(--fg-dim)]">
            ยังไม่มีตอนที่แปล
          </p>
        ) : (
          chapters.map((c) => (
            <div
              key={c.id}
              className={cn(
                "group flex items-start gap-3 rounded-xl border p-3 transition-all",
                c.id === currentId
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                  : "border-[var(--line)] bg-[var(--bg)] hover:border-[var(--fg-dim)]",
              )}
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
                  {c.sourceUrl ? <span>· {hostOf(c.sourceUrl)}</span> : null}
                  {c.status === "translating" ? (
                    <span className="text-[var(--accent)]">
                      · แปลอยู่ {Math.round(c.progress * 100)}%
                    </span>
                  ) : null}
                </span>
              </button>
              <button
                onClick={() => onDelete(c.id)}
                aria-label="ลบตอนนี้"
                className="shrink-0 rounded-lg p-1.5 text-[var(--fg-dim)] opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </Sheet>
  );
}

/* --------------------------------- Account ------------------------------- */

const STATUS_TEXT: Record<CloudStatus, string> = {
  disabled: "ไม่ได้เชื่อมคลาวด์ — เก็บในเครื่องอย่างเดียว",
  connecting: "กำลังเชื่อมต่อ…",
  ready: "ซิงก์ขึ้นคลาวด์แล้ว",
  offline: "ออฟไลน์ — จะซิงก์ให้เมื่อกลับมาออนไลน์",
  error: "เชื่อมต่อคลาวด์ไม่ได้ (ตรวจว่าเปิด Anonymous sign-ins แล้ว)",
};

export function useCloudState() {
  const [state, setState] = useState(cloudSnapshot);
  useEffect(() => subscribeCloud(() => setState(cloudSnapshot())), []);
  return state;
}

export function AccountSheet({
  open,
  onClose,
  onNotify,
}: {
  open: boolean;
  onClose: () => void;
  onNotify: (message: string, tone?: "info" | "error" | "success") => void;
}) {
  const { status, userEmail } = useCloudState();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!email.includes("@")) return;
    setSending(true);
    try {
      await linkEmail(email.trim());
      onNotify("ส่งลิงก์เข้าสู่ระบบไปที่อีเมลแล้ว", "success");
    } catch (e) {
      onNotify(e instanceof Error ? e.message : "ส่งอีเมลไม่สำเร็จ", "error");
    }
    setSending(false);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="บัญชีและการซิงก์"
      description="งานแปลถูกเก็บในเครื่องเสมอ และซิงก์ขึ้น Supabase เพื่ออ่านต่อจากอุปกรณ์อื่น"
    >
      <div className="space-y-6">
        <div
          className={cn(
            "flex items-start gap-3 rounded-xl border p-3.5",
            status === "ready"
              ? "border-emerald-500/25 bg-emerald-500/8"
              : status === "error"
                ? "border-red-500/25 bg-red-500/8"
                : "border-[var(--line)] bg-[var(--bg)]",
          )}
        >
          {status === "ready" ? (
            <Cloud size={17} className="mt-0.5 shrink-0 text-emerald-400" />
          ) : (
            <CloudOff size={17} className="mt-0.5 shrink-0 text-[var(--fg-dim)]" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-medium">{STATUS_TEXT[status]}</p>
            {userEmail ? (
              <p className="mt-0.5 text-[12px] text-[var(--fg-dim)]">{userEmail}</p>
            ) : status === "ready" ? (
              <p className="mt-0.5 text-[12px] text-[var(--fg-dim)]">
                กำลังใช้บัญชีชั่วคราวของอุปกรณ์นี้ — ผูกอีเมลเพื่อไม่ให้ข้อมูลหาย
              </p>
            ) : null}
          </div>
        </div>

        {!userEmail && status === "ready" ? (
          <Field
            label="ผูกอีเมล"
            hint="เราจะส่งลิงก์เข้าสู่ระบบไปให้ ไม่ต้องตั้งรหัสผ่าน"
          >
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={inputClass}
              />
              <Button
                variant="primary"
                onClick={send}
                disabled={sending || !email.includes("@")}
                className="shrink-0"
              >
                {sending ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Mail size={15} />
                )}
              </Button>
            </div>
          </Field>
        ) : null}

        <div className="space-y-2">
          <Button
            variant="outline"
            className="w-full"
            onClick={async () => {
              const n = await pushAllLocal();
              onNotify(
                n ? `อัปโหลดขึ้นคลาวด์แล้ว ${n} ตอน` : "ไม่มีอะไรต้องอัปโหลด",
                "success",
              );
            }}
            disabled={status !== "ready"}
          >
            <Cloud size={15} /> อัปโหลดทุกตอนในเครื่องขึ้นคลาวด์
          </Button>

          {userEmail ? (
            <Button
              variant="ghost"
              className="w-full"
              onClick={async () => {
                await signOutCloud();
                onNotify("ออกจากระบบแล้ว");
              }}
            >
              ออกจากระบบ
            </Button>
          ) : null}
        </div>

        <div className="rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3.5">
          <p className="flex items-center gap-2 text-[13px] font-medium">
            <Check size={14} className="text-emerald-400" /> API Key ไม่ถูกส่งขึ้นคลาวด์
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--fg-dim)]">
            คีย์ของคุณอยู่ใน localStorage ของเบราว์เซอร์เท่านั้น
            เซิร์ฟเวอร์ใช้มันเพื่อส่งต่อไปยังผู้ให้บริการ AI แล้วทิ้งทันที
            ไม่มีการบันทึกลงฐานข้อมูล
          </p>
        </div>
      </div>
    </Sheet>
  );
}

export const LibraryIcon = BookOpen;
