"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ArrowRight, ClipboardPaste, FileUp, Languages, Library, Link2, Loader2, Settings2, Type } from "lucide-react";
import { TARGET_LANGUAGES, providerMeta } from "@/lib/models";
import { useSettings } from "@/lib/store";
import { cn, isProbablyUrl } from "@/lib/utils";
import { ShelfPicker, type ShelfOption } from "./ShelfPicker";
import { Button } from "./ui";

export interface ComposerHandle {
  focus: () => void;
}

/** The translate box: a link, a pasted chapter, or a PDF. */
export const Composer = forwardRef<
  ComposerHandle,
  {
    busy: boolean;
    busyLabel: string;
    onSubmit: (input: string, kind: "url" | "text") => void;
    onOpenSettings: () => void;
    shelves: ShelfOption[];
    /** empty string means the shelf is derived from the link */
    shelfId: string;
    onShelfChange: (id: string) => void;
    onImportPdf: () => void;
  }
>(function Composer({ busy, busyLabel, onSubmit, onOpenSettings, shelves, shelfId, onShelfChange, onImportPdf }, ref) {
  const [value, setValue] = useState("");
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const { config, style, setStyle } = useSettings();
  const [pickingShelf, setPickingShelf] = useState(false);
  const [focused, setFocused] = useState(false);

  useImperativeHandle(ref, () => ({
    focus: () => {
      areaRef.current?.focus({ preventScroll: true });
    },
  }));

  const trimmed = value.trim();
  const kind: "url" | "text" = isProbablyUrl(trimmed) ? "url" : "text";
  const ready = kind === "url" ? trimmed.length > 4 : trimmed.length > 40;

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [value]);

  const submit = () => {
    if (!ready || busy) return;
    onSubmit(trimmed, kind);
    // The job runs in the background from here, so clear the box for the next one.
    setValue("");
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setValue(text);
        areaRef.current?.focus();
      }
    } catch {
      areaRef.current?.focus();
    }
  };

  const meta = providerMeta(config.provider);
  const modelLabel = meta.models.find((m) => m.id === config.model)?.label ?? config.model;
  const shelf = shelves.find((s) => s.series.id === shelfId) ?? null;

  return (
    <div id="translate" className="scroll-mt-24">
      <div
        className={cn(
          "gilded rounded-[26px] bg-[var(--bg-elev)]/75 p-2 shadow-[0_30px_70px_-30px_rgba(0,0,0,.7)] backdrop-blur-xl transition-shadow duration-300",
          focused && "shadow-[0_30px_70px_-30px_rgba(0,0,0,.7),0_0_0_4px_var(--accent-soft)]",
        )}
      >
        <div className="rounded-[20px] bg-[var(--bg)]/85 p-3.5">
          <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-[var(--fg-dim)]">
            {trimmed.length === 0 ? (
              <>
                <Type size={13} /> วางลิงก์ตอนนิยาย หรือเนื้อหาทั้งตอน
              </>
            ) : kind === "url" ? (
              <>
                <Link2 size={13} className="text-[var(--accent)]" />
                <span className="text-[var(--accent)]">ตรวจพบลิงก์ — ระบบจะดึงเนื้อหาให้</span>
              </>
            ) : (
              <>
                <Type size={13} />
                {trimmed.length.toLocaleString()} ตัวอักษร
              </>
            )}
          </div>

          <textarea
            ref={areaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
              if (e.key === "Enter" && kind === "url" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            spellCheck={false}
            aria-label="ลิงก์หรือเนื้อหาที่จะแปล"
            placeholder="https://example.com/novel/chapter-1"
            className="min-h-[28px] w-full resize-none bg-transparent text-base leading-relaxed outline-none placeholder:text-[var(--fg-dim)] sm:text-[15px]"
            enterKeyHint={kind === "url" ? "go" : "enter"}
          />

          <div className="mt-3 flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={pasteFromClipboard} className="shrink-0" aria-label="วางจากคลิปบอร์ด">
              <ClipboardPaste size={14} />
              <span className="hidden sm:inline">วาง</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={onImportPdf} className="shrink-0">
              <FileUp size={14} /> PDF
            </Button>
            <div className="flex-1" />
            <Button variant="accent-solid" size="md" onClick={submit} disabled={!ready || busy} className="min-w-[124px]">
              {busy ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  {busyLabel}
                </>
              ) : (
                <>
                  แปลเลย <ArrowRight size={15} />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-0.5 rounded-full border border-[var(--line)] bg-[var(--bg-elev)]/80 p-1">
          <Languages size={13} className="ml-2 mr-1 text-[var(--fg-dim)]" />
          {TARGET_LANGUAGES.slice(0, 3).map((l) => (
            <button
              key={l.code}
              onClick={() => setStyle({ targetLanguage: l.code })}
              aria-pressed={style.targetLanguage === l.code}
              className={cn(
                "rounded-full px-2.5 py-1 text-[12.5px] transition-colors",
                style.targetLanguage === l.code
                  ? "bg-[var(--accent-soft)] font-medium text-[var(--accent)]"
                  : "text-[var(--fg-dim)] hover:text-[var(--fg)]",
              )}
            >
              {l.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setPickingShelf(true)}
          className={cn(
            "flex items-center gap-2 rounded-full border px-3.5 py-2 text-[12.5px] transition-colors",
            shelf
              ? "border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent)]"
              : "border-[var(--line)] bg-[var(--bg-elev)]/70 text-[var(--fg-muted)] hover:text-[var(--fg)]",
          )}
        >
          <Library size={13} />
          <span className="max-w-[170px] truncate">{shelf ? shelf.series.name : "จัดเข้าชั้นอัตโนมัติ"}</span>
          {shelf && shelf.series.glossary.length > 0 ? (
            <span className="rounded-md bg-[var(--accent)]/15 px-1.5 py-0.5 text-[10.5px] font-semibold">
              {shelf.series.glossary.length} คำ
            </span>
          ) : null}
        </button>

        <button
          onClick={onOpenSettings}
          className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--bg-elev)]/80 px-3.5 py-2 text-[12.5px] text-[var(--fg-muted)] transition-colors hover:text-[var(--fg)]"
        >
          <Settings2 size={13} />
          {modelLabel}
          {!config.apiKey ? (
            <span className="ml-0.5 rounded-md bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10.5px] font-semibold text-[var(--accent)]">
              ต้องใส่คีย์
            </span>
          ) : null}
        </button>
      </div>

      <ShelfPicker
        open={pickingShelf}
        onClose={() => setPickingShelf(false)}
        options={shelves}
        selectedId={shelfId}
        onSelect={onShelfChange}
      />
    </div>
  );
});
