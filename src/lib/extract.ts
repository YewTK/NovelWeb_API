import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import type { ExtractResult } from "./types";

/** Selectors used by the majority of web-novel CMSes and aggregators. */
const CONTENT_SELECTORS = [
  "#chapter-content",
  ".chapter-content",
  "#chapterContent",
  ".chapter__content",
  ".reading-content .text-left",
  ".entry-content",
  ".article-content",
  ".post-content",
  "#content",
  "#htmlContent",
  ".content",
  "#nr1",
  "#nr",
  "#booktxt",
  "#BookText",
  ".novel-content",
  ".novel_content",
  "#article",
  ".chapter-c",
  "#chaptercontent",
  ".txtnav",
  "#TextContent",
  "article",
];

const NEXT_PATTERNS =
  /(next\s*(chapter|page|ch\.?)?|下一[章節页頁]|下一篇|次[のへ]?[章話ページ]|다음\s*(화|장|회)?|บทต่อไป|ตอนต่อไป|ถัดไป|→|»)/i;
const PREV_PATTERNS =
  /(prev(ious)?\s*(chapter|page)?|上一[章節页頁]|上一篇|前[のへ]?[章話ページ]|이전\s*(화|장|회)?|บทก่อนหน้า|ตอนก่อนหน้า|ก่อนหน้า|←|«)/i;

const JUNK_LINE =
  /^(advertisement|广告|請記住本站|请记住本站|本章未完|手機閱讀|手机阅读|加入書籤|加入书签|翻页|上一章|下一章|目录|目錄|home|report chapter|report error|bookmark)$/i;

function cleanText(s: string): string {
  return s
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

function nodeToParagraphs(el: Element, doc: Document): string[] {
  el.querySelectorAll(
    "script,style,noscript,iframe,ins,form,button,svg,figure,figcaption,nav,aside,.ads,.ad,[class*='banner'],[id*='banner'],[class*='advert'],[id*='advert'],[class*='share'],[class*='comment']",
  ).forEach((n) => n.remove());

  const ps = Array.from(el.querySelectorAll("p"));
  let raw: string[];

  if (ps.length >= 3) {
    raw = ps.map((p) => cleanText(p.textContent ?? ""));
  } else {
    // <br>-separated chapters: replace breaks with newlines, then split.
    const clone = el.cloneNode(true) as Element;
    clone.querySelectorAll("br").forEach((br) => {
      br.replaceWith(doc.createTextNode("\n"));
    });
    clone.querySelectorAll("div,h1,h2,h3,h4,li,blockquote").forEach((d) => {
      d.append(doc.createTextNode("\n"));
    });
    raw = cleanText(clone.textContent ?? "").split(/\n+/);
  }

  return raw
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !JUNK_LINE.test(t));
}

function scoreCandidate(el: Element): number {
  const text = el.textContent ?? "";
  const links = Array.from(el.querySelectorAll("a"))
    .map((a) => a.textContent?.length ?? 0)
    .reduce((a, b) => a + b, 0);
  // Long text, few link characters — that's a chapter body.
  return text.length - links * 3;
}

function findLink(doc: Document, base: URL, pattern: RegExp, rel: string): string | null {
  const relLink = doc.querySelector(`a[rel="${rel}"]`) as HTMLAnchorElement | null;
  const anchors = Array.from(doc.querySelectorAll("a[href]")) as HTMLAnchorElement[];
  const candidates = relLink ? [relLink, ...anchors] : anchors;

  for (const a of candidates) {
    const label = `${a.textContent ?? ""} ${a.getAttribute("title") ?? ""} ${a.id} ${a.className}`;
    if (a === relLink || pattern.test(label)) {
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) continue;
      try {
        const abs = new URL(href, base);
        if (abs.toString() === base.toString()) continue;
        if (abs.protocol !== "http:" && abs.protocol !== "https:") continue;
        return abs.toString();
      } catch {
        continue;
      }
    }
  }
  return null;
}

export function extractFromHtml(html: string, finalUrl: string): ExtractResult {
  const dom = new JSDOM(html, { url: finalUrl });
  const doc = dom.window.document;
  const base = new URL(finalUrl);

  doc.querySelectorAll("script,style,noscript,template").forEach((n) => n.remove());

  let paragraphs: string[] = [];

  // 1. Known chapter containers.
  for (const sel of CONTENT_SELECTORS) {
    const el = doc.querySelector(sel);
    if (!el) continue;
    const p = nodeToParagraphs(el, doc);
    const chars = p.join("").length;
    if (chars > 400 && chars > paragraphs.join("").length) paragraphs = p;
    if (paragraphs.join("").length > 1500) break;
  }

  // 2. Readability.
  if (paragraphs.join("").length < 400) {
    try {
      const article = new Readability(doc.cloneNode(true) as Document, {
        charThreshold: 200,
      }).parse();
      if (article?.content) {
        const frag = new JSDOM(`<div id="r">${article.content}</div>`).window.document;
        const p = nodeToParagraphs(frag.getElementById("r")!, frag);
        if (p.join("").length > paragraphs.join("").length) paragraphs = p;
      }
    } catch {
      /* fall through */
    }
  }

  // 3. Densest block on the page.
  if (paragraphs.join("").length < 400) {
    let best: Element | null = null;
    let bestScore = 0;
    doc.querySelectorAll("div,section,article,td").forEach((el) => {
      const s = scoreCandidate(el);
      if (s > bestScore) {
        bestScore = s;
        best = el;
      }
    });
    if (best) paragraphs = nodeToParagraphs(best, doc);
  }

  const rawTitle =
    doc.querySelector("h1")?.textContent ??
    doc.querySelector(".chapter-title, .entry-title, #chapter-title, .bookname h1")?.textContent ??
    doc.querySelector('meta[property="og:title"]')?.getAttribute("content") ??
    doc.title ??
    "";

  const siteName =
    doc.querySelector('meta[property="og:site_name"]')?.getAttribute("content") ??
    base.hostname.replace(/^www\./, "");

  const byline =
    doc.querySelector('meta[name="author"]')?.getAttribute("content") ??
    doc.querySelector('[rel="author"], .author, .byline')?.textContent?.trim() ??
    null;

  const result: ExtractResult = {
    title: cleanText(rawTitle).replace(/\s+/g, " ").slice(0, 200) || "ไม่ระบุชื่อตอน",
    siteName,
    byline: byline ? cleanText(byline).slice(0, 100) : null,
    url: finalUrl,
    paragraphs,
    charCount: paragraphs.join("").length,
    nextUrl: findLink(doc, base, NEXT_PATTERNS, "next"),
    prevUrl: findLink(doc, base, PREV_PATTERNS, "prev"),
  };

  dom.window.close();
  return result;
}

/** Turns pasted plain text into the same shape as a scraped page. */
export function extractFromText(text: string, title?: string): ExtractResult {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n|\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const first = lines[0] ?? "";
  const inferredTitle =
    title?.trim() ||
    (first.length > 0 && first.length <= 90 ? first : "ข้อความที่วางไว้");
  const body = !title?.trim() && inferredTitle === first ? lines.slice(1) : lines;

  return {
    title: inferredTitle,
    siteName: null,
    byline: null,
    url: "",
    paragraphs: body,
    charCount: body.join("").length,
    nextUrl: null,
    prevUrl: null,
  };
}
