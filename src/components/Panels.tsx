"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  Check,
  Cloud,
  CloudOff,
  Loader2,
  LogOut,
  Plus,
  Search,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import type { Chapter, GlossaryEntry } from "@/lib/types";
import { useSettings, type ReaderPrefs, type ThemeName } from "@/lib/store";
import { cn, formatRelative, hostOf } from "@/lib/utils";
import {
  cloudSnapshot,
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

        <Field label="ฟอนต์" hint="แต่ละปุ่มแสดงด้วยฟอนต์จริงของตัวเอง">
          <Segmented<ReaderPrefs["fontFamily"]>
            value={reader.fontFamily}
            onChange={(v) => set("fontFamily", v)}
            options={[
              {
                value: "sans",
                label: <span className="font-sans">ไม่มีหัว</span>,
                title: "IBM Plex Sans Thai",
              },
              {
                value: "loop",
                label: <span className="font-loop">มีหัว</span>,
                title: "Sarabun",
              },
              {
                value: "serif",
                label: <span className="font-serif">มีเชิง</span>,
                title: "Noto Serif Thai",
              },
              {
                value: "modern",
                label: <span className="font-modern">โมเดิร์น</span>,
                title: "Kanit",
              },
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
          label="ระยะห่างระหว่างย่อหน้า"
          min={0}
          max={4}
          step={0.05}
          value={reader.paragraphGap}
          onChange={(v) => set("paragraphGap", v)}
          display={
            reader.paragraphGap >= 1.8
              ? `${reader.paragraphGap.toFixed(2)}em · เว้นบรรทัด`
              : `${reader.paragraphGap.toFixed(2)}em`
          }
        />
        <Slider
          label="เว้นวรรคหน้าย่อหน้า"
          min={0}
          max={5}
          step={0.5}
          value={reader.indent}
          onChange={(v) => set("indent", v)}
          display={reader.indent === 0 ? "ไม่เว้น" : `${reader.indent} ตัวอักษร`}
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
  seriesName,
  onChange,
  onRetranslate,
}: {
  open: boolean;
  onClose: () => void;
  glossary: GlossaryEntry[];
  seriesName: string | null;
  onChange: (next: GlossaryEntry[]) => void;
  onRetranslate: () => void;
}) {
  const [dirty, setDirty] = useState(false);
  const [query, setQuery] = useState("");

  // Rows keep the index they hold in the real glossary, so editing a filtered
  // row still writes to the right entry.
  const needle = query.trim().toLowerCase();
  const rows = glossary
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) =>
      needle
        ? `${entry.source} ${entry.target} ${entry.note ?? ""}`
            .toLowerCase()
            .includes(needle)
        : true,
    );

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
    setQuery("");
    setDirty(true);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="คลังคำศัพท์ของเรื่องนี้"
      description="ใช้ร่วมกันทุกตอนของนิยายเรื่องเดียวกัน — ชื่อตัวละคร สถานที่ ท่าไม้ตาย จะถูกแปลเหมือนเดิมเสมอ"
    >
      <div className="space-y-3">
        {seriesName ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5">
            <BookOpen size={15} className="shrink-0 text-[var(--accent)]" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-medium">
                {seriesName}
              </span>
              <span className="text-[11.5px] text-[var(--fg-dim)]">
                {glossary.length} คำที่ล็อกไว้ทั้งเรื่อง
              </span>
            </span>
          </div>
        ) : null}

        {glossary.length > 0 ? (
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-dim)]"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาคำศัพท์ที่จะแก้ไข…"
              spellCheck={false}
              className="h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] pl-9 pr-9 text-[13.5px] outline-none transition-colors placeholder:text-[var(--fg-dim)] focus:border-[var(--accent)]"
            />
            {query ? (
              <button
                onClick={() => setQuery("")}
                aria-label="ล้างคำค้น"
                className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-[var(--fg-dim)] transition-colors hover:bg-[var(--bg-elev-2)] hover:text-[var(--fg)]"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
        ) : null}

        {needle ? (
          <p className="px-1 text-[12px] text-[var(--fg-dim)]">
            พบ {rows.length} จาก {glossary.length} คำ
          </p>
        ) : null}

        {glossary.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--line)] px-4 py-8 text-center text-[13px] text-[var(--fg-dim)]">
            ยังไม่มีคำศัพท์ — ระบบจะดึงให้อัตโนมัติเมื่อเริ่มแปล
            และจะสะสมเพิ่มขึ้นเรื่อย ๆ ทุกตอนที่แปล
          </p>
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--line)] px-4 py-8 text-center text-[13px] text-[var(--fg-dim)]">
            ไม่พบคำที่ตรงกับ “{query.trim()}”
          </p>
        ) : (
          rows.map(({ entry: g, index: i }) => (
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
            <RefreshCw size={15} /> แปลตอนนี้ใหม่ด้วยคำศัพท์ชุดนี้
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
  signedOut: "ยังไม่ได้เข้าสู่ระบบ",
  ready: "ซิงก์ขึ้นคลาวด์แล้ว",
  offline: "ออฟไลน์ — จะซิงก์ให้เมื่อกลับมาออนไลน์",
  error: "เชื่อมต่อคลาวด์ไม่ได้",
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
  onSignedOut,
}: {
  open: boolean;
  onClose: () => void;
  onNotify: (message: string, tone?: "info" | "error" | "success") => void;
  onSignedOut: () => void;
}) {
  const { status, username } = useCloudState();
  const [working, setWorking] = useState(false);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="บัญชีของฉัน"
      description="งานแปลของแต่ละบัญชีแยกกันคนละชั้น และซิงก์ขึ้นคลาวด์เพื่ออ่านต่อจากอุปกรณ์อื่น"
    >
      <div className="space-y-6">
        <div className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-[16px] font-semibold uppercase text-[var(--accent)]">
            {username ? username.slice(0, 1) : "?"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold">
              {username ?? "ยังไม่ได้เข้าสู่ระบบ"}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-[var(--fg-dim)]">
              {status === "ready" ? (
                <Cloud size={12} className="text-emerald-400" />
              ) : (
                <CloudOff size={12} />
              )}
              {STATUS_TEXT[status]}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Button
            variant="outline"
            className="w-full"
            disabled={status !== "ready" || working}
            onClick={async () => {
              setWorking(true);
              const n = await pushAllLocal();
              setWorking(false);
              onNotify(
                n ? `อัปโหลดขึ้นคลาวด์แล้ว ${n} ตอน` : "ไม่มีอะไรต้องอัปโหลด",
                "success",
              );
            }}
          >
            {working ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Cloud size={15} />
            )}
            อัปโหลดทุกตอนในเครื่องขึ้นคลาวด์
          </Button>

          <Button
            variant="ghost"
            className="w-full"
            onClick={async () => {
              await signOutCloud();
              onClose();
              onSignedOut();
              onNotify("ออกจากระบบแล้ว");
            }}
          >
            <LogOut size={15} /> ออกจากระบบ
          </Button>
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
