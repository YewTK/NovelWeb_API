"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ProviderConfig, StyleSettings } from "./types";

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

interface SettingsState {
  config: ProviderConfig;
  style: StyleSettings;
  reader: ReaderPrefs;
  theme: ThemeName;
  onboarded: boolean;
  shelfOrder: ShelfOrder;
  /** Follow the source site's "next chapter" link automatically when one finishes. */
  autoNext: boolean;
  setConfig: (patch: Partial<ProviderConfig>) => void;
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
      style: DEFAULT_STYLE,
      reader: DEFAULT_READER,
      theme: "dark",
      onboarded: false,
      shelfOrder: "asc",
      autoNext: false,
      setConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),
      setStyle: (patch) => set((s) => ({ style: { ...s.style, ...patch } })),
      setReader: (patch) => set((s) => ({ reader: { ...s.reader, ...patch } })),
      setTheme: (theme) => set({ theme }),
      setOnboarded: (onboarded) => set({ onboarded }),
      setShelfOrder: (shelfOrder) => set({ shelfOrder }),
      setAutoNext: (autoNext) => set({ autoNext }),
    }),
    {
      name: "novelflow.settings",
      version: 3,
      /** Fills in fields added after a reader last saved their settings. */
      migrate: (persisted, version) => {
        const s = (persisted ?? {}) as Partial<SettingsState>;
        const reader = { ...DEFAULT_READER, ...(s.reader ?? {}) };

        // v3 widened paragraph spacing: anyone still sitting on the old cramped
        // default gets the roomier one, while a deliberate choice is kept.
        if (version < 3 && reader.paragraphGap <= 1.2) {
          reader.paragraphGap = DEFAULT_READER.paragraphGap;
        }

        return {
          ...s,
          config: { ...DEFAULT_CONFIG, ...(s.config ?? {}) },
          style: { ...DEFAULT_STYLE, ...(s.style ?? {}) },
          reader,
          shelfOrder: s.shelfOrder ?? "asc",
          autoNext: s.autoNext ?? false,
        } as SettingsState;
      },
    },
  ),
);
