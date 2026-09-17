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

/** Reference details about a novel, written by the reader — not by the AI. */
export interface BookInfo {
  /** name in the original language */
  originalTitle?: string;
  author?: string;
  /** free-form tags, e.g. "แฟนตาซี", "กำลังภายใน" */
  genres?: string[];
  status?: "ongoing" | "completed" | "hiatus" | "";
  sourceLanguage?: string;
  synopsis?: string;
  /**
   * World and cast notes the translator should know: who is male/female,
   * who speaks to whom how, the narrative voice. Fed into every prompt.
   */
  translatorNotes?: string;
  sourceUrl?: string;
  /** cover image: a small data URL uploaded by the reader, or an https link */
  cover?: string;
}

export interface Series {
  id: string;
  /** derived from the source site + novel slug; groups chapters of one novel */
  key: string;
  name: string;
  glossary: GlossaryEntry[];
  info?: BookInfo;
  createdAt: number;
  updatedAt: number;
}
