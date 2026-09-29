"use client";

import { useState } from "react";
import {
  BookOpen,
  Check,
  Cloud,
  CloudOff,
  Loader2,
  LogOut,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { ChapterMeta } from "@/lib/types";
import { useSettings, type ReaderPrefs, type ThemeName } from "@/lib/store";
import { cn, formatRelative, hostOf } from "@/lib/utils";
import {
  cloudSnapshot,
  pullChapters,
  pushAllLocal,
  signOutCloud,
  type CloudStatus,
} from "@/lib/repo";
import { useCloudState } from "@/lib/useCloud";
import { Button, Field, Segmented, Sheet, Slider, Switch } from "./ui";

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
  chapters: ChapterMeta[];
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
      description={`${chapters.length} ตอน เรียงตามที่อัปเดตล่าสุด`}
    >
      <div className="space-y-2">
        <Button
          variant="ghost"
          size="sm"
          className="mb-1 w-full"
          onClick={refresh}
          disabled={refreshing || cloudSnapshot().status === "disabled"}
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
          chapters.slice(0, 200).map((c) => (
            <div
              key={c.id}
              className={cn(
                "group flex items-start gap-3 rounded-xl border p-3 transition-all",
                c.id === currentId
                  ? "border-[var(--accent-line)] bg-[var(--accent-soft)]"
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
                className="shrink-0 rounded-lg p-1.5 text-[var(--fg-dim)] transition-all hover:bg-[color-mix(in_oklab,var(--danger)_12%,transparent)] hover:text-[var(--danger)] focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
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

export { useCloudState } from "@/lib/useCloud";

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
  const localOnly = status === "disabled";

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
              {localOnly ? "ผู้อ่านในเครื่องนี้" : (username ?? "ยังไม่ได้เข้าสู่ระบบ")}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-[var(--fg-dim)]">
              {status === "ready" ? (
                <Cloud size={12} className="text-[var(--success)]" />
              ) : (
                <CloudOff size={12} />
              )}
              {STATUS_TEXT[status]}
            </p>
          </div>
        </div>

        {localOnly ? null : (
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
        )}

        <div className="rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3.5">
          <p className="flex items-center gap-2 text-[13px] font-medium">
            <Check size={14} className="text-[var(--success)]" /> API Key ไม่ถูกส่งขึ้นคลาวด์
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
