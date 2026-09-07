"use client";

import { useState } from "react";
import { Check, ExternalLink, Eye, EyeOff, Sparkles } from "lucide-react";
import { PROVIDERS, TARGET_LANGUAGES, providerMeta } from "@/lib/models";
import { useSettings } from "@/lib/store";
import type { ProviderId, StyleSettings } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Button,
  Field,
  Segmented,
  Sheet,
  Switch,
  inputClass,
} from "./ui";

export function SettingsSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { config, style, setConfig, setStyle } = useSettings();
  const [showKey, setShowKey] = useState(false);
  const meta = providerMeta(config.provider);

  const pickProvider = (id: ProviderId) => {
    const next = providerMeta(id);
    setConfig({ provider: id, model: next.models[0].id, apiKey: "" });
  };

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

          <Field label="โมเดล">
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
                        ? "bg-[var(--flare-500,#ff8f3c)]/15 text-[#ffb057]"
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
          </Field>

          {config.provider === "compatible" && (
            <Field label="ชื่อโมเดลเอง" hint="พิมพ์ชื่อโมเดลตามที่ผู้ให้บริการกำหนด">
              <input
                value={config.model}
                onChange={(e) => setConfig({ model: e.target.value.trim() })}
                spellCheck={false}
                className={cn(inputClass, "font-mono text-[13px]")}
              />
            </Field>
          )}
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
