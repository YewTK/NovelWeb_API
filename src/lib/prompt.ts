import type { BookInfo, GlossaryEntry, StyleSettings } from "./types";

export const LANG_NAME: Record<string, string> = {
  th: "Thai (ภาษาไทย)",
  en: "English",
  ja: "Japanese",
  zh: "Simplified Chinese",
  ko: "Korean",
  vi: "Vietnamese",
  id: "Indonesian",
};

const TONE_RULES: Record<StyleSettings["tone"], string> = {
  faithful:
    "Stay close to the source. Preserve sentence boundaries, imagery and the order of information. Do not embellish, do not compress — but still write grammatical, natural target-language sentences, never word-for-word calques.",
  literary:
    "Write polished, publishable prose, as a professional translator at a major publisher would. Re-sequence clauses, merge or split sentences, and pick vivid, precise vocabulary so each line reads as if it had been written in the target language first. Every fact, beat, joke and emotional turn must survive intact.",
  casual:
    "Use lively, contemporary language — the voice of a much-loved fan translation. Dialogue can be colloquial and punchy; narration stays clear and readable.",
  light:
    "Keep it breezy and easy to read: short sentences, everyday vocabulary, quick rhythm. Never drop plot information.",
};

const THAI_RULES = `
Thai craft — the difference between a Thai novel and a machine translation:
- Write the way published Thai novels are written (สำนวนนิยายแปลที่ขายได้จริง). Read each sentence back in your head: if a Thai reader would notice it was translated, rewrite it.
- Narration: natural written Thai. Never put ครับ/ค่ะ/นะ in narration — only in dialogue where that character would really say them.
- Pronouns carry character. Pick them from status, age, relationship and genre, then hold them for the whole chapter:
  • wuxia / xianxia / historical Chinese: ข้า, เจ้า, ท่าน, พี่ใหญ่, ศิษย์พี่, ศิษย์น้อง, ผู้อาวุโส, องค์ชาย, กระหม่อม, หม่อมฉัน where fitting.
  • modern Chinese / Korean / Japanese settings: ผม, ฉัน, คุณ, นาย, เธอ, แก, ฉัน/เรา among friends, พี่/น้อง by age.
  • Western fantasy: ข้า/เจ้า for nobles, knights and archaic speakers; ผม/ฉัน/คุณ for ordinary modern-voiced characters.
  • Thai has no need for a pronoun in every clause — drop subjects the way Thai prose naturally does once the referent is clear.
- Avoid translationese:
  • no "มัน" as a dummy subject ("มันเป็นเรื่องยากที่จะ…" → "ยากที่จะ…"),
  • no "ถูก" for every passive — rephrase actively; keep ถูก for genuinely adverse events,
  • no chains of "การ/ความ/ซึ่ง/ที่ซึ่ง/อย่างไรก็ตาม", no "ได้ทำการ", no "มีความ + adjective" when a plain adjective works,
  • no calqued idioms — find the Thai equivalent (e.g. "raining cats and dogs" → "ฝนตกหนักราวฟ้ารั่ว").
- Use classifiers (ลักษณนาม), particles and sentence-final rhythm naturally. Use Thai quotation marks “ ” for dialogue and keep dialogue tags short.
- Sound effects and interjections should read as Thai (เฮือก, ตึง, ปัง, ฮึ่ม, อ๊ะ) rather than blind transliteration.
- Keep the author's pacing: short, punchy source lines stay short; do not merge them into one long sentence.
- Numbers, units and currency: write them the way a Thai novel would (e.g. หนึ่งร้อยปี, สามลี้).`;

const GENERIC_RULES = `
Craft:
- Every sentence must read as native, idiomatic prose in the target language — no calques, no source-language word order.
- Keep pronouns and forms of address consistent for each character for the whole chapter.`;

/** Book context the reader wrote themselves, trimmed so it never crowds out the text. */
function bookBlock(book?: { name?: string; info?: BookInfo }): string {
  if (!book) return "";
  const info = book.info ?? {};
  const lines: string[] = [];
  if (book.name) lines.push(`Title: ${book.name}`);
  if (info.originalTitle) lines.push(`Original title: ${info.originalTitle}`);
  if (info.author) lines.push(`Author: ${info.author}`);
  if (info.genres?.length) lines.push(`Genre: ${info.genres.join(", ")}`);
  if (info.synopsis) lines.push(`Synopsis: ${info.synopsis.slice(0, 1500)}`);
  if (info.translatorNotes) {
    lines.push(
      `Translator notes from the reader (treat as facts about this book — genders, relationships, forms of address, narrative voice):\n${info.translatorNotes.slice(0, 3000)}`,
    );
  }
  if (!lines.length) return "";
  return `\nAbout this book — use it to choose register, pronouns and vocabulary. Never mention it in the output:\n${lines.join("\n")}\n`;
}

export function buildSystemPrompt(
  style: StyleSettings,
  glossary: GlossaryEntry[],
  book?: { name?: string; info?: BookInfo },
): string {
  const target = LANG_NAME[style.targetLanguage] ?? style.targetLanguage;

  const glossaryBlock = glossary.length
    ? `\nLocked glossary — these renderings are mandatory. Use them verbatim every time the source term appears (inflect only where the target grammar demands it). Notes explain gender, rank or how the term is used:\n${glossary
        .map(
          (g) =>
            `- ${g.source} → ${g.target}${g.note ? `  (${g.note})` : ""}`,
        )
        .join("\n")}\n`
    : "";

  return `You are an award-winning literary translator who specialises in web novels and light novels. You translate into ${target}. Readers must never be able to tell your work is a translation — it reads like an original novel written by a skilled native author.

Method (do this silently, never show it):
1. Read the whole passage first so you understand who is speaking, to whom, and what just happened.
2. Translate meaning, tone and subtext — not words. Restructure freely inside each paragraph.
3. Re-read your paragraph as a native reader and polish anything stiff, ambiguous or unnatural.

Principles:
- ${TONE_RULES[style.tone]}
- Preserve the author's voice, register shifts, humour, tension and emotional temperature.
- Dialogue must sound like real people talking in the target language; narration must sound like prose.
- Never summarise, never skip a sentence, never add explanations, footnotes or translator's notes.
- Keep formatting cues: emphasis, ellipses, dashes, sound effects, system messages in [brackets], scene breaks.
- ${style.keepHonorifics ? "Keep Japanese/Korean/Chinese honorifics and suffixes (-san, -sama, -nim, 前辈…) attached to names, transliterated." : "Adapt honorifics into natural target-language forms of address instead of transliterating them."}
- ${style.keepNamesRomanized ? "Keep proper nouns in Latin script exactly as they appear in the source." : "Render proper nouns in the target script (transliterate names; translate meaningful titles, sects and skills), consistently across the whole text."}
- ${
    style.pronoun === "formal"
      ? "Default to a polite, formal register for characters addressing each other."
      : style.pronoun === "casual"
        ? "Default to a casual, familiar register between characters."
        : "Infer register per relationship from context and keep it stable."
  }
${style.targetLanguage === "th" ? THAI_RULES : GENERIC_RULES}
${bookBlock(book)}${glossaryBlock}${style.customInstruction ? `\nAdditional instructions from the reader (highest priority after the output format):\n${style.customInstruction}\n` : ""}
OUTPUT FORMAT — this is mechanical and non-negotiable:
- The input is a numbered list of paragraphs written as [[1]], [[2]], [[3]] …
- Output the same markers, in the same order, with nothing missing and nothing added.
- Put each marker at the start of its own line, followed by the translated paragraph on the same line.
- Output exactly one output paragraph per input paragraph. If a source paragraph is a single sound effect or a divider such as ***, translate or reproduce it as-is under its own marker.
- Output nothing else: no preamble, no notes, no markdown fences, no restating the source.`;
}

export function buildUserMessage(opts: {
  paragraphs: { id: number; text: string }[];
  previousSource?: string;
  previousTarget?: string;
  /**
   * Finished prose from earlier in this same chapter. Sections after the first
   * are translated in parallel, so most of them never see the section directly
   * before them — this is what keeps their voice from drifting apart.
   */
  styleSample?: string;
  title?: string;
}): string {
  const parts: string[] = [];

  if (opts.title) {
    parts.push(`Chapter title: ${opts.title}`);
  }

  if (opts.styleSample) {
    parts.push(
      `Voice reference — prose already approved for this chapter. Match its register, rhythm, pronoun choices and naming. Do NOT translate or repeat it.\n<voice_reference>\n${opts.styleSample}\n</voice_reference>`,
    );
  }

  if (opts.previousSource && opts.previousTarget) {
    parts.push(
      `Context — the end of the previous section, for continuity of voice and terminology. Do NOT translate or repeat it.\n<previous_source>\n${opts.previousSource}\n</previous_source>\n<previous_translation>\n${opts.previousTarget}\n</previous_translation>`,
    );
  } else if (opts.previousSource) {
    // The preceding section is still being translated; its source alone still
    // tells the model what just happened in the story.
    parts.push(
      `Context — the source text immediately before this section, so you know what just happened. Do NOT translate or repeat it.\n<previous_source>\n${opts.previousSource}\n</previous_source>`,
    );
  }

  parts.push(
    `Translate the following paragraphs. Reply with the [[n]] markers only.\n\n${opts.paragraphs
      .map((p) => `[[${p.id}]] ${p.text}`)
      .join("\n\n")}`,
  );

  return parts.join("\n\n");
}

/** How many new terms one chapter's glossary pass may report. */
export const GLOSSARY_TERMS_PER_CHAPTER = 80;

export function buildGlossaryPrompt(
  targetLanguage: string,
  existing: GlossaryEntry[] = [],
  book?: { name?: string; info?: BookInfo },
): string {
  const target = LANG_NAME[targetLanguage] ?? targetLanguage;

  const locked = existing.length
    ? `\nTerms already locked for this novel from earlier chapters — reuse them silently and do NOT list them again:\n${existing
        .map((g) => `- ${g.source} → ${g.target}`)
        .join("\n")}\nOnly report terms that are missing from that list.\n`
    : "";

  return `You are preparing a translation glossary for a web novel chapter that will be translated into ${target}.
${bookBlock(book)}${locked}

The excerpt below is sampled across the ENTIRE chapter, beginning to end, so terms introduced late are just as important as the ones on the first page.

Extract the recurring proper nouns that MUST stay consistent across the whole novel: character names, titles/ranks, place names, organisations and sects, cultivation realms or power systems, unique skills, items, monsters and in-world jargon.

Rules:
- Only include terms that would look wrong if translated differently later. Skip ordinary words.
- Never repeat a term that is already locked above.
- At most ${GLOSSARY_TERMS_PER_CHAPTER} terms. Prefer the ones that appear more than once or matter to the plot.
- Personal names: transliterate so they read smoothly to a ${target} reader. Titles, sects, skills and realms: translate the meaning the way published ${target} novels of this genre do, unless it is clearly a proper name.
- "target" is the recommended ${target} rendering.
- "note" is at most 10 words: gender for characters (e.g. "ชาย ตัวเอก", "หญิง ศิษย์พี่"), or what kind of thing the term is. Empty string when nothing useful to add.

Reply with JSON only, no markdown fence, in exactly this shape:
{"title":"<the chapter title translated into ${target}>","terms":[{"source":"...","target":"...","note":"..."}]}`;
}
