"use client";

import { useEffect, useState } from "react";
import {
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { PROVIDERS, TARGET_LANGUAGES, providerMeta } from "@/lib/models";
import { useSettings } from "@/lib/store";
import type { ProviderId, StyleSettings } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button, Field, Segmented, Sheet, Switch, inputClass } from "./ui";

interface RemoteModel {
  id: string;
  label: string;
  note?: string;
}

export function SettingsSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { config, style, setConfig, setStyle, autoNext, setAutoNext } =
    useSettings();
  const [showKey, setShowKey] = useState(false);
  const [remote, setRemote] = useState<RemoteModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const meta = providerMeta(config.provider);

  // A fetched list belongs to one key + provider; drop it when either changes.
  useEffect(() => {
    setRemote([]);
    setLoadError(null);
    setQuery("");
  }, [config.provider, config.apiKey, config.baseUrl]);

  const pickProvider = (id: ProviderId) => {
    const next = providerMeta(id);
    setConfig({ provider: id, model: next.models[0].id, apiKey: "" });
  };

  const fetchModels = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "ดึงรายชื่อโมเดลไม่สำเร็จ");
      if (!json.models?.length) throw new Error("บัญชีนี้ยังไม่มีโมเดลให้ใช้");
      setRemote(json.models as RemoteModel[]);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "ดึงรายชื่อโมเดลไม่สำเร็จ");
    }
    setLoading(false);
  };

  const curatedIds = new Set(meta.models.map((m) => m.id));
  const filtered = query.trim()
    ? remote.filter((m) =>
        `${m.id} ${m.label}`.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : remote;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="ตั้งค่าการแปล"
      description="API Key ถูกเก็บไว้ในเบราว์เซอร์ของคุณเท่านั้น และถูกส่งตรงไปยังผู้ให้บริการ AI"
    >
      <div className="space-y-7">
        <section className="space-y-4">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-[var(--fg-dim)]">
            <Sparkles size={13} /> ผู้ให้บริการ AI
          </h3>

          <div className="grid grid-cols-2 gap-2">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => pickProvider(p.id)}
                className={cn(
                  "relative rounded-xl border px-3 py-2.5 text-left text-[13px] font-medium transition-all",
                  config.provider === p.id
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--fg)]"
                    : "border-[var(--line)] bg-[var(--bg)] text-[var(--fg-muted)] hover:border-[var(--fg-dim)]",
                )}
              >
                {p.name}
                {config.provider === p.id && (
                  <Check
                    size={14}
                    className="absolute right-2.5 top-3 text-[var(--accent)]"
                  />
                )}
              </button>
            ))}
          </div>

          <Field
            label={meta.keyLabel}
            hint={
              <a
                href={meta.keyHelpUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
              >
                ขอ API Key ที่นี่ <ExternalLink size={11} />
              </a>
            }
            action={
              <button
                onClick={() => setShowKey((v) => !v)}
                className="text-[var(--fg-dim)] transition-colors hover:text-[var(--fg)]"
                aria-label={showKey ? "ซ่อนคีย์" : "แสดงคีย์"}
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            }
          >
            <input
              type={showKey ? "text" : "password"}
              value={config.apiKey}
              onChange={(e) => setConfig({ apiKey: e.target.value.trim() })}
              placeholder={meta.keyPlaceholder}
              autoComplete="off"
              spellCheck={false}
              className={cn(inputClass, "font-mono text-[13px]")}
            />
          </Field>

          {meta.needsBaseUrl && (
            <Field
              label="Base URL"
              hint="เช่น https://openrouter.ai/api/v1 หรือ https://api.deepseek.com"
            >
              <input
                value={config.baseUrl ?? ""}
                onChange={(e) => setConfig({ baseUrl: e.target.value.trim() })}
                placeholder="https://openrouter.ai/api/v1"
                spellCheck={false}
                className={cn(inputClass, "font-mono text-[13px]")}
              />
            </Field>
          )}

          <Field
            label="โมเดล"
            hint={
              remote.length > 0
                ? `${remote.length} โมเดลที่คีย์นี้ใช้ได้จริง`
                : "กดปุ่มด้านขวาเพื่อดูว่าคีย์ของคุณใช้โมเดลอะไรได้บ้าง"
            }
            action={
              <button
                onClick={fetchModels}
                disabled={loading || !config.apiKey}
                className="inline-flex items-center gap-1.5 text-[12px] text-[var(--accent)] transition-opacity hover:underline disabled:opacity-40"
              >
                {loading ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <RefreshCw size={12} />
                )}
                ดึงจากบัญชีของฉัน
              </button>
            }
          >
            {loadError ? (
              <p className="mb-2 rounded-lg border border-red-500/25 bg-red-500/8 px-3 py-2 text-[12px] leading-relaxed text-red-400">
                {loadError}
              </p>
            ) : null}

            {remote.length > 0 ? (
              <div className="space-y-2">
                <div className="relative">
                  <Search
                    size={13}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-dim)]"
                  />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="ค้นหาโมเดล เช่น flash"
                    spellCheck={false}
                    className={cn(inputClass, "pl-8 text-[13px]")}
                  />
                </div>

                <div className="max-h-[280px] space-y-1.5 overflow-y-auto overscroll-contain pr-0.5">
                  {filtered.length === 0 ? (
                    <p className="px-1 py-3 text-center text-[12.5px] text-[var(--fg-dim)]">
                      ไม่พบโมเดลที่ตรงกับ “{query}”
                    </p>
                  ) : (
                    filtered.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setConfig({ model: m.id })}
                        className={cn(
                          "flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all",
                          config.model === m.id
                            ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                            : "border-[var(--line)] bg-[var(--bg)] hover:border-[var(--fg-dim)]",
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">
                            {m.label}
                          </span>
                          <span className="mt-0.5 block truncate font-mono text-[11px] text-[var(--fg-dim)]">
                            {m.id}
                          </span>
                        </span>
                        {curatedIds.has(m.id) ? (
                          <span className="shrink-0 rounded-md bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                            แนะนำ
                          </span>
                        ) : null}
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {meta.models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setConfig({ model: m.id })}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-all",
                      config.model === m.id
                        ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                        : "border-[var(--line)] bg-[var(--bg)] hover:border-[var(--fg-dim)]",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-medium">
                        {m.label}
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-snug text-[var(--fg-dim)]">
                        {m.hint}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        m.tier === "flagship"
                          ? "bg-[#ff8f3c]/15 text-[#ffb057]"
                          : m.tier === "balanced"
                            ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                            : "bg-[var(--bg-elev-2)] text-[var(--fg-dim)]",
                      )}
                    >
                      {m.tier === "flagship"
                        ? "ดีสุด"
                        : m.tier === "balanced"
                          ? "สมดุล"
                          : "เร็ว"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Field>

          <Field
            label="โมเดลที่เลือกอยู่"
            hint="พิมพ์ชื่อโมเดลเองได้ ถ้ารู้ชื่อที่ต้องการอยู่แล้ว"
          >
            <input
              value={config.model}
              onChange={(e) => setConfig({ model: e.target.value.trim() })}
              spellCheck={false}
              className={cn(inputClass, "font-mono text-[13px]")}
            />
          </Field>
        </section>

        <div className="h-px bg-[var(--line-soft)]" />

        <section className="space-y-5">
          <h3 className="text-[13px] font-semibold uppercase tracking-wider text-[var(--fg-dim)]">
            สไตล์การแปล
          </h3>

          <Field label="แปลเป็นภาษา">
            <div className="flex flex-wrap gap-1.5">
              {TARGET_LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setStyle({ targetLanguage: l.code })}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-[13px] transition-all",
                    style.targetLanguage === l.code
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] font-medium"
                      : "border-[var(--line)] text-[var(--fg-muted)] hover:border-[var(--fg-dim)]",
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="โทนสำนวน">
            <Segmented<StyleSettings["tone"]>
              value={style.tone}
              onChange={(tone) => setStyle({ tone })}
              options={[
                { value: "faithful", label: "ตรงต้นฉบับ", title: "รักษาโครงประโยคเดิม" },
                { value: "literary", label: "วรรณกรรม", title: "สำนวนสละสลวยแบบนิยายแปล" },
                { value: "casual", label: "สบาย ๆ", title: "ภาษาพูดแบบแฟนซับ" },
                { value: "light", label: "อ่านง่าย", title: "ประโยคสั้น กระชับ" },
              ]}
            />
          </Field>

          <Field
            label="ความประณีต"
            hint="ยิ่งสูงยิ่งคิดละเอียด แต่ช้าและใช้โทเคนมากขึ้น"
          >
            <Segmented<StyleSettings["effort"]>
              value={style.effort}
              onChange={(effort) => setStyle({ effort })}
              options={[
                { value: "low", label: "เร็ว" },
                { value: "medium", label: "สมดุล" },
                { value: "high", label: "ประณีต" },
              ]}
            />
          </Field>

          <div className="space-y-1">
            <Switch
              checked={style.keepHonorifics}
              onChange={(keepHonorifics) => setStyle({ keepHonorifics })}
              label="คงคำต่อท้ายชื่อ"
              hint="-ซัง, -ซามะ, -นิม, เสิ่นเจ๋อ ฯลฯ"
            />
            <Switch
              checked={style.keepNamesRomanized}
              onChange={(keepNamesRomanized) => setStyle({ keepNamesRomanized })}
              label="คงชื่อเฉพาะเป็นอักษรโรมัน"
              hint="ไม่ทับศัพท์ชื่อตัวละครและสถานที่"
            />
            <Switch
              checked={autoNext}
              onChange={setAutoNext}
              label="ดึงตอนถัดไปอัตโนมัติ"
              hint="แปลจบแล้วไปตอนถัดไปของเว็บต้นทางเองต่อเนื่อง — มีค่าใช้จ่าย API ตามจำนวนตอน หยุดสูงสุดที่ 50 ตอน"
            />
          </div>

          <Field
            label="คำสั่งเพิ่มเติม"
            hint="เช่น “ตัวเอกเป็นผู้หญิง ใช้สรรพนามว่า ‘ฉัน’” หรือ “อย่าแปลชื่อท่าไม้ตาย”"
          >
            <textarea
              value={style.customInstruction}
              onChange={(e) => setStyle({ customInstruction: e.target.value })}
              rows={3}
              placeholder="ไม่บังคับ"
              className={cn(inputClass, "resize-y leading-relaxed")}
            />
          </Field>
        </section>

        <Button variant="primary" size="lg" className="w-full" onClick={onClose}>
          เสร็จสิ้น
        </Button>
      </div>
    </Sheet>
  );
}
