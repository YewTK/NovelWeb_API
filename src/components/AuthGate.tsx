"use client";

import { useState } from "react";
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Sparkles, UserRound } from "lucide-react";
import { MIN_PASSWORD, validateCredentials } from "@/lib/auth";
import { signInCloud, signUpCloud } from "@/lib/repo";
import { cn } from "@/lib/utils";
import { BrandMark } from "./AppShell";
import { GrimoireScene } from "./three/Scenes";
import { Button } from "./ui";

type Mode = "signin" | "signup";

/**
 * The whole library sits behind this — every shelf, glossary and chapter is
 * filed under one account, so nothing renders until we know who is reading.
 */
export function AuthGate({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setError(null);

    const problem = validateCredentials(username, password);
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    try {
      if (mode === "signup") await signUpCloud(username, password);
      else await signInCloud(username, password);
      onSignedIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const swap = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  return (
    <main className="relative z-10 grid min-h-dvh place-items-center overflow-hidden px-5 py-12">
      <GrimoireScene className="pointer-events-none absolute inset-x-0 top-0 h-[60vh] opacity-80 sm:h-[70vh]" />
      <div className="relative w-full max-w-[400px] pt-[18vh] sm:pt-[24vh]">
        <div className="rise mb-7 text-center">
          <span className="mx-auto mb-4 flex justify-center">
            <BrandMark size={48} />
          </span>
          <h1 className="font-display text-[28px] font-semibold tracking-[0.06em]">
            Novel<span className="text-gilded">Flow</span>
          </h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--fg-muted)]">
            เข้าสู่ห้องสมุดของคุณ — ชั้นหนังสือ คลังคำศัพท์ และสตูดิโอเขียนนิยาย
          </p>
        </div>

        <div
          className="rise gilded glass rounded-[26px] p-5 shadow-[0_30px_70px_-30px_rgba(0,0,0,.7)]"
          style={{ animationDelay: "60ms" }}
        >
          <div className="mb-5 flex gap-1 rounded-xl border border-[var(--line)] bg-[var(--bg)] p-1">
            {(
              [
                ["signin", "เข้าสู่ระบบ"],
                ["signup", "สมัครสมาชิก"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => swap(value)}
                aria-pressed={mode === value}
                className={cn(
                  "h-10 flex-1 rounded-lg text-[13.5px] font-medium transition-all duration-200",
                  mode === value
                    ? "bg-[var(--bg-elev-2)] text-[var(--fg)] shadow-sm"
                    : "text-[var(--fg-dim)] hover:text-[var(--fg-muted)]",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-[var(--fg-muted)]">
                ชื่อผู้ใช้
              </span>
              <span className="relative block">
                <UserRound
                  size={16}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--fg-dim)]"
                />
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void submit()}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="เช่น admin"
                  className="h-12 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] pl-10 pr-3.5 text-[15px] outline-none transition-colors placeholder:text-[var(--fg-dim)] focus:border-[var(--accent)]"
                />
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-[var(--fg-muted)]">
                รหัสผ่าน
              </span>
              <span className="relative block">
                <Lock
                  size={16}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--fg-dim)]"
                />
                <input
                  type={reveal ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void submit()}
                  autoComplete={
                    mode === "signup" ? "new-password" : "current-password"
                  }
                  placeholder="อย่างน้อย 6 ตัวอักษร"
                  className="h-12 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] pl-10 pr-12 text-[15px] outline-none transition-colors placeholder:text-[var(--fg-dim)] focus:border-[var(--accent)]"
                />
                <button
                  type="button"
                  onClick={() => setReveal((v) => !v)}
                  aria-label={reveal ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                  className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-[var(--fg-dim)] transition-colors hover:bg-[var(--bg-elev-2)] hover:text-[var(--fg)]"
                >
                  {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </span>
            </label>

            {error ? (
              <p
                role="alert"
                className="rounded-xl border border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[var(--danger)]"
              >
                {error}
              </p>
            ) : null}

            <Button
              variant="accent-solid"
              size="lg"
              className="w-full"
              onClick={submit}
              disabled={busy}
            >
              {busy ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  กำลังดำเนินการ…
                </>
              ) : mode === "signup" ? (
                <>
                  <Sparkles size={16} /> สร้างบัญชี
                </>
              ) : (
                <>
                  เข้าสู่ระบบ <ArrowRight size={16} />
                </>
              )}
            </Button>
          </div>

          <p className="mt-4 text-center text-[12px] leading-relaxed text-[var(--fg-dim)]">
            {mode === "signup"
              ? `ชื่อผู้ใช้ 3–24 ตัว (a-z, 0-9, . _ -) รหัสผ่านอย่างน้อย ${MIN_PASSWORD} ตัว`
              : "แต่ละบัญชีมีชั้นหนังสือและคลังคำศัพท์เป็นของตัวเอง"}
          </p>
        </div>
      </div>
    </main>
  );
}
