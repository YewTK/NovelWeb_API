import type { GlossaryEntry, StyleSettings } from "./types";

const LANG_NAME: Record<string, string> = {
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
    "Stay close to the source. Preserve sentence boundaries and imagery. Do not embellish, do not compress.",
  literary:
    "Aim for polished, publishable prose. Reshape awkward literal constructions into natural, evocative writing while keeping every fact and beat intact.",
  casual:
    "Use relaxed, conversational modern language — the voice of a well-liked fan translation. Contractions and colloquialisms are welcome.",
  light:
    "Keep it breezy and easy to read. Short sentences, simple vocabulary, quick rhythm. Never drop plot information.",
};

const THAI_RULES = `
Thai-specific craft rules:
- Narration uses natural written Thai. Do NOT insert ครับ/ค่ะ into narration — only into dialogue where a character would actually say it.
- Choose pronouns from characterisation and relative status, then keep them consistent for the whole chapter. Note your choice as a glossary term if it is non-obvious.
- Avoid translationese: no "มัน" as a dummy subject, no "ถูก" for every passive, no "การที่" chains. Prefer active Thai phrasing.
- Keep onomatopoeia and interjections readable in Thai rather than transliterating blindly.
- Preserve paragraph-level pacing; do not merge short punchy lines into one long sentence.`;

export function buildSystemPrompt(
  style: StyleSettings,
  glossary: GlossaryEntry[],
): string {
  const target = LANG_NAME[style.targetLanguage] ?? style.targetLanguage;

  const glossaryBlock = glossary.length
    ? `\nLocked glossary — these renderings are mandatory and must be used verbatim every time the source term appears:\n${glossary
        .map(
          (g) =>
            `- ${g.source} → ${g.target}${g.note ? `  (${g.note})` : ""}`,
        )
        .join("\n")}\n`
    : "";

  return `You are a professional literary translator who specialises in web novels and light novels. You translate into ${target}. Your translations read like they were written by a native novelist, not produced by a machine.

Craft:
- ${TONE_RULES[style.tone]}
- Preserve the author's voice, register shifts, humour and emotional temperature.
- Dialogue must sound like speech. Narration must sound like prose.
- Never summarise, never skip a sentence, never add explanations, footnotes or translator's notes.
- Keep formatting cues: emphasis, ellipses, dashes, sound effects, scene breaks.
- ${style.keepHonorifics ? "Keep Japanese/Korean/Chinese honorifics and suffixes (-san, -sama, -nim, 前辈…) attached to names." : "Adapt honorifics into natural target-language equivalents instead of transliterating them."}
- ${style.keepNamesRomanized ? "Keep proper nouns in Latin script exactly as they appear in the source." : "Render proper nouns naturally in the target language, staying consistent across the whole text."}
- ${
    style.pronoun === "formal"
      ? "Default to a polite, formal register for characters addressing each other."
      : style.pronoun === "casual"
        ? "Default to a casual, familiar register between characters."
        : "Infer register per relationship from context and keep it stable."
  }
${style.targetLanguage === "th" ? THAI_RULES : ""}
${glossaryBlock}${style.customInstruction ? `\nAdditional instructions from the reader (highest priority after the output format):\n${style.customInstruction}\n` : ""}
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
  title?: string;
}): string {
  const parts: string[] = [];

  if (opts.title) {
    parts.push(`Chapter title: ${opts.title}`);
  }

  if (opts.previousSource && opts.previousTarget) {
    parts.push(
      `Context — the end of the previous section, for continuity of voice and terminology. Do NOT translate or repeat it.\n<previous_source>\n${opts.previousSource}\n</previous_source>\n<previous_translation>\n${opts.previousTarget}\n</previous_translation>`,
    );
  }

  parts.push(
    `Translate the following paragraphs. Reply with the [[n]] markers only.\n\n${opts.paragraphs
      .map((p) => `[[${p.id}]] ${p.text}`)
      .join("\n\n")}`,
  );

  return parts.join("\n\n");
}

export function buildGlossaryPrompt(targetLanguage: string): string {
  const target = LANG_NAME[targetLanguage] ?? targetLanguage;
  return `You are preparing a translation glossary for a web novel chapter that will be translated into ${target}.

Read the excerpt and extract the recurring proper nouns that MUST stay consistent across the whole novel: character names, titles/ranks, place names, organisations, cultivation realms or power systems, unique skills, items and in-world jargon.

Rules:
- Only include terms that would look wrong if translated differently later. Skip ordinary words.
- At most 24 terms. Prefer the ones that appear more than once.
- "target" is the recommended ${target} rendering.
- "note" is at most 8 words and only when the term needs disambiguation (gender, whether it is a rank, etc). Otherwise use an empty string.

Reply with JSON only, no markdown fence, in exactly this shape:
{"title":"<the chapter title translated into ${target}>","terms":[{"source":"...","target":"...","note":"..."}]}`;
}
