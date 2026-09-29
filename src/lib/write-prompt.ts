import { authorStyle } from "./authors";
import { LANG_NAME } from "./prompt";
import type { OutlineChapter, StoryOutline, WritingProject } from "./types";

/** Chapters planned per outline request; longer novels are planned in batches. */
export const OUTLINE_BATCH = 25;

/** Words per request when writing a chapter; longer chapters are written in parts. */
export const WORDS_PER_PART = 1400;

/** How many requests one chapter of this length needs. */
export function partsFor(words: number): number {
  return Math.max(1, Math.ceil(words / WORDS_PER_PART));
}

const POV_RULE: Record<WritingProject["pov"], string> = {
  first: "First person (the protagonist narrates as “I”). Stay inside their perception.",
  "third-limited":
    "Close third person, anchored to the protagonist's perception and inner voice. Switch viewpoint only at a clear scene break, and rarely.",
  "third-omniscient":
    "Third person omniscient: the narrator may move between characters and comment on events, but keep each scene's focus clear.",
};

const THAI_CRAFT = `
Thai novel craft — this must read as an original Thai web novel, never as a translation:
- Natural written Thai for narration; never ครับ/ค่ะ/นะ in narration, only in dialogue where that character would really say them.
- Pronouns carry character. Choose from status, age, relationship and genre, then hold them steady:
  • xianxia / wuxia / historical: ข้า, เจ้า, ท่าน, ศิษย์พี่, ศิษย์น้อง, ผู้อาวุโส where fitting;
  • modern settings: ผม, ฉัน, คุณ, นาย, เธอ, แก, พี่/น้อง by age;
  • western fantasy: ข้า/เจ้า for nobles and archaic speakers, ผม/ฉัน/คุณ for ordinary modern-voiced people.
- Drop subjects the way Thai prose naturally does once the referent is clear.
- No translationese: no dummy "มัน" subjects, no ถูก for every passive, no chains of การ/ความ/ซึ่ง, no "ได้ทำการ".
- Dialogue in Thai quotation marks “ ”. Keep dialogue tags short and varied.
- Sound effects and interjections read as Thai (เฮือก, ตึง, ปัง, ฮึ่ม, อ๊ะ).
- Rhythm like popular Thai web novels: short paragraphs, frequent line breaks for impact, occasional one-line paragraphs.`;

const GENERIC_CRAFT = `
Craft:
- Idiomatic, vivid prose in the target language, written like a bestselling web novel.
- Short paragraphs, varied sentence length, dialogue that sounds like real people.`;

function languageName(code: string): string {
  return LANG_NAME[code] ?? code;
}

function styleBlock(project: WritingProject): string {
  const style = authorStyle(project.styleId);
  const notes = project.styleNotes.trim();
  return `${style.brief}${notes ? `\n\nAdditional voice notes from the author (they override the brief where they conflict):\n${notes.slice(0, 2000)}` : ""}

Emulate the craft only. Do NOT reuse any character, place, organisation, power system, terminology, plot or sentence from ${style.works} or any other existing work. Everything in this novel is original.`;
}

function premiseBlock(title: string, project: WritingProject): string {
  const lines = [`Title: ${title || "(untitled — propose one)"}`];
  if (project.blurb.trim()) lines.push(`Blurb (คำโปรย): ${project.blurb.trim().slice(0, 600)}`);
  if (project.synopsis.trim()) lines.push(`Synopsis: ${project.synopsis.trim().slice(0, 4000)}`);
  if (project.tags.length) lines.push(`Tags: ${project.tags.join(", ")}`);
  return lines.join("\n");
}

function bibleBlock(outline: StoryOutline): string {
  const cast = outline.characters
    .slice(0, 24)
    .map((c) => `- ${c.name} (${c.role}): ${c.profile}`)
    .join("\n");
  return `Logline: ${outline.logline}

World, power system and tone:
${outline.world}

Cast:
${cast || "- (introduce characters as the story needs them)"}`;
}

function chapterLine(c: OutlineChapter): string {
  return `${c.n}. ${c.title} — ${c.summary}`;
}

/* --------------------------------- outline -------------------------------- */

export function buildOutlineSystem(title: string, project: WritingProject): string {
  const lang = languageName(project.language);
  return `You are a bestselling web-novel author and story architect planning a serialised novel of ${project.chapterCount} chapters, about ${project.wordsPerChapter} words each, written in ${lang}.

${premiseBlock(title, project)}

Point of view: ${POV_RULE[project.pov]}

The voice this novel will be written in:
${styleBlock(project)}

Planning principles:
- Serial fiction: every chapter must earn the click on the next. Each chapter has a goal, a complication, and ends on a hook (cliffhanger, reveal, reversal or emotional turn).
- Pace arcs across the whole length: setup, escalating arcs with mini-climaxes, a midpoint shift, and a climax proportionate to ${project.chapterCount} chapters. If the novel is long, plan it as volumes/arcs that each resolve while opening the next.
- Characters have wants, fears and secrets; relationships change over time. Seed foreshadowing early and pay it off later.
- The power/magic system has clear rules and costs, introduced gradually through the story rather than dumped.
- Honour the synopsis, blurb and tags; invent everything they do not specify.
- Write all names, titles and summaries in ${lang}. Character names should suit the setting.

Reply with JSON only — no markdown fence, no commentary.`;
}

export function buildOutlineUser(opts: {
  from: number;
  to: number;
  total: number;
  existing: StoryOutline | null;
}): string {
  const { from, to, total, existing } = opts;
  if (!existing) {
    return `Create the story bible and plan chapters ${from}–${to} of ${total}.

Return exactly this shape:
{"title":"<the novel's title>","logline":"<one or two sentences>","world":"<setting, power system with its ranks/rules/costs, factions, tone — 120 to 250 words>","characters":[{"name":"","role":"protagonist / heroine / rival / mentor / antagonist …","profile":"<appearance, personality, goal, secret — 25 to 50 words>"}],"chapters":[{"n":${from},"title":"<chapter title>","summary":"<3 to 5 sentences: what happens, the turn, and the hook it ends on>"}]}

Include 5 to 12 characters. Include every chapter from ${from} to ${to} exactly once, in order.`;
  }

  const recent = existing.chapters
    .filter((c) => c.n < from)
    .slice(-12)
    .map(chapterLine)
    .join("\n");
  const earlier = existing.chapters.filter((c) => c.n < from).length - 12;

  return `Story bible so far:
${bibleBlock(existing)}

${earlier > 0 ? `(${earlier} earlier chapters are already planned.)\n` : ""}Most recent planned chapters:
${recent}

Continue the plan: chapters ${from}–${to} of ${total}. Keep continuity with everything above, escalate the arcs, and move toward the ending appropriate for ${total} chapters${to >= total ? " — chapter " + total + " is the finale and must resolve the main conflict" : ""}.

Return exactly this shape:
{"chapters":[{"n":${from},"title":"","summary":"<3 to 5 sentences ending on the hook>"}]}

Include every chapter from ${from} to ${to} exactly once, in order.`;
}

/* --------------------------------- chapters -------------------------------- */

/**
 * Identical for every chapter of the novel, so it is sent as a cacheable
 * system prompt: persona, voice, craft rules and the full story bible.
 */
export function buildChapterSystem(title: string, project: WritingProject): string {
  const outline = project.outline!;
  const lang = languageName(project.language);
  return `You are the author of the serialised web novel "${title}", writing in ${lang}. Your chapters are bestsellers: immersive, emotionally gripping, impossible to stop reading.

The voice of this novel:
${styleBlock(project)}

Point of view: ${POV_RULE[project.pov]}
${project.language === "th" ? THAI_CRAFT : GENERIC_CRAFT}

Story bible — canon for every chapter:
${premiseBlock(title, project)}

${bibleBlock(outline)}

Writing rules:
- Show, don't summarise: dramatise the chapter's beats as live scenes with dialogue, action, sensory detail and interiority. Never skip past a beat in a sentence.
- Stay consistent with the bible: names, relationships, abilities, rules and established facts.
- Follow the chapter plan you are given, but you may add small scenes, texture and dialogue that serve it. Never advance the plot beyond this chapter's plan — later chapters are already planned.
- Keep momentum: every scene changes something.

OUTPUT FORMAT — non-negotiable:
- Plain prose only. Separate paragraphs with a blank line.
- Do not write the chapter title, a chapter number, headings, markdown, notes, or any commentary before or after the prose.
- Scene breaks are a line containing only ***.`;
}

export function buildChapterUser(opts: {
  project: WritingProject;
  n: number;
  part: number;
  parts: number;
  /** the tail of the previous chapter, or of this chapter's earlier parts */
  previousText?: string;
}): string {
  const { project, n, part, parts, previousText } = opts;
  const outline = project.outline!;
  const plan = outline.chapters.find((c) => c.n === n);
  const before = outline.chapters.filter((c) => c.n < n);
  const next = outline.chapters.find((c) => c.n === n + 1);
  const words = Math.round(project.wordsPerChapter / parts);
  const thai = project.language === "th";

  const sections: string[] = [];

  if (before.length) {
    const far = before.slice(0, -6);
    const near = before.slice(-6);
    sections.push(
      `The story so far (chapter plans already written):\n${
        far.length ? `[chapters 1–${far[far.length - 1].n}, in brief] ${far.map((c) => c.title).join(" · ")}\n` : ""
      }${near.map(chapterLine).join("\n")}`,
    );
  }

  sections.push(
    `THIS CHAPTER — ${n} of ${project.chapterCount}: ${plan?.title ?? ""}\nPlan: ${plan?.summary ?? "Continue the story naturally."}`,
  );
  if (next) {
    sections.push(
      `Next chapter (for foreshadowing only — do NOT write it): ${next.title} — ${next.summary}`,
    );
  }

  if (previousText) {
    sections.push(
      `${part > 1 ? "The text of this chapter so far" : "How the previous chapter ended"} — continue seamlessly from here; do NOT repeat it:\n<previous>\n${previousText}\n</previous>`,
    );
  }

  const lengthRule = `about ${words} words${thai ? ` (roughly ${(words * 4).toLocaleString()} Thai characters)` : ""}`;
  let task: string;
  if (parts === 1) {
    task = `Write chapter ${n} in full, ${lengthRule}. Open with a strong hook and end on the chapter's hook.`;
  } else if (part === 1) {
    task = `This chapter is written in ${parts} parts. Write part 1 of ${parts}, ${lengthRule}: open with a strong hook and cover roughly the first ${Math.round(100 / parts)}% of the plan. Stop at a natural beat — do not conclude the chapter.`;
  } else if (part < parts) {
    task = `Write part ${part} of ${parts} of chapter ${n}, ${lengthRule}. Pick up exactly where the text above stops and carry the plan forward by roughly another ${Math.round(100 / parts)}%. Do not conclude the chapter yet.`;
  } else {
    task = `Write the final part (${part} of ${parts}) of chapter ${n}, ${lengthRule}. Pick up exactly where the text above stops, complete the remaining beats of the plan, and end on the chapter's hook.`;
  }
  sections.push(task);

  return sections.join("\n\n");
}

/* ---------------------------------- parse ---------------------------------- */

/** Pulls the first JSON object out of a model reply, tolerating stray prose. */
export function parseJsonObject<T>(raw: string): T | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

/** Splits streamed prose into paragraphs, dropping stray headings or fences. */
export function proseToParagraphs(raw: string): string[] {
  return raw
    .replace(/```[a-z]*\n?/gi, "")
    .split(/\n\s*\n|\r\n\s*\r\n/)
    .flatMap((block) => {
      const lines = block
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      // A single newline inside dialogue-heavy output is usually a new paragraph too.
      return lines;
    })
    .map((p) => p.replace(/^#{1,6}\s+/, "").trim())
    .filter(Boolean);
}
