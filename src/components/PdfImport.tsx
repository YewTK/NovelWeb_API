"use client";

import { useRef, useState } from "react";
import {
  CheckSquare,
  FileText,
  Library,
  Loader2,
  Square,
  Upload,
} from "lucide-react";
import { buildChunks } from "@/lib/chunk";
import { estimateJob, formatUsd } from "@/lib/cost";
import { readPdf, type PdfChapter } from "@/lib/pdf";
import type { ProviderConfig } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ShelfPicker, type ShelfOption } from "./ShelfPicker";
import { Button, Sheet } from "./ui";

type Stage = "pick" | "reading" | "review";

export interface PdfImportResult {
  chapters: PdfChapter[];
  seriesId: string;
  /** Name to file the chapters under when no existing shelf was chosen. */
  bookName: string;
}

export function PdfImport({
  open,
  onClose,
  shelves,
  config,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  shelves: ShelfOption[];
  config: ProviderConfig;
  onImport: (result: PdfImportResult) => void;
}) {
  const [stage, setStage] = useState<Stage>("pick");
  const [progress, setProgress] = useState({ page: 0, total: 0 });
  const [chapters, setChapters] = useState<PdfChapter[]>([]);
  const [bookName, setBookName] = useState("");
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [shelfId, setShelfId] = useState("");
  const [pickingShelf, setPickingShelf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStage("pick");
    setChapters([]);
    setChosen(new Set());
    setBookName("");
    setError(null);
    setProgress({ page: 0, total: 0 });
  };

  const close = () => {
    onClose();
    // Let the sheet finish closing before the contents snap back.
    setTimeout(reset, 200);
  };

  const handleFile = async (file: File) => {
    setError(null);
    setStage("reading");
    setProgress({ page: 0, total: 0 });

    try {
      const doc = await readPdf(file, (page, total) =>
        setProgress({ page, total }),
      );
      setChapters(doc.chapters);
      setBookName(doc.fileName);
      setChosen(new Set(doc.chapters.map((_, i) => i)));
      setStage("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "อ่านไฟล์ไม่สำเร็จ");
      setStage("pick");
    }
  };

  const toggle = (index: number) => {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const allChosen = chosen.size === chapters.length && chapters.length > 0;

  const shelf = shelves.find((s) => s.series.id === shelfId) ?? null;
  const selected = chapters.filter((_, i) => chosen.has(i));
  const totalChars = selected.reduce((n, c) => n + c.charCount, 0);

  // Importing a whole book can be a real bill — show it before the queue starts.
  const cost = selected.reduce<number | null>((sum, c) => {
    if (sum === null) return null;
    const bill = estimateJob(c.paragraphs, buildChunks(c.paragraphs).length, config);
    return bill.usd === null ? null : sum + bill.usd;
  }, 0);

  return (
    <Sheet
      open={open}
      onClose={close}
      side="bottom"
      title="นำเข้านิยายจาก PDF"
      description="ไฟล์ถูกอ่านในเครื่องคุณเอง ไม่มีการอัปโหลดไปไหน — ระบบจะแยกเป็นรายตอนให้อัตโนมัติ"
    >
      <div className="mx-auto max-w-[560px] space-y-4 pb-4">
        {/* ------------------------------- pick ------------------------------- */}
        {stage === "pick" ? (
          <>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center gap-2.5 rounded-2xl border border-dashed border-[var(--line)] bg-[var(--bg)] px-4 py-10 transition-colors hover:border-[var(--accent)]"
            >
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--accent-soft)]">
                <Upload size={20} className="text-[var(--accent)]" />
              </span>
              <span className="text-[14.5px] font-medium">เลือกไฟล์ PDF</span>
              <span className="text-[12.5px] text-[var(--fg-dim)]">
                รองรับ PDF ที่เป็นข้อความ (ไม่ใช่ไฟล์สแกนเป็นภาพ)
              </span>
            </button>

            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void handleFile(file);
              }}
            />

            {error ? (
              <p
                role="alert"
                className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-3 text-[12.5px] leading-relaxed text-red-300"
              >
                {error}
              </p>
            ) : null}
          </>
        ) : null}

        {/* ------------------------------ reading ----------------------------- */}
        {stage === "reading" ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--bg)] px-4 py-12">
            <Loader2 size={22} className="animate-spin text-[var(--accent)]" />
            <p className="text-[14px] font-medium">กำลังอ่านไฟล์…</p>
            <p className="text-[12.5px] text-[var(--fg-dim)]">
              {progress.total
                ? `หน้า ${progress.page} จาก ${progress.total}`
                : "กำลังเปิดเอกสาร"}
            </p>
            {progress.total ? (
              <div className="mt-1 h-1 w-full max-w-[240px] overflow-hidden rounded-full bg-[var(--line)]">
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-200"
                  style={{ width: `${(progress.page / progress.total) * 100}%` }}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {/* ------------------------------ review ------------------------------ */}
        {stage === "review" ? (
          <>
            <div className="flex items-center gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3.5 py-3">
              <FileText size={16} className="shrink-0 text-[var(--accent)]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium">
                  {bookName}
                </span>
                <span className="text-[11.5px] text-[var(--fg-dim)]">
                  แยกได้ {chapters.length} ตอน
                </span>
              </span>
            </div>

            <button
              onClick={() => setPickingShelf(true)}
              className="flex w-full items-center gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3.5 py-3 text-left transition-colors hover:border-[var(--fg-dim)]"
            >
              <Library size={16} className="shrink-0 text-[var(--fg-muted)]" />
              <span className="min-w-0 flex-1">
                <span className="block text-[11.5px] text-[var(--fg-dim)]">
                  เก็บเข้าชั้นหนังสือ
                </span>
                <span className="block truncate text-[13.5px] font-medium">
                  {shelf ? shelf.series.name : `สร้างชั้นใหม่ “${bookName}”`}
                </span>
              </span>
            </button>

            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() =>
                  setChosen(
                    allChosen ? new Set() : new Set(chapters.map((_, i) => i)),
                  )
                }
                className="flex items-center gap-2 text-[13px] font-medium text-[var(--fg-muted)] transition-colors hover:text-[var(--fg)]"
              >
                {allChosen ? (
                  <CheckSquare size={15} className="text-[var(--accent)]" />
                ) : (
                  <Square size={15} />
                )}
                เลือกทั้งหมด
              </button>
              <span className="text-[12px] text-[var(--fg-dim)]">
                เลือกไว้ {chosen.size} ตอน
              </span>
            </div>

            <div className="max-h-[38vh] space-y-1.5 overflow-y-auto overscroll-contain">
              {chapters.map((c, i) => {
                const on = chosen.has(i);
                return (
                  <button
                    key={i}
                    onClick={() => toggle(i)}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-xl border p-3 text-left transition-colors",
                      on
                        ? "border-[var(--accent)]/45 bg-[var(--accent-soft)]"
                        : "border-[var(--line)] bg-[var(--bg)]",
                    )}
                  >
                    {on ? (
                      <CheckSquare
                        size={15}
                        className="mt-0.5 shrink-0 text-[var(--accent)]"
                      />
                    ) : (
                      <Square size={15} className="mt-0.5 shrink-0 text-[var(--fg-dim)]" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[13px] font-medium leading-snug">
                        {c.title}
                      </span>
                      <span className="mt-1 block text-[11.5px] text-[var(--fg-dim)]">
                        {c.paragraphs.length} ย่อหน้า ·{" "}
                        {c.charCount.toLocaleString()} ตัวอักษร
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-2 border-t border-[var(--line-soft)] pt-3">
              <p className="text-[12px] leading-relaxed text-[var(--fg-dim)]">
                ทุกตอนจะถูกต่อคิวแปลทีละตอนตามลำดับ โดยใช้คลังคำศัพท์ร่วมกัน
                รวม {totalChars.toLocaleString()} ตัวอักษร
                {cost !== null ? ` · ค่าใช้จ่ายโดยประมาณ ${formatUsd(cost)}` : ""}
              </p>
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                disabled={chosen.size === 0}
                onClick={() => {
                  onImport({ chapters: selected, seriesId: shelfId, bookName });
                  close();
                }}
              >
                เพิ่มเข้าคิวแปล {chosen.size} ตอน
              </Button>
            </div>
          </>
        ) : null}
      </div>

      <ShelfPicker
        open={pickingShelf}
        onClose={() => setPickingShelf(false)}
        options={shelves}
        selectedId={shelfId}
        onSelect={setShelfId}
      />
    </Sheet>
  );
}
