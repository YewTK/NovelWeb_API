import type { ProviderId } from "./types";

export interface ModelOption {
  id: string;
  label: string;
  hint: string;
  /** relative translation-quality signal shown in the picker */
  tier: "flagship" | "balanced" | "fast";
}

export interface ProviderMeta {
  id: ProviderId;
  name: string;
  keyLabel: string;
  keyPlaceholder: string;
  keyHelpUrl: string;
  needsBaseUrl?: boolean;
  models: ModelOption[];
}

export const PROVIDERS: ProviderMeta[] = [
  {
    id: "anthropic",
    name: "Claude",
    keyLabel: "Anthropic API Key",
    keyPlaceholder: "sk-ant-...",
    keyHelpUrl: "https://console.anthropic.com/settings/keys",
    models: [
      {
        id: "claude-opus-5",
        label: "Claude Opus 5",
        hint: "สำนวนดีที่สุด เหมาะกับนิยายที่เน้นอารมณ์",
        tier: "flagship",
      },
      {
        id: "claude-sonnet-5",
        label: "Claude Sonnet 5",
        hint: "สมดุลคุณภาพ/ราคา แปลยาว ๆ ได้สบาย",
        tier: "balanced",
      },
      {
        id: "claude-haiku-4-5",
        label: "Claude Haiku 4.5",
        hint: "เร็วและถูกที่สุด เหมาะกับอ่านเอาเรื่อง",
        tier: "fast",
      },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    keyLabel: "OpenAI API Key",
    keyPlaceholder: "sk-...",
    keyHelpUrl: "https://platform.openai.com/api-keys",
    models: [
      { id: "gpt-4.1", label: "GPT-4.1", hint: "คุณภาพสูง", tier: "flagship" },
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini", hint: "เร็ว ประหยัด", tier: "fast" },
      { id: "gpt-4o", label: "GPT-4o", hint: "รุ่นทั่วไป", tier: "balanced" },
    ],
  },
  {
    id: "google",
    name: "Gemini",
    keyLabel: "Google AI Studio Key",
    keyPlaceholder: "AIza...",
    keyHelpUrl: "https://aistudio.google.com/app/apikey",
    models: [
      {
        id: "gemini-2.5-flash",
        label: "Gemini 2.5 Flash",
        hint: "อยู่ในโควตาฟรี เร็ว เหมาะกับแปลนิยายยาว",
        tier: "balanced",
      },
      {
        id: "gemini-2.5-flash-lite",
        label: "Gemini 2.5 Flash-Lite",
        hint: "ฟรีและเบาที่สุด สำนวนสู้ Flash ไม่ได้",
        tier: "fast",
      },
      {
        id: "gemini-2.5-pro",
        label: "Gemini 2.5 Pro",
        hint: "คุณภาพสูงสุด โควตาฟรีน้อยมาก",
        tier: "flagship",
      },
    ],
  },
  {
    id: "compatible",
    name: "OpenAI-compatible",
    keyLabel: "API Key",
    keyPlaceholder: "sk-or-v1-... / อื่น ๆ",
    keyHelpUrl: "https://openrouter.ai/keys",
    needsBaseUrl: true,
    models: [
      { id: "deepseek/deepseek-chat", label: "DeepSeek Chat", hint: "ถูกมาก แปลจีนดี", tier: "balanced" },
      { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash (OR)", hint: "ผ่าน OpenRouter", tier: "fast" },
    ],
  },
];

export function providerMeta(id: ProviderId): ProviderMeta {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];
}

/** Anthropic models that accept output_config.effort */
export function supportsEffort(model: string): boolean {
  return /^claude-(opus-5|sonnet-5|opus-4-8|opus-4-7|fable-5)/.test(model);
}

export const TARGET_LANGUAGES = [
  { code: "th", label: "ไทย" },
  { code: "en", label: "English" },
  { code: "ja", label: "日本語" },
  { code: "zh", label: "中文（简体）" },
  { code: "ko", label: "한국어" },
  { code: "vi", label: "Tiếng Việt" },
  { code: "id", label: "Bahasa Indonesia" },
];
