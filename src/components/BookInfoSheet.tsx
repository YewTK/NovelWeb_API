"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { BookInfo, Series } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button, Field, Segmented, Sheet, inputClass } from "./ui";

const GENRE_SUGGESTIONS = [
  "แฟนตาซี",
  "กำลังภายใน",
  "เซียน/บำเพ็ญเพียร",
  "ต่างโลก",
  "เกิดใหม่",
  "ระบบ",
  "แอ็กชัน",
  "โรแมนติก",
  "ดราม่า",
  "ย้อนยุค",
  "สืบสวน",
  "สยองขวัญ",
  "ไซไฟ",
  "ตลก",
  "Boys Love",
  "Girls Love",
];

const LANGUAGES = ["อังกฤษ", "จีน", "เกาหลี", "ญี่ปุ่น", "เวียดนาม", "อินโดนีเซีย"];

export interface BookDraft {
  name: string;
  info: BookInfo;
}

/**
 * Reference details for one novel. Everything here is optional and written by
 * the reader; the synopsis and translator notes also steer every translation.
 */
export function BookInfoSheet({
  series,
  onClose,
  onSave,
}: {
  series: Series | null;
  onClose: () => void;
  onSave: (draft: BookDraft) => void;
}) {
  const [name, setName] = useState("");
  const [info, setInfo] = useState<BookInfo>({});
  const [genreDraft, setGenreDraft] = useState("");

  useEffect(() => {
    if (!series) return;
    setName(series.name);
    setInfo(series.info ?? {});
    setGenreDraft("");
  }, [series]);

  const patch = (p: Partial<BookInfo>) => setInfo((i) => ({ ...i, ...p }));
  const genres = info.genres ?? [];

  const addGenre = (g: string) => {
    const tag = g.trim();
    if (!tag || genres.includes(tag)) return;
    patch({ genres: [...genres, tag] });
    setGenreDraft("");
  };

  const save = () => {
    const clean: BookInfo = {
      originalTitle: info.originalTitle?.trim() || undefined,
      author: info.author?.trim() || undefined,
      genres: genres.length ? genres : undefined,
      status: info.status || undefined,
      sourceLanguage: info.sourceLanguage?.trim() || undefined,
      synopsis: info.synopsis?.trim() || undefined,
      translatorNotes: info.translatorNotes?.trim() || undefined,
      sourceUrl: info.sourceUrl?.trim() || undefined,
    };
    onSave({ name: name.trim() || series?.name || "", info: clean });
  };

  return (
    <Sheet
      open={Boolean(series)}
      onClose={onClose}
      title="ข้อมูลหนังสือ"
      description="ใส่ไว้เป็นข้อมูลอ้างอิง — เรื่องย่อและโน้ตผู้แปลจะถูกส่งให้ AI ทุกตอน ช่วยให้สำนวนและสรรพนามถูกต้องขึ้น"
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" size="lg" className="flex-1" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button variant="primary" size="lg" className="flex-[2]" onClick={save}>
            บันทึก
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <Field label="ชื่อเรื่อง (ภาษาไทย)">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            enterKeyHint="next"
          />
        </Field>

        <Field label="ชื่อต้นฉบับ">
          <input
            value={info.originalTitle ?? ""}
            onChange={(e) => patch({ originalTitle: e.target.value })}
            placeholder="เช่น Shadow Slave / 诡秘之主"
            className={inputClass}
            enterKeyHint="next"
          />
        </Field>

        <Field label="ผู้แต่ง">
          <input
            value={info.author ?? ""}
            onChange={(e) => patch({ author: e.target.value })}
            placeholder="เช่น Guiltythree"
            className={inputClass}
            enterKeyHint="next"
          />
        </Field>

        <Field label="สถานะ">
          <Segmented<NonNullable<BookInfo["status"]>>
            value={info.status ?? ""}
            onChange={(status) => patch({ status })}
            options={[
              { value: "", label: "ไม่ระบุ" },
              { value: "ongoing", label: "ยังไม่จบ" },
              { value: "completed", label: "จบแล้ว" },
              { value: "hiatus", label: "หยุดพัก" },
            ]}
          />
        </Field>

        <Field label="ภาษาต้นฉบับ">
          <div className="flex flex-wrap gap-1.5">
            {LANGUAGES.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => patch({ sourceLanguage: info.sourceLanguage === l ? "" : l })}
                className={cn(
                  "h-9 rounded-lg border px-3 text-[13px] transition-colors",
                  info.sourceLanguage === l
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] font-medium text-[var(--accent)]"
                    : "border-[var(--line)] text-[var(--fg-muted)] hover:border-[var(--fg-dim)]",
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </Field>

        <div>
          <p className="mb-2 text-[13px] font-medium text-[var(--fg-muted)]">แนวเรื่อง</p>
          {genres.length ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {genres.map((g) => (
                <span
                  key={g}
                  className="inline-flex h-8 items-center gap-1 rounded-full bg-[var(--accent-soft)] pl-3 pr-1 text-[13px] font-medium text-[var(--accent)]"
                >
                  {g}
                  <button
                    type="button"
                    onClick={() => patch({ genres: genres.filter((x) => x !== g) })}
                    aria-label={`เอา ${g} ออก`}
                    className="grid h-6 w-6 place-items-center rounded-full hover:bg-[var(--accent)]/15"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <input
            value={genreDraft}
            onChange={(e) => setGenreDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addGenre(genreDraft);
              }
            }}
            placeholder="พิมพ์แล้วกด Enter หรือเลือกด้านล่าง"
            className={inputClass}
            enterKeyHint="done"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {GENRE_SUGGESTIONS.filter((g) => !genres.includes(g)).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => addGenre(g)}
                className="h-8 rounded-full border border-[var(--line)] px-3 text-[12.5px] text-[var(--fg-muted)] transition-colors hover:border-[var(--fg-dim)] hover:text-[var(--fg)]"
              >
                + {g}
              </button>
            ))}
          </div>
        </div>

        <Field label="เรื่องย่อ">
          <textarea
            value={info.synopsis ?? ""}
            onChange={(e) => patch({ synopsis: e.target.value })}
            rows={5}
            placeholder="เรื่องราวโดยย่อของนิยาย"
            className={cn(inputClass, "resize-y leading-relaxed")}
          />
        </Field>

        <Field
          label="โน้ตสำหรับผู้แปล"
          hint="AI จะอ่านโน้ตนี้ก่อนแปลทุกตอน เช่น “ซันนี่เป็นผู้ชาย พูดกับตัวเองว่า ‘ฉัน’ ประชดประชัน” หรือ “เรื่องเล่าบุรุษที่หนึ่ง ใช้ ข้า/เจ้า”"
        >
          <textarea
            value={info.translatorNotes ?? ""}
            onChange={(e) => patch({ translatorNotes: e.target.value })}
            rows={5}
            placeholder={"- ตัวเอก: ชาย ใช้ 'ผม' กับคนแปลกหน้า 'ฉัน' กับเพื่อน\n- นางเอก: หญิง เรียกตัวเอกว่า 'นาย'"}
            className={cn(inputClass, "resize-y leading-relaxed")}
          />
        </Field>

        <Field label="ลิงก์หน้าหลักของเรื่อง">
          <input
            value={info.sourceUrl ?? ""}
            onChange={(e) => patch({ sourceUrl: e.target.value })}
            placeholder="https://…"
            type="url"
            inputMode="url"
            className={cn(inputClass, "font-mono")}
          />
        </Field>
      </div>
    </Sheet>
  );
}
