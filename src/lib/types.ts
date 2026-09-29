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
  /** คำโปรย — the one- or two-line hook printed on the back cover */
  blurb?: string;
  /**
   * Present only on novels written in the Studio. Lives inside `info` so it
   * rides along in the existing `series.info` jsonb column — no migration.
   */
  project?: WritingProject;
}

/* ------------------------------ writing studio ----------------------------- */

export type Pov = "first" | "third-limited" | "third-omniscient";

export interface OutlineCharacter {
  name: string;
  role: string;
  profile: string;
}

export interface OutlineChapter {
  /** 1-based chapter number */
  n: number;
  title: string;
  /** the beats this chapter must hit, ending on its hook */
  summary: string;
}

/** A story arc (volume) in the long-range roadmap of the novel. */
export interface OutlineArc {
  name: string;
  /** first and last chapter the arc spans */
  from: number;
  to: number;
  summary: string;
}

/** "The story so far", written by the planner as each batch lands. */
export interface OutlineRecap {
  /** the recap covers every planned chapter up to and including this one */
  through: number;
  text: string;
}

export interface StoryOutline {
  logline: string;
  /** world, power system, tone — the story bible */
  world: string;
  characters: OutlineCharacter[];
  /**
   * Chapter plans. Long novels are planned in batches as writing approaches
   * them, so this usually covers only the opening stretch of the book.
   */
  chapters: OutlineChapter[];
  /** the whole-book roadmap, planned once up front */
  arcs?: OutlineArc[];
  /** rolling summaries, so chapter 3,000 still knows what happened in 30 */
  recaps?: OutlineRecap[];
}

/** Everything the Studio needs to plan and keep writing one novel. */
export interface WritingProject {
  synopsis: string;
  blurb: string;
  tags: string[];
  /** id from lib/authors.ts */
  styleId: string;
  /** free-form extra voice notes, layered on top of the style */
  styleNotes: string;
  chapterCount: number;
  /** target length of one chapter, in words */
  wordsPerChapter: number;
  pov: Pov;
  /** language code the novel is written in */
  language: string;
  /** reasoning effort for writing: "high" is the best prose, "medium" is cheaper */
  effort?: "medium" | "high";
  outline: StoryOutline | null;
  /** chapter number → id of the chapter written for it */
  chapterIds: Record<string, string>;
  createdAt: number;
}

/** A chapter without its body — what shelves and tables of contents need. */
export type ChapterMeta = Omit<Chapter, "paragraphs" | "glossary"> & {
  paragraphCount: number;
  /** paragraphs that still have no text */
  missingCount: number;
  glossaryCount: number;
};

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
