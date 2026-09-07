"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ProviderConfig, StyleSettings } from "./types";

export type ThemeName = "dark" | "light" | "sepia";

export type FontKey = "sans" | "serif" | "loop" | "modern";

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
  paragraphGap: 1.15,
  indent: 2,
  maxWidth: 720,
  showSource: false,
};

interface SettingsState {
  config: ProviderConfig;
  style: StyleSettings;
  reader: ReaderPrefs;
  theme: ThemeName;
  onboarded: boolean;
  setConfig: (patch: Partial<ProviderConfig>) => void;
  setStyle: (patch: Partial<StyleSettings>) => void;
  setReader: (patch: Partial<ReaderPrefs>) => void;
  setTheme: (theme: ThemeName) => void;
  setOnboarded: (v: boolean) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      config: DEFAULT_CONFIG,
      style: DEFAULT_STYLE,
      reader: DEFAULT_READER,
      theme: "dark",
      onboarded: false,
      setConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),
      setStyle: (patch) => set((s) => ({ style: { ...s.style, ...patch } })),
      setReader: (patch) => set((s) => ({ reader: { ...s.reader, ...patch } })),
      setTheme: (theme) => set({ theme }),
      setOnboarded: (onboarded) => set({ onboarded }),
    }),
    {
      name: "novelflow.settings",
      version: 2,
      /** Fills in fields added after a reader last saved their settings. */
      migrate: (persisted) => {
        const s = (persisted ?? {}) as Partial<SettingsState>;
        return {
          ...s,
          config: { ...DEFAULT_CONFIG, ...(s.config ?? {}) },
          style: { ...DEFAULT_STYLE, ...(s.style ?? {}) },
          reader: { ...DEFAULT_READER, ...(s.reader ?? {}) },
        } as SettingsState;
      },
    },
  ),
);
