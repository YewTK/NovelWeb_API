export type ProviderId = "anthropic" | "openai" | "google" | "compatible";

export type Effort = "low" | "medium" | "high";

export interface ProviderConfig {
  provider: ProviderId;
  apiKey: string;
  model: string;
  /** only for provider === "compatible" */
  baseUrl?: string;
}

export interface StyleSettings {
  targetLanguage: string;
  tone: "faithful" | "literary" | "casual" | "light";
  pronoun: "auto" | "formal" | "casual";
  keepHonorifics: boolean;
  keepNamesRomanized: boolean;
  customInstruction: string;
  effort: Effort;
}

export interface GlossaryEntry {
  source: string;
  target: string;
  note?: string;
}

export interface Paragraph {
  id: number;
  source: string;
  target: string;
  /** heading paragraphs get rendered larger */
  heading?: boolean;
}

export interface ExtractResult {
  title: string;
  siteName: string | null;
  byline: string | null;
  url: string;
  paragraphs: string[];
  charCount: number;
  nextUrl: string | null;
  prevUrl: string | null;
}

export type ChapterStatus = "draft" | "translating" | "done" | "error";

export interface Chapter {
  id: string;
  createdAt: number;
  updatedAt: number;
  title: string;
  translatedTitle: string;
  sourceUrl: string | null;
  siteName: string | null;
  nextUrl: string | null;
  prevUrl: string | null;
  paragraphs: Paragraph[];
  glossary: GlossaryEntry[];
  status: ChapterStatus;
  progress: number;
  model: string;
  targetLanguage: string;
  /** id of the series/library group this chapter belongs to */
  seriesId: string;
}

export interface Series {
  id: string;
  name: string;
  glossary: GlossaryEntry[];
  createdAt: number;
}
