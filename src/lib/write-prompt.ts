import { authorStyle } from "./authors";
import { LANG_NAME } from "./prompt";
import type { OutlineArc, OutlineChapter, OutlineRecap, StoryOutline, WritingProject } from "./types";

/** The longest novel the studio will plan. */
export const MAX_CHAPTERS = 4000;

/** Chapters planned per outline request. */
export const OUTLINE_BATCH = 25;

/** Words per request when writing a chapter; longer chapters are written in parts. */
export const WORDS_PER_PART = 1400;

/** How many recent chapter plans travel with every request. */
export const PLAN_WINDOW = 8;

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
- No translationese: no dummy "มัน" subjects, no ถูก for every passive, no chains of การ/ความ/ซึ่ง, no "ได้ทำการ", no "มีความ + adjective" when a plain adjective works.
- Rich, precise Thai vocabulary — vary verbs of speech and motion (เอ่ย กระซิบ ตวาด พึมพำ ก้าว ถลา ทรุด) instead of repeating พูด/เดิน.
- Dialogue in Thai quotation marks “ ”. Keep dialogue tags short and varied.
- Sound effects and interjections read as Thai (เฮือก, ตึง, ปัง, ฮึ่ม, อ๊ะ).
- Rhythm like popular Thai web novels: short paragraphs, frequent line breaks for impact, occasional one-line paragraphs.`;

const GENERIC_CRAFT = `
Language craft:
- Idiomatic, vivid prose in the target language, written like a bestselling web novel.
- Short paragraphs, varied sentence length, dialogue that sounds like real people.`;

/** What separates a chapter readers binge from one they skim. */
const QUALITY_BAR = `
Quality bar — hold every chapter to it:
- Open in motion: a line of action, dialogue or a striking image. Never open with a recap of the last chapter, a weather report or the protagonist waking up.
- Every scene turns: someone wants something, something stands in the way, and the situation is different at the end of the scene.
- Dramatise, don't summarise. The plan's beats become live moments with dialogue, action, sensory detail and interiority — never "and then, over the next days…".
- Specific over generic: concrete nouns, precise verbs, one telling detail instead of three vague adjectives.
- Dialogue carries subtext and gives each character a distinct voice; no one explains what both speakers already know.
- Keep the power system consistent: abilities have costs and limits, and victories are earned.
- Callbacks: let earlier events, promises and wounds echo, so a long serial feels like one story.
- Vary your language: do not reuse the same images, catchphrases or sentence openings you used recently; avoid clichés.
- No moralising, no author's notes, no summary of the chapter at the end.
- End on a hook that makes the next chapter irresistible.`;

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

/** The cast, capped: the core cast first, then the most recently introduced. */
function castBlock(outline: StoryOutline): string {
  const all = outline.characters;
  const cast = all.length > 36 ? [...all.slice(0, 14), ...all.slice(-22)] : all;
  return cast.map((c) => `- ${c.name} (${c.role}): ${c.profile}`).join("\n") || "- (introduce characters as the story needs them)";
}

function bibleBlock(outline: StoryOutline): string {
  return `Logline: ${outline.logline}

World, power system and tone:
${outline.world}

Cast:
${castBlock(outline)}`;
}

function arcLine(a: OutlineArc): string {
  return `- ${a.name} (chapters ${a.from}–${a.to}): ${a.summary}`;
}

/** The arc a chapter falls in, and the one after it. */
export function arcsAround(outline: StoryOutline, n: number): { current?: OutlineArc; next?: OutlineArc } {
  const arcs = outline.arcs ?? [];
  const i = arcs.findIndex((a) => n >= a.from && n <= a.to);
  if (i === -1) return {};
  return { current: arcs[i], next: arcs[i + 1] };
}

/** The newest recap that covers only chapters before `n` — never one that spoils what comes next. */
export function recapBefore(outline: StoryOutline, n: number): OutlineRecap | undefined {
  return (outline.recaps ?? []).filter((r) => r.through < n).sort((a, b) => b.through - a.through)[0];
}

function chapterLine(c: OutlineChapter): string {
  return `${c.n}. ${c.title} — ${c.summary}`;
}

/* --------------------------------- outline -------------------------------- */

export function buildOutlineSystem(title: string, project: WritingProject): string {
  const lang = languageName(project.language);
  const long = project.chapterCount > 150;
  return `You are a bestselling web-novel author and story architect planning a serialised novel of ${project.chapterCount} chapters, about ${project.wordsPerChapter} words each, written in ${lang}.

${premiseBlock(title, project)}

Point of view: ${POV_RULE[project.pov]}

The voice this novel will be written in:
${styleBlock(project)}

Planning principles:
- Serial fiction: every chapter must earn the click on the next. Each chapter has a goal, a complication, and ends on a hook (cliffhanger, reveal, reversal or emotional turn).
- ${long ? `This is a very long serial. Structure it as arcs (volumes) of roughly 40–150 chapters, each with its own antagonist, goal, mini-climax and change in the protagonist, while a larger mystery and power curve run across the whole book. Pace the power and scale so there is still room to grow at chapter ${project.chapterCount}.` : "Pace the arcs across the whole length: setup, escalation with mini-climaxes, a midpoint shift and a climax proportionate to the length."}
- Vary chapter types: action, investigation, training, intrigue, quiet character moments, revelations. Avoid repeating the same pattern chapter after chapter.
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
  const arcCount = Math.min(40, Math.max(3, Math.round(total / 80)));

  if (!existing) {
    return `Create the story bible, the whole-book arc roadmap, and plan chapters ${from}–${to} of ${total}.

Return exactly this shape:
{"title":"<the novel's title>","logline":"<one or two sentences>","world":"<setting, power system with its ranks/rules/costs, factions, tone — 150 to 300 words>","characters":[{"name":"","role":"protagonist / heroine / rival / mentor / antagonist …","profile":"<appearance, personality, goal, secret — 25 to 50 words>"}],"arcs":[{"name":"<arc title>","from":1,"to":<n>,"summary":"<the arc's conflict, turning points and how it changes the protagonist — 2 to 3 sentences>"}],"chapters":[{"n":${from},"title":"<chapter title>","summary":"<3 to 5 sentences: what happens, the turn, and the hook it ends on>"}],"recap":"<the story so far after chapter ${to}: key events, who knows what, open threads — at most 250 words>"}

Include 6 to 14 characters. The arcs must cover chapters 1–${total} contiguously with no gaps (about ${arcCount} arcs). Include every chapter from ${from} to ${to} exactly once, in order.`;
  }

  const recent = existing.chapters.filter((c) => c.n < from).slice(-12).map(chapterLine).join("\n");
  const recap = recapBefore(existing, from + 1);
  const { current, next } = arcsAround(existing, from);
  const roadmap = (existing.arcs ?? []).length
    ? (existing.arcs ?? []).map(arcLine).join("\n")
    : "(no roadmap yet)";

  return `Story bible:
${bibleBlock(existing)}

Arc roadmap for the whole book:
${roadmap}

${recap ? `The story so far (through chapter ${recap.through}):\n${recap.text}\n\n` : ""}Most recent planned chapters:
${recent || "(none)"}

Continue the plan: chapters ${from}–${to} of ${total}.${current ? ` These chapters belong to the arc "${current.name}" (chapters ${current.from}–${current.to})${to > current.to && next ? ` and move into "${next.name}"` : ""}; hit that arc's beats at the right pace.` : ""} Keep continuity with everything above and escalate${to >= total ? ` — chapter ${total} is the finale and must resolve the main conflict` : ""}.

Return exactly this shape:
{"chapters":[{"n":${from},"title":"","summary":"<3 to 5 sentences ending on the hook>"}],"recap":"<the story so far after chapter ${to}, updated with these chapters — at most 250 words>","newCharacters":[{"name":"","role":"","profile":""}]}

Include every chapter from ${from} to ${to} exactly once, in order. "newCharacters" lists only important characters introduced in these chapters (it may be empty).`;
}

/* --------------------------------- chapters -------------------------------- */

/**
 * Identical for every chapter of the novel, so it is sent as a cacheable
 * system prompt: persona, voice, craft rules and the story bible.
 */
export function buildChapterSystem(title: string, project: WritingProject): string {
  const outline = project.outline!;
  const lang = languageName(project.language);
  return `You are the author of the serialised web novel "${title}", writing in ${lang}. Your chapters are bestsellers: immersive, emotionally gripping, impossible to stop reading.

The voice of this novel:
${styleBlock(project)}

Point of view: ${POV_RULE[project.pov]}
${project.language === "th" ? THAI_CRAFT : GENERIC_CRAFT}
${QUALITY_BAR}

Story bible — canon for every chapter:
${premiseBlock(title, project)}

${bibleBlock(outline)}

Writing rules:
- Stay consistent with the bible, the story so far and the plans: names, relationships, abilities, rules and established facts.
- Follow the chapter plan you are given, but you may add small scenes, texture and dialogue that serve it. Never advance the plot beyond this chapter's plan — later chapters are already planned.

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
  const before = outline.chapters.filter((c) => c.n < n && c.n >= n - PLAN_WINDOW);
  const next = outline.chapters.find((c) => c.n === n + 1);
  const recap = recapBefore(outline, n);
  const { current } = arcsAround(outline, n);
  const words = Math.round(project.wordsPerChapter / parts);
  const thai = project.language === "th";

  const sections: string[] = [];

  if (current) {
    sections.push(`Current arc: "${current.name}" (chapters ${current.from}–${current.to}; this is chapter ${n - current.from + 1} of ${current.to - current.from + 1} in it). ${current.summary}`);
  }
  if (recap) {
    // The recap may stop a few chapters short; the plans below fill the gap.
    sections.push(`The story so far (through chapter ${recap.through}):\n${recap.text}`);
  }
  if (before.length) {
    sections.push(`The most recent chapters:\n${before.map(chapterLine).join("\n")}`);
  }

  sections.push(
    `THIS CHAPTER — ${n} of ${project.chapterCount}: ${plan?.title ?? ""}\nPlan: ${plan?.summary || "Continue the story naturally from where it left off, advancing the current arc."}`,
  );
  if (next) {
    sections.push(`Next chapter (for foreshadowing only — do NOT write it): ${next.title} — ${next.summary}`);
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

/* --------------------------- request trimming ------------------------------ */

/**
 * Only what a prompt reads travels with each request. A 4,000-chapter plan
 * and the map of written chapter ids would otherwise be uploaded, in full,
 * with every single call.
 */
export function slimProject(
  project: WritingProject,
  from: number,
  to: number,
  /** keep the recap the prompt for this chapter will read — never a later one */
  recapFor: number,
): WritingProject {
  const outline = project.outline;
  return {
    ...project,
    chapterIds: {},
    outline: outline
      ? {
          ...outline,
          chapters: outline.chapters.filter((c) => c.n >= from && c.n <= to),
          recaps: (() => {
            const r = recapBefore(outline, recapFor);
            return r ? [r] : [];
          })(),
        }
      : null,
  };
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
    .split(/\r?\n/)
    .map((p) => p.replace(/^#{1,6}\s+/, "").trim())
    .filter(Boolean);
}
