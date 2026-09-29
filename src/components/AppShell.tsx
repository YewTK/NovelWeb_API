"use client";

import type { ReactNode } from "react";
import { Feather, History, Languages, Library, Loader2, Moon, ScrollText, Settings2, Sun, UserRound } from "lucide-react";
import type { ThemeName } from "@/lib/store";
import { cn } from "@/lib/utils";

export type View = "home" | "studio";

/** The mark: an open book under a star — gold on the night. */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <span
      className="relative grid shrink-0 place-items-center rounded-[11px] bg-[linear-gradient(145deg,var(--accent-strong),color-mix(in_oklab,var(--accent-strong)_55%,var(--magic)))] shadow-[0_8px_22px_-8px_var(--accent)]"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 32 32" width={size * 0.66} height={size * 0.66} fill="none">
        <path d="M16 9.5c-2.6-1.6-6.2-2.1-9.5-1.4v14.4c3.3-.7 6.9-.2 9.5 1.4 2.6-1.6 6.2-2.1 9.5-1.4V8.1c-3.3-.7-6.9-.2-9.5 1.4Z" stroke="var(--accent-ink)" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M16 9.5v14.4" stroke="var(--accent-ink)" strokeWidth="1.6" />
        <path d="M16 2.2l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill="var(--accent-ink)" />
      </svg>
    </span>
  );
}

export function Brand() {
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark />
      <span className="font-display text-[17px] font-semibold tracking-[0.06em]">
        Novel<span className="text-gilded">Flow</span>
      </span>
    </span>
  );
}

const THEME_NEXT: Record<ThemeName, ThemeName> = { dark: "light", light: "sepia", sepia: "dark" };
const THEME_LABEL: Record<ThemeName, string> = { dark: "ธีมกลางคืน", light: "ธีมกลางวัน", sepia: "ธีมกระดาษ" };

export interface JobPill {
  label: string;
  /** 0..1, or null while indeterminate */
  progress: number | null;
  kind: "translate" | "write";
  onOpen?: () => void;
}

function NavTab({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13.5px] font-medium transition-colors",
        active
          ? "bg-[var(--bg-elev-2)] text-[var(--fg)] ring-1 ring-[var(--accent-line)]"
          : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
      )}
    >
      <span className={cn(active && "text-[var(--accent)]")}>{icon}</span>
      {children}
    </button>
  );
}

export function TopNav({
  view,
  onNavigate,
  onTranslate,
  onHistory,
  onSettings,
  onAccount,
  username,
  needsKey,
  theme,
  onTheme,
  job,
}: {
  view: View;
  onNavigate: (v: View) => void;
  /** jump to the translate box on the home page */
  onTranslate: () => void;
  onHistory: () => void;
  onSettings: () => void;
  onAccount: () => void;
  username: string | null;
  needsKey: boolean;
  theme: ThemeName;
  onTheme: (t: ThemeName) => void;
  job: JobPill | null;
}) {
  return (
    <header className="glass sticky top-0 z-40 border-b border-[var(--line-soft)] pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-2 px-3 sm:px-6">
        <button onClick={() => onNavigate("home")} aria-label="หน้าแรก" className="rounded-xl pr-2">
          <Brand />
        </button>

        <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="เมนูหลัก">
          <NavTab active={view === "home"} onClick={() => onNavigate("home")} icon={<Library size={15} />}>
            ห้องสมุด
          </NavTab>
          <NavTab active={false} onClick={onTranslate} icon={<Languages size={15} />}>
            แปลนิยาย
          </NavTab>
          <NavTab active={view === "studio"} onClick={() => onNavigate("studio")} icon={<Feather size={15} />}>
            สตูดิโอเขียน
          </NavTab>
        </nav>

        <div className="flex-1" />

        {job ? (
          <button
            onClick={job.onOpen}
            className="gilded hidden max-w-[260px] items-center gap-2 rounded-full bg-[var(--bg-elev)]/80 py-1.5 pl-2.5 pr-3.5 text-left sm:flex"
          >
            <Loader2 size={14} className="shrink-0 animate-spin text-[var(--accent)]" />
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-medium">{job.label}</span>
              <span className="mt-1 block h-[3px] w-full overflow-hidden rounded-full bg-[var(--line)]">
                <span
                  className="bar-live block h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${Math.round((job.progress ?? 0.15) * 100)}%` }}
                />
              </span>
            </span>
          </button>
        ) : null}

        <button
          onClick={() => onTheme(THEME_NEXT[theme])}
          aria-label={`${THEME_LABEL[theme]} — กดเพื่อเปลี่ยน`}
          title={THEME_LABEL[theme]}
          className="grid h-10 w-10 place-items-center rounded-full text-[var(--fg-muted)] transition-colors hover:bg-[var(--bg-elev-2)] hover:text-[var(--fg)]"
        >
          {theme === "dark" ? <Moon size={18} /> : theme === "light" ? <Sun size={18} /> : <ScrollText size={18} />}
        </button>
        <button
          onClick={onHistory}
          aria-label="ตอนที่เปิดล่าสุด"
          className="hidden h-10 w-10 place-items-center rounded-full text-[var(--fg-muted)] transition-colors hover:bg-[var(--bg-elev-2)] hover:text-[var(--fg)] sm:grid"
        >
          <History size={18} />
        </button>
        <button
          onClick={onSettings}
          aria-label="ตั้งค่า"
          className="relative grid h-10 w-10 place-items-center rounded-full text-[var(--fg-muted)] transition-colors hover:bg-[var(--bg-elev-2)] hover:text-[var(--fg)]"
        >
          <Settings2 size={18} />
          {needsKey ? (
            <span className="dot-live absolute right-2 top-2 h-2 w-2 rounded-full bg-[var(--accent)] ring-2 ring-[var(--bg)]" />
          ) : null}
        </button>
        <button
          onClick={onAccount}
          aria-label="บัญชี"
          className="ml-1 grid h-9 w-9 place-items-center rounded-full bg-[var(--accent-soft)] text-[14px] font-semibold uppercase text-[var(--accent)] ring-1 ring-[var(--accent-line)] transition-colors hover:bg-[color-mix(in_oklab,var(--accent)_22%,transparent)]"
        >
          {username ? username.slice(0, 1) : <UserRound size={16} />}
        </button>
      </div>
    </header>
  );
}

/** Phones: the three places that matter, under the thumb. */
export function MobileTabBar({
  view,
  onNavigate,
  onTranslate,
  onHistory,
  job,
}: {
  view: View;
  onNavigate: (v: View) => void;
  onTranslate: () => void;
  onHistory: () => void;
  job: JobPill | null;
}) {
  const item = (active: boolean, label: string, icon: ReactNode, onClick: () => void, badge?: boolean) => (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-14 flex-1 flex-col items-center justify-center gap-1 text-[10.5px] font-medium transition-colors",
        active ? "text-[var(--accent)]" : "text-[var(--fg-dim)]",
      )}
    >
      {active ? <span className="absolute top-0 h-[3px] w-8 rounded-b-full bg-[var(--accent)]" /> : null}
      {icon}
      {label}
      {badge ? <span className="dot-live absolute right-[30%] top-2.5 h-2 w-2 rounded-full bg-[var(--magic)]" /> : null}
    </button>
  );

  return (
    <nav
      className="glass fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line-soft)] pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="เมนูหลัก"
    >
      {job ? (
        <button onClick={job.onOpen} className="flex w-full items-center gap-2 border-b border-[var(--line-soft)] px-4 py-2 text-left">
          <Loader2 size={13} className="shrink-0 animate-spin text-[var(--accent)]" />
          <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{job.label}</span>
          <span className="h-1 w-16 overflow-hidden rounded-full bg-[var(--line)]">
            <span className="bar-live block h-full" style={{ width: `${Math.round((job.progress ?? 0.15) * 100)}%` }} />
          </span>
        </button>
      ) : null}
      <div className="flex">
        {item(view === "home", "ห้องสมุด", <Library size={20} />, () => onNavigate("home"))}
        {item(false, "แปล", <Languages size={20} />, onTranslate)}
        {item(view === "studio", "สตูดิโอ", <Feather size={20} />, () => onNavigate("studio"), job?.kind === "write" && view !== "studio")}
        {item(false, "ล่าสุด", <History size={20} />, onHistory)}
      </div>
    </nav>
  );
}
