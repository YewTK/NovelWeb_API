"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ProviderConfig, StyleSettings } from "./types";

export type ThemeName = "dark" | "light" | "sepia";

export interface ReaderPrefs {
  fontSize: number;
  lineHeight: number;
  fontFamily: "serif" | "sans";
  paragraphGap: number;
  maxWidth: number;
  showSource: boolean;
}

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
      config: {
        provider: "anthropic",
        apiKey: "",
        model: "claude-opus-5",
        baseUrl: "",
      },
      style: {
        targetLanguage: "th",
        tone: "literary",
        pronoun: "auto",
        keepHonorifics: true,
        keepNamesRomanized: false,
        customInstruction: "",
        effort: "low",
      },
      reader: {
        fontSize: 19,
        lineHeight: 1.95,
        fontFamily: "sans",
        paragraphGap: 1.15,
        maxWidth: 720,
        showSource: false,
      },
      theme: "dark",
      onboarded: false,
      setConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),
      setStyle: (patch) => set((s) => ({ style: { ...s.style, ...patch } })),
      setReader: (patch) => set((s) => ({ reader: { ...s.reader, ...patch } })),
      setTheme: (theme) => set({ theme }),
      setOnboarded: (onboarded) => set({ onboarded }),
    }),
    { name: "novelflow.settings", version: 1 },
  ),
);
