"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ClipboardPaste,
  Languages,
  Link2,
  Loader2,
  Settings2,
  Sparkles,
  Type,
} from "lucide-react";
import { TARGET_LANGUAGES, providerMeta } from "@/lib/models";
import { useSettings } from "@/lib/store";
import { cn, isProbablyUrl } from "@/lib/utils";
import { Button } from "./ui";

export function Composer({
  busy,
  busyLabel,
  onSubmit,
  onOpenSettings,
}: {
  busy: boolean;
  busyLabel: string;
  onSubmit: (input: string, kind: "url" | "text") => void;
  onOpenSettings: () => void;
}) {
  const [value, setValue] = useState("");
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const { config, style, setStyle } = useSettings();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const trimmed = value.trim();
  const kind: "url" | "text" = isProbablyUrl(trimmed) ? "url" : "text";
  const ready = kind === "url" ? trimmed.length > 4 : trimmed.length > 40;

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 260)}px`;
  }, [value]);

  const submit = () => {
    if (!ready || busy) return;
    onSubmit(trimmed, kind);
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
  const modelLabel =
    meta.models.find((m) => m.id === config.model)?.label ?? config.model;
  const langLabel =
    TARGET_LANGUAGES.find((l) => l.code === style.targetLanguage)?.label ??
    style.targetLanguage;

  return (
    <div className="mx-auto w-full max-w-[680px] px-5 pb-16 pt-[14vh] sm:pt-[16vh]">
      <div className="rise mb-9 text-center">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--bg-elev)]/70 px-3.5 py-1.5 text-[12px] text-[var(--fg-muted)] backdrop-blur">
          <Sparkles size={12} className="text-[var(--accent)]" />
          แปลด้วย AI ผ่าน API Key ของคุณเอง
        </div>
        <h1 className="text-balance text-[34px] font-semibold leading-[1.15] tracking-tight sm:text-[44px]">
          วางลิงก์นิยาย
          <br className="sm:hidden" />
          <span className="bg-gradient-to-r from-[var(--accent)] to-[#ffb057] bg-clip-text text-transparent">
            {" "}
            อ่านเป็นภาษาไทยทันที
          </span>
        </h1>
        <p className="mx-auto mt-3.5 max-w-[440px] text-balance text-[14.5px] leading-relaxed text-[var(--fg-muted)]">
          ก็อปลิงก์มาวาง หรือวางเนื้อหาดิบ ๆ ก็ได้ — ระบบจะดึงเนื้อหา
          ล็อกคำศัพท์เฉพาะให้คงเส้นคงวา แล้วแปลแบบสตรีมทีละย่อหน้า
        </p>
      </div>

      <div
        className="rise rounded-[26px] border border-[var(--line)] bg-[var(--bg-elev)]/80 p-2 shadow-[0_24px_60px_-24px_rgba(0,0,0,.55)] backdrop-blur-xl"
        style={{ animationDelay: "60ms" }}
      >
        <div className="rounded-[20px] bg-[var(--bg)] p-3.5">
          <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-[var(--fg-dim)]">
            {trimmed.length === 0 ? (
              <>
                <Type size={13} /> วางอะไรก็ได้
              </>
            ) : kind === "url" ? (
              <>
                <Link2 size={13} className="text-[var(--accent)]" />
                <span className="text-[var(--accent)]">ตรวจพบลิงก์</span>
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
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
              if (e.key === "Enter" && kind === "url" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            spellCheck={false}
            placeholder="https://example.com/novel/chapter-1 หรือวางเนื้อหาทั้งตอนตรงนี้…"
            className="w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-[var(--fg-dim)]"
          />

          <div className="mt-3 flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={pasteFromClipboard}
              className="shrink-0"
            >
              <ClipboardPaste size={14} /> วางจากคลิปบอร์ด
            </Button>
            <div className="flex-1" />
            <Button
              variant="primary"
              size="md"
              onClick={submit}
              disabled={!ready || busy}
              className="min-w-[128px]"
            >
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

      <div
        className="rise mt-4 flex flex-wrap items-center justify-center gap-2"
        style={{ animationDelay: "120ms" }}
      >
        <div className="flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--bg-elev)] px-1 py-1">
          <Languages size={13} className="ml-2 text-[var(--fg-dim)]" />
          {TARGET_LANGUAGES.slice(0, 3).map((l) => (
            <button
              key={l.code}
              onClick={() => setStyle({ targetLanguage: l.code })}
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
          {!TARGET_LANGUAGES.slice(0, 3).some(
            (l) => l.code === style.targetLanguage,
          ) && (
            <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[12.5px] font-medium text-[var(--accent)]">
              {langLabel}
            </span>
          )}
        </div>

        <button
          onClick={onOpenSettings}
          className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--bg-elev)] px-3.5 py-2 text-[12.5px] text-[var(--fg-muted)] transition-colors hover:border-[var(--fg-dim)] hover:text-[var(--fg)]"
        >
          <Settings2 size={13} />
          {mounted ? modelLabel : "โมเดล"}
          {mounted && !config.apiKey ? (
            <span className="ml-0.5 rounded-md bg-[#ffb057]/15 px-1.5 py-0.5 text-[10.5px] font-semibold text-[#ffb057]">
              ต้องใส่คีย์
            </span>
          ) : null}
        </button>
      </div>
    </div>
  );
}
