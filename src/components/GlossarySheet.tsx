"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  ClipboardCopy,
  FileInput,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { glossaryToText, mergeGlossary, parseGlossaryText } from "@/lib/glossary";
import type { GlossaryEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button, Sheet } from "./ui";

const PAGE = 80;

/** Inputs at 16px on phones: anything smaller makes iOS zoom the page on focus. */
const field =
  "h-11 w-full min-w-0 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 text-base outline-none " +
  "transition-colors placeholder:text-[var(--fg-dim)] focus:border-[var(--accent)] sm:text-[14px]";

/* ---------------------------------- a row --------------------------------- */

function TermRow({
  entry,
  editing,
  onEdit,
  onDone,
  onChange,
  onRemove,
}: {
  entry: GlossaryEntry;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
  onChange: (patch: Partial<GlossaryEntry>) => void;
  onRemove: () => void;
}) {
  if (!editing) {
    return (
      <li className="[content-visibility:auto] [contain-intrinsic-size:auto_56px]">
        <button
          onClick={onEdit}
          className="flex min-h-14 w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-[var(--bg-elev-2)] active:bg-[var(--bg-elev-2)]"
        >
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="break-words text-[14px] text-[var(--fg-muted)]">
                {entry.source || <em className="text-[var(--fg-dim)]">ต้นฉบับ</em>}
              </span>
              <span className="text-[12px] text-[var(--fg-dim)]">→</span>
              <span className="break-words text-[15px] font-semibold">
                {entry.target || <em className="font-normal text-[var(--fg-dim)]">คำแปล</em>}
              </span>
            </span>
            {entry.note ? (
              <span className="mt-0.5 block text-[12px] text-[var(--fg-dim)]">{entry.note}</span>
            ) : null}
          </span>
        </button>
      </li>
    );
  }

  return (
    <li className="bg-[var(--accent-soft)] px-3.5 py-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          value={entry.source}
          onChange={(e) => onChange({ source: e.target.value })}
          placeholder="ต้นฉบับ"
          aria-label="ต้นฉบับ"
          autoFocus
          className={field}
          enterKeyHint="next"
        />
        <input
          value={entry.target}
          onChange={(e) => onChange({ target: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && onDone()}
          placeholder="คำแปล"
          aria-label="คำแปล"
          className={field}
          enterKeyHint="done"
        />
      </div>
      <input
        value={entry.note ?? ""}
        onChange={(e) => onChange({ note: e.target.value })}
        onKeyDown={(e) => e.key === "Enter" && onDone()}
        placeholder="หมายเหตุ เช่น ชาย ตัวเอก (ไม่บังคับ)"
        aria-label="หมายเหตุ"
        className={cn(field, "mt-2")}
        enterKeyHint="done"
      />
      <div className="mt-2 flex gap-2">
        <Button variant="danger" className="h-11" onClick={onRemove}>
          <Trash2 size={15} /> ลบ
        </Button>
        <Button variant="primary" className="h-11 flex-1" onClick={onDone}>
          <Check size={15} /> เสร็จ
        </Button>
      </div>
    </li>
  );
}

/* ---------------------------------- sheet --------------------------------- */

export function GlossarySheet({
  open,
  onClose,
  glossary,
  seriesName,
  onChange,
  onRetranslate,
  onNotify,
}: {
  open: boolean;
  onClose: () => void;
  glossary: GlossaryEntry[];
  seriesName: string | null;
  onChange: (next: GlossaryEntry[]) => void;
  /** omitted when there is no open chapter to re-translate */
  onRetranslate?: () => void;
  onNotify?: (message: string, tone?: "info" | "error" | "success") => void;
}) {
  const [dirty, setDirty] = useState(false);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [editing, setEditing] = useState<number | null>(null);
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [importing, setImporting] = useState(false);
  const [bulk, setBulk] = useState("");
  const sourceRef = useRef<HTMLInputElement>(null);
  const targetRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setEditing(null);
      setQuery("");
      setLimit(PAGE);
      setImporting(false);
    }
  }, [open]);

  const commit = (next: GlossaryEntry[]) => {
    onChange(next);
    setDirty(true);
  };

  // Newest first, so a term just added is right where the reader is looking.
  // Rows keep their index in the real glossary so edits land on the right one.
  const needle = query.trim().toLowerCase();
  const rows = useMemo(() => {
    const all = glossary.map((entry, index) => ({ entry, index })).reverse();
    return needle
      ? all.filter(({ entry }) =>
          `${entry.source} ${entry.target} ${entry.note ?? ""}`.toLowerCase().includes(needle),
        )
      : all;
  }, [glossary, needle]);

  const existing = useMemo(() => {
    const key = source.trim().toLowerCase();
    if (!key) return -1;
    return glossary.findIndex((g) => g.source.trim().toLowerCase() === key);
  }, [glossary, source]);

  const add = () => {
    const s = source.trim();
    const t = target.trim();
    if (!s || !t) {
      (s ? targetRef : sourceRef).current?.focus();
      return;
    }
    if (existing >= 0) {
      commit(glossary.map((g, i) => (i === existing ? { ...g, target: t } : g)));
      onNotify?.(`อัปเดตคำแปลของ “${s}” แล้ว`, "success");
    } else {
      commit([...glossary, { source: s, target: t, note: "" }]);
    }
    setSource("");
    setTarget("");
    setQuery("");
    setEditing(null);
    sourceRef.current?.focus();
  };

  const runImport = () => {
    const parsed = parseGlossaryText(bulk);
    if (!parsed.length) {
      onNotify?.("ไม่พบคำในรูปแบบ “ต้นฉบับ = คำแปล”", "error");
      return;
    }
    const merged = mergeGlossary(glossary, parsed);
    const added = merged.length - glossary.length;
    commit(merged);
    setBulk("");
    setImporting(false);
    onNotify?.(
      added > 0
        ? `นำเข้า ${added} คำใหม่${parsed.length > added ? ` (ข้ามคำซ้ำ ${parsed.length - added})` : ""}`
        : "ทุกคำมีอยู่แล้ว",
      "success",
    );
  };

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(glossaryToText(glossary));
      onNotify?.(`คัดลอก ${glossary.length} คำแล้ว`, "success");
    } catch {
      onNotify?.("คัดลอกไม่สำเร็จ", "error");
    }
  };

  const header = (
    <div className="space-y-2.5">
      {seriesName ? (
        <div className="flex items-center gap-2 text-[12.5px] text-[var(--fg-dim)]">
          <BookOpen size={13} className="shrink-0 text-[var(--accent)]" />
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium text-[var(--fg-muted)]">{seriesName}</span> ·{" "}
            {glossary.length.toLocaleString()} คำ
          </span>
          <button
            onClick={() => setImporting((v) => !v)}
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-lg px-2 font-medium transition-colors",
              importing ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "hover:bg-[var(--bg-elev-2)]",
            )}
          >
            <FileInput size={13} /> นำเข้า
          </button>
          {glossary.length ? (
            <button
              onClick={copyAll}
              className="inline-flex h-8 items-center gap-1 rounded-lg px-2 font-medium transition-colors hover:bg-[var(--bg-elev-2)]"
            >
              <ClipboardCopy size={13} /> คัดลอก
            </button>
          ) : null}
        </div>
      ) : null}

      {importing ? (
        <div className="space-y-2">
          <textarea
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            rows={5}
            autoFocus
            placeholder={"วางหลายคำ บรรทัดละคำ เช่น\nSunny = ซันนี่ | ชาย ตัวเอก\nNephis → เนฟิส\nSpell\tคาถา"}
            className="w-full resize-y rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 font-mono text-base leading-relaxed outline-none focus:border-[var(--accent)] sm:text-[13px]"
          />
          <div className="flex gap-2">
            <Button variant="ghost" className="h-11 flex-1" onClick={() => setImporting(false)}>
              ยกเลิก
            </Button>
            <Button variant="primary" className="h-11 flex-[2]" onClick={runImport} disabled={!bulk.trim()}>
              นำเข้า {parseGlossaryText(bulk).length || ""} คำ
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* quick add — stays put while the list scrolls underneath */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
            className="flex gap-2"
          >
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
              <input
                ref={sourceRef}
                value={source}
                onChange={(e) => setSource(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (source.trim() && !target.trim()) targetRef.current?.focus();
                    else add();
                  }
                }}
                placeholder="ต้นฉบับ"
                aria-label="คำต้นฉบับใหม่"
                autoComplete="off"
                autoCapitalize="off"
                enterKeyHint="next"
                className={field}
              />
              <input
                ref={targetRef}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    add();
                  }
                }}
                placeholder="คำแปล"
                aria-label="คำแปลใหม่"
                autoComplete="off"
                enterKeyHint="done"
                className={field}
              />
            </div>
            <button
              type="submit"
              aria-label="เพิ่มคำศัพท์"
              disabled={!source.trim() || !target.trim()}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--accent-strong)] text-[var(--accent-ink)] transition-opacity disabled:opacity-35"
            >
              {existing >= 0 ? <Check size={18} /> : <Plus size={19} />}
            </button>
          </form>
          {existing >= 0 ? (
            <p className="-mt-1 px-1 text-[12px] text-[var(--accent)]">
              มีคำนี้อยู่แล้ว: “{glossary[existing].target}” — กดปุ่มเพื่อแทนที่
            </p>
          ) : null}

          {glossary.length > 8 ? (
            <div className="relative">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-dim)]"
              />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(PAGE);
                  setEditing(null);
                }}
                type="search"
                placeholder="ค้นหาคำศัพท์…"
                spellCheck={false}
                className={cn(field, "h-10 pl-9 pr-9")}
              />
              {query ? (
                <button
                  onClick={() => setQuery("")}
                  aria-label="ล้างคำค้น"
                  className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-[var(--fg-dim)] hover:text-[var(--fg)]"
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );

  const footer =
    dirty && onRetranslate ? (
      <Button
        variant="primary"
        size="lg"
        className="w-full"
        onClick={() => {
          setDirty(false);
          onClose();
          onRetranslate();
        }}
      >
        <RefreshCw size={15} /> แปลตอนที่เปิดอยู่ใหม่ด้วยคำศัพท์ชุดนี้
      </Button>
    ) : undefined;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="คลังคำศัพท์"
      description="ใช้ร่วมกันทุกตอนของเรื่องนี้ ไม่จำกัดจำนวนคำ — ชื่อตัวละคร สถานที่ ท่าไม้ตาย จะถูกแปลเหมือนเดิมเสมอ"
      header={header}
      footer={footer}
    >
      <div className="-mx-4 -my-5 sm:-mx-5">
        {needle ? (
          <p className="px-4 pt-3 text-[12px] text-[var(--fg-dim)]">
            พบ {rows.length.toLocaleString()} จาก {glossary.length.toLocaleString()} คำ
          </p>
        ) : null}

        {glossary.length === 0 ? (
          <p className="m-4 rounded-xl border border-dashed border-[var(--line)] px-4 py-10 text-center text-[13px] leading-relaxed text-[var(--fg-dim)]">
            ยังไม่มีคำศัพท์ — ระบบจะดึงให้อัตโนมัติเมื่อเริ่มแปล
            <br />
            หรือพิมพ์เพิ่มเองด้านบนได้เลย
          </p>
        ) : rows.length === 0 ? (
          <p className="m-4 rounded-xl border border-dashed border-[var(--line)] px-4 py-10 text-center text-[13px] text-[var(--fg-dim)]">
            ไม่พบคำที่ตรงกับ “{query.trim()}”
          </p>
        ) : (
          <ul className="divide-y divide-[var(--line-soft)]">
            {rows.slice(0, limit).map(({ entry, index }) => (
              <TermRow
                key={index}
                entry={entry}
                editing={editing === index}
                onEdit={() => setEditing(index)}
                onDone={() => setEditing(null)}
                onChange={(patch) =>
                  commit(glossary.map((g, i) => (i === index ? { ...g, ...patch } : g)))
                }
                onRemove={() => {
                  commit(glossary.filter((_, i) => i !== index));
                  setEditing(null);
                }}
              />
            ))}
          </ul>
        )}

        {rows.length > limit ? (
          <div className="p-4">
            <Button variant="outline" className="h-11 w-full" onClick={() => setLimit((l) => l + PAGE)}>
              แสดงเพิ่ม ({(rows.length - limit).toLocaleString()} คำที่เหลือ)
            </Button>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
