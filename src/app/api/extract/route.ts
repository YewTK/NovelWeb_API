import { NextResponse } from "next/server";
import { fetchHtml } from "@/lib/fetch-page";
import { extractFromHtml } from "@/lib/extract";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { url } = (await req.json()) as { url?: string };
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "กรุณาระบุลิงก์" }, { status: 400 });
    }

    const { html, finalUrl } = await fetchHtml(url);
    const result = extractFromHtml(html, finalUrl);

    if (result.paragraphs.length === 0 || result.charCount < 120) {
      return NextResponse.json(
        {
          error:
            "ดึงเนื้อหาจากหน้านี้ไม่ได้ (อาจโหลดด้วย JavaScript หรือมีระบบกันบอท) — ลองคัดลอกเนื้อหามาวางในแท็บ “วางข้อความ”",
        },
        { status: 422 },
      );
    }

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "ดึงเนื้อหาไม่สำเร็จ";
    const status = /ไม่อนุญาต|ไม่ถูกต้อง|เฉพาะลิงก์/.test(message) ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
