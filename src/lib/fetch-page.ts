import dns from "node:dns/promises";
import net from "node:net";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  const v = ip.toLowerCase();
  return (
    v === "::1" ||
    v === "::" ||
    v.startsWith("fc") ||
    v.startsWith("fd") ||
    v.startsWith("fe80") ||
    v.startsWith("::ffff:127.") ||
    v.startsWith("::ffff:10.") ||
    v.startsWith("::ffff:192.168.")
  );
}

/** Blocks loopback / private-network targets so the extractor can't be used as an SSRF proxy. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("ลิงก์ไม่ถูกต้อง");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("รองรับเฉพาะลิงก์ http/https");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local")
  ) {
    throw new Error("ไม่อนุญาตให้เข้าถึงที่อยู่ภายในเครือข่าย");
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error("ไม่อนุญาตให้เข้าถึงที่อยู่ภายในเครือข่าย");
    return url;
  }
  try {
    const records = await dns.lookup(host, { all: true });
    if (records.some((r) => isPrivateIp(r.address))) {
      throw new Error("ไม่อนุญาตให้เข้าถึงที่อยู่ภายในเครือข่าย");
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("ไม่อนุญาต")) throw e;
    throw new Error("หาที่อยู่ของเว็บไซต์นี้ไม่เจอ");
  }
  return url;
}

function charsetFromMeta(bytes: Uint8Array): string | null {
  // Sniff the first 4KB as latin1 — enough to find <meta charset>.
  const head = Buffer.from(bytes.slice(0, 4096)).toString("latin1");
  const m =
    head.match(/<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)/i) ??
    head.match(/content\s*=\s*["'][^"']*charset\s*=\s*([\w-]+)/i);
  return m ? m[1].toLowerCase() : null;
}

function decode(bytes: Uint8Array, charset: string | null): string {
  const candidates = [charset, "utf-8"].filter(Boolean) as string[];
  for (const cs of candidates) {
    try {
      const dec = new TextDecoder(cs === "utf8" ? "utf-8" : cs, { fatal: false });
      return dec.decode(bytes);
    } catch {
      /* try next */
    }
  }
  return Buffer.from(bytes).toString("utf-8");
}

export async function fetchHtml(raw: string): Promise<{ html: string; finalUrl: string }> {
  const url = await assertPublicUrl(raw);

  const res = await fetch(url, {
    headers: {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en,th;q=0.9,ja;q=0.8,zh;q=0.8,ko;q=0.7",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    throw new Error(
      res.status === 403 || res.status === 401
        ? "เว็บนี้บล็อกการดึงข้อมูลอัตโนมัติ ลองคัดลอกเนื้อหามาวางแทน"
        : `เปิดลิงก์ไม่สำเร็จ (HTTP ${res.status})`,
    );
  }

  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > 8 * 1024 * 1024) throw new Error("หน้าเว็บใหญ่เกินไป");

  const header = res.headers.get("content-type") ?? "";
  const headerCharset = header.match(/charset=([\w-]+)/i)?.[1]?.toLowerCase() ?? null;
  const charset =
    headerCharset && headerCharset !== "utf-8" ? headerCharset : charsetFromMeta(buf) ?? headerCharset;

  return { html: decode(buf, charset), finalUrl: res.url || url.toString() };
}
