"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ProviderConfig, ProviderId, StyleSettings } from "./types";

export type ThemeName = "dark" | "light" | "sepia";

export type FontKey = "sans" | "serif" | "loop" | "modern";

/** Chapter order inside a shelf: first chapter on top, or newest on top. */
export type ShelfOrder = "asc" | "desc";

export interface ReaderPrefs {
  fontSize: number;
  lineHeight: number;
  fontFamily: FontKey;
  paragraphGap: number;
  /** first-line indent, in em — the Thai print convention */
  indent: number;
  maxWidth: number;
  showSource: boolean;
}

const DEFAULT_CONFIG: ProviderConfig = {
  provider: "anthropic",
  apiKey: "",
  model: "claude-opus-5",
  baseUrl: "",
};

const DEFAULT_STYLE: StyleSettings = {
  targetLanguage: "th",
  tone: "literary",
  pronoun: "auto",
  keepHonorifics: true,
  keepNamesRomanized: false,
  customInstruction: "",
  effort: "low",
};

const DEFAULT_READER: ReaderPrefs = {
  fontSize: 19,
  lineHeight: 1.95,
  fontFamily: "sans",
  paragraphGap: 1.9,
  indent: 2,
  maxWidth: 720,
  showSource: false,
};

/**
 * Free Gemini keys allow roughly 10 requests a minute on Flash and 5 on Pro;
 * staying just under that is what keeps a long chapter from hitting 429.
 * Paid providers get no client-side cap by default.
 */
export const DEFAULT_RPM: Record<ProviderId, number> = {
  anthropic: 0,
  openai: 0,
  google: 8,
  compatible: 0,
};

/** Every non-empty, de-duplicated key saved for a provider. */
export function keysFor(
  state: Pick<SettingsState, "apiKeys" | "config">,
  provider: ProviderId = state.config.provider,
): string[] {
  const list = state.apiKeys[provider] ?? [];
  return [...new Set(list.map((k) => k.trim()).filter(Boolean))];
}

export function rpmFor(
  state: Pick<SettingsState, "rpm" | "config">,
  provider: ProviderId = state.config.provider,
): number {
  return state.rpm[provider] ?? DEFAULT_RPM[provider];
}

interface SettingsState {
  config: ProviderConfig;
  /** Several keys per provider, used in rotation. config.apiKey mirrors the first. */
  apiKeys: Partial<Record<ProviderId, string[]>>;
  /** Client-side requests-per-minute cap per key, per provider. */
  rpm: Partial<Record<ProviderId, number>>;
  style: StyleSettings;
  reader: ReaderPrefs;
  theme: ThemeName;
  onboarded: boolean;
  shelfOrder: ShelfOrder;
  /** Follow the source site's "next chapter" link automatically when one finishes. */
  autoNext: boolean;
  setConfig: (patch: Partial<ProviderConfig>) => void;
  setKeys: (provider: ProviderId, keys: string[]) => void;
  setRpm: (provider: ProviderId, rpm: number) => void;
  setStyle: (patch: Partial<StyleSettings>) => void;
  setReader: (patch: Partial<ReaderPrefs>) => void;
  setTheme: (theme: ThemeName) => void;
  setOnboarded: (v: boolean) => void;
  setShelfOrder: (order: ShelfOrder) => void;
  setAutoNext: (v: boolean) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      config: DEFAULT_CONFIG,
      apiKeys: {},
      rpm: {},
      style: DEFAULT_STYLE,
      reader: DEFAULT_READER,
      theme: "dark",
      onboarded: false,
      shelfOrder: "asc",
      autoNext: false,
      setConfig: (patch) =>
        set((s) => {
          const config = { ...s.config, ...patch };
          // Switching provider brings that provider's own saved keys along.
          if (patch.provider && patch.apiKey === undefined) {
            config.apiKey = keysFor(s, patch.provider)[0] ?? "";
          }
          return { config };
        }),
      setKeys: (provider, keys) =>
        set((s) => {
          const apiKeys = { ...s.apiKeys, [provider]: keys };
          const config =
            s.config.provider === provider
              ? { ...s.config, apiKey: keys.map((k) => k.trim()).find(Boolean) ?? "" }
              : s.config;
          return { apiKeys, config };
        }),
      setRpm: (provider, rpm) => set((s) => ({ rpm: { ...s.rpm, [provider]: rpm } })),
      setStyle: (patch) => set((s) => ({ style: { ...s.style, ...patch } })),
      setReader: (patch) => set((s) => ({ reader: { ...s.reader, ...patch } })),
      setTheme: (theme) => set({ theme }),
      setOnboarded: (onboarded) => set({ onboarded }),
      setShelfOrder: (shelfOrder) => set({ shelfOrder }),
      setAutoNext: (autoNext) => set({ autoNext }),
    }),
    {
      name: "novelflow.settings",
      version: 4,
      /** Fills in fields added after a reader last saved their settings. */
      migrate: (persisted, version) => {
        const s = (persisted ?? {}) as Partial<SettingsState>;
        const reader = { ...DEFAULT_READER, ...(s.reader ?? {}) };

        // v3 widened paragraph spacing: anyone still sitting on the old cramped
        // default gets the roomier one, while a deliberate choice is kept.
        if (version < 3 && reader.paragraphGap <= 1.2) {
          reader.paragraphGap = DEFAULT_READER.paragraphGap;
        }

        const config = { ...DEFAULT_CONFIG, ...(s.config ?? {}) };
        // v4 keeps several keys per provider; seed the list with the old single key.
        const apiKeys = { ...(s.apiKeys ?? {}) };
        if (config.apiKey && !apiKeys[config.provider]?.length) {
          apiKeys[config.provider] = [config.apiKey];
        }

        return {
          ...s,
          config,
          apiKeys,
          rpm: s.rpm ?? {},
          style: { ...DEFAULT_STYLE, ...(s.style ?? {}) },
          reader,
          shelfOrder: s.shelfOrder ?? "asc",
          autoNext: s.autoNext ?? false,
        } as SettingsState;
      },
    },
  ),
);
