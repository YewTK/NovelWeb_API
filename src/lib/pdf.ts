"use client";

/**
 * Client-side PDF reading. The file is parsed in the browser and never
 * uploaded anywhere — only the text the reader chooses to translate is ever
 * sent on, exactly like pasted text.
 */

export interface PdfChapter {
  /** Heading line the split was made on, or a generated fallback. */
  title: string;
  paragraphs: string[];
  charCount: number;
}

export interface PdfDocument {
  fileName: string;
  pageCount: number;
  chapters: PdfChapter[];
}

/* ------------------------------- extraction ------------------------------- */

type TextItem = { str: string; hasEOL?: boolean };

/** pdf.js ships as ESM with a separate worker; both are pulled in on demand. */
async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();
  return pdfjs;
}

/** Reads every page and returns its lines, already trimmed. */
async function readLines(
  file: File,
  onProgress?: (page: number, total: number) => void,
): Promise<{ pages: string[][]; pageCount: number }> {
  const pdfjs = await loadPdfJs();
  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;

  const pages: string[][] = [];
  const pageCount = doc.numPages;

  for (let n = 1; n <= pageCount; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();

    const lines: string[] = [];
    let line = "";

    for (const raw of content.items as TextItem[]) {
      if (typeof raw.str !== "string") continue;
      line += raw.str;
      if (raw.hasEOL) {
        lines.push(line.trim());
        line = "";
      }
    }
    if (line.trim()) lines.push(line.trim());

    pages.push(lines);
    page.cleanup();
    onProgress?.(n, pageCount);
  }

  await doc.destroy();
  return { pages, pageCount };
}

/* ------------------------------- cleaning --------------------------------- */

const PAGE_NUMBER = /^[-–—\s]*\d{1,4}[-–—\s]*$/;

/**
 * Running heads and page numbers repeat on most pages and would otherwise be
 * spliced into the prose as stray paragraphs.
 */
export function dropFurniture(pages: string[][]): string[][] {
  const seen = new Map<string, number>();
  for (const lines of pages) {
    // Only the outer edges of a page can be a running head or foot.
    for (const candidate of [...lines.slice(0, 1), ...lines.slice(-1)]) {
      if (!candidate || candidate.length > 90) continue;
      seen.set(candidate, (seen.get(candidate) ?? 0) + 1);
    }
  }

  const threshold = Math.max(3, Math.floor(pages.length * 0.4));
  const furniture = new Set(
    [...seen.entries()].filter(([, n]) => n >= threshold).map(([text]) => text),
  );

  return pages.map((lines) =>
    lines.filter((l) => l && !PAGE_NUMBER.test(l) && !furniture.has(l)),
  );
}

/* ------------------------------- paragraphs ------------------------------- */

const SENTENCE_END = /[.!?…"'”’)\]】」』]\s*$/;
const THAI_END = /[ๆ)\]"'”’]\s*$/;

/**
 * PDFs break prose at the page's right margin, not at paragraph ends, so the
 * lines have to be sewn back together. A line that stops well short of the
 * body width is treated as the end of its paragraph.
 */
export function joinParagraphs(lines: string[]): string[] {
  if (!lines.length) return [];

  const widths = lines.map((l) => l.length).sort((a, b) => a - b);
  const median = widths[Math.floor(widths.length / 2)] || 60;
  const shortLine = median * 0.72;

  const paragraphs: string[] = [];
  let buffer = "";

  const flush = () => {
    const text = buffer.replace(/\s+/g, " ").trim();
    if (text) paragraphs.push(text);
    buffer = "";
  };

  for (const line of lines) {
    if (!line) {
      flush();
      continue;
    }

    // An indented or bulleted line always opens a new paragraph.
    if (buffer && /^[฀-๿\w"'“‘]/.test(line) === false) {
      flush();
    }

    buffer = buffer ? `${buffer} ${line}` : line;

    const ended =
      line.length < shortLine &&
      (SENTENCE_END.test(line) || THAI_END.test(line) || line.length < median * 0.5);
    if (ended) flush();
  }

  flush();
  return paragraphs;
}

/* -------------------------------- chapters -------------------------------- */

const HEADINGS: RegExp[] = [
  /^(chapter|chap\.?|ch\.?)\s*[-–—:.]?\s*[\divxlcIVXLC]/i,
  /^(episode|epis\.?|ep\.?)\s*[-–—:.]?\s*\d/i,
  /^(part|vol\.?|volume|book)\s*[-–—:.]?\s*[\divxlcIVXLC]/i,
  /^(prologue|epilogue|interlude|afterword|foreword|preface)\b/i,
  /^(บทที่|ตอนที่|ตอน|บท)\s*[-–—:.]?\s*[\d๐-๙]/,
  /^(บทนำ|บทส่งท้าย|อารัมภบท|ปัจฉิมบท)/,
  /^第\s*[\d一二三四五六七八九十百千零两]+\s*[章话回節节]/,
  /^제\s*[\d]+\s*[화장]/,
];

/** A short standalone line that announces a new chapter. */
function isHeading(line: string): boolean {
  const text = line.trim();
  if (!text || text.length > 80) return false;
  return HEADINGS.some((re) => re.test(text));
}

/**
 * Cuts the document at its chapter headings. When a PDF has none, the whole
 * thing comes back as one chapter so the reader can still translate it.
 */
export function splitChapters(pages: string[][], fallbackName: string): PdfChapter[] {
  const flat: string[] = [];
  for (const lines of pages) {
    flat.push(...lines);
    // A page break is at least a paragraph break.
    flat.push("");
  }

  const chapters: PdfChapter[] = [];
  let title = "";
  let body: string[] = [];

  const close = () => {
    const paragraphs = joinParagraphs(body);
    if (!paragraphs.length) return;
    chapters.push({
      title: title || `${fallbackName} — ตอนที่ ${chapters.length + 1}`,
      paragraphs,
      charCount: paragraphs.reduce((n, p) => n + p.length, 0),
    });
  };

  for (const line of flat) {
    if (isHeading(line)) {
      close();
      title = line.trim();
      body = [];
      continue;
    }
    body.push(line);
  }
  close();

  if (!chapters.length) return [];

  // A heading on the very first line leaves no front matter; otherwise the
  // text before the first heading is the book's own opening.
  return chapters;
}

/* --------------------------------- public --------------------------------- */

export async function readPdf(
  file: File,
  onProgress?: (page: number, total: number) => void,
): Promise<PdfDocument> {
  const { pages, pageCount } = await readLines(file, onProgress);
  const cleaned = dropFurniture(pages);
  const baseName = file.name.replace(/\.pdf$/i, "").trim() || "PDF";

  const chapters = splitChapters(cleaned, baseName);

  if (!chapters.length) {
    throw new Error(
      "อ่านข้อความจาก PDF ไม่ได้ — ไฟล์นี้อาจเป็นภาพสแกน ซึ่งต้องผ่าน OCR ก่อน",
    );
  }

  return { fileName: baseName, pageCount, chapters };
}
