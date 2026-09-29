"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { BookOpen, ChevronLeft, ChevronRight, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GrimoireMode } from "./grimoire";
import type { ShelfBook } from "./shelf";

/**
 * React hosts for the three.js scenes. Nothing from three is imported here at
 * module level: each scene is fetched only once its box is near the viewport
 * and the browser has a spare moment, so the first paint never waits on it.
 */

type Status = "waiting" | "ready" | "unsupported";

interface Handle {
  setPalette: (p: never) => void;
  dispose: () => void;
}

function whenIdle(fn: () => void): () => void {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(fn, { timeout: 1200 });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = setTimeout(fn, 200);
  return () => clearTimeout(id);
}

/**
 * Mounts a scene lazily and keeps its colours in step with the theme.
 * `create` runs inside the dynamically imported chunk.
 */
function useLazyScene<H extends Handle>(
  host: React.RefObject<HTMLDivElement | null>,
  canvas: React.RefObject<HTMLCanvasElement | null>,
  load: () => Promise<{
    create: (canvas: HTMLCanvasElement, host: HTMLElement) => H;
    readPalette: () => unknown;
    webglAvailable: () => boolean;
  }>,
): { status: Status; handle: React.RefObject<H | null> } {
  const [status, setStatus] = useState<Status>("waiting");
  const handle = useRef<H | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const el = host.current;
    const cv = canvas.current;
    if (!el || !cv) return;

    let cancelled = false;
    let cancelIdle: (() => void) | null = null;
    let themeWatch: MutationObserver | null = null;

    const start = () => {
      cancelIdle = whenIdle(async () => {
        try {
          const mod = await loadRef.current();
          if (cancelled) return;
          if (!mod.webglAvailable()) {
            setStatus("unsupported");
            return;
          }
          handle.current = mod.create(cv, el);
          setStatus("ready");
          themeWatch = new MutationObserver(() => {
            handle.current?.setPalette(mod.readPalette() as never);
          });
          themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        } catch {
          if (!cancelled) setStatus("unsupported");
        }
      });
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        start();
      },
      { rootMargin: "300px" },
    );
    io.observe(el);

    return () => {
      cancelled = true;
      io.disconnect();
      cancelIdle?.();
      themeWatch?.disconnect();
      handle.current?.dispose();
      handle.current = null;
    };
  }, [host, canvas]);

  return { status, handle };
}

/* -------------------------------- grimoire -------------------------------- */

/** Shown before WebGL arrives, and instead of it where there is none. */
function SigilFallback({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 grid place-items-center", className)} aria-hidden>
      <div className="relative aspect-square w-[min(78%,380px)]">
        <div className="absolute inset-[18%] rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--accent)_35%,transparent),transparent_70%)] blur-2xl" />
        <svg viewBox="0 0 200 200" className="spin-slow absolute inset-0 h-full w-full text-[var(--accent)] opacity-60">
          <circle cx="100" cy="100" r="96" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="100" cy="100" r="88" fill="none" stroke="currentColor" strokeWidth="0.5" />
          <circle cx="100" cy="100" r="62" fill="none" stroke="currentColor" strokeWidth="0.8" />
          <path
            d="M100 30 L141 157 L33 78 L167 78 L59 157 Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.8"
            strokeLinejoin="round"
          />
        </svg>
        <BookOpen className="absolute inset-0 m-auto h-14 w-14 text-[var(--accent)] opacity-80" strokeWidth={1.2} />
      </div>
    </div>
  );
}

export function GrimoireScene({
  mode = "idle",
  compact = false,
  className,
}: {
  mode?: GrimoireMode;
  compact?: boolean;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const props = useRef({ mode, compact });
  props.current = { mode, compact };

  const { status, handle } = useLazyScene<{
    update: (p: { mode?: GrimoireMode; compact?: boolean }) => void;
    setPalette: (p: never) => void;
    dispose: () => void;
  }>(host, canvas, async () => {
    const mod = await import("./grimoire");
    const rt = await import("./runtime");
    return {
      create: (cv, el) => mod.mount(cv, el, props.current),
      readPalette: rt.readPalette,
      webglAvailable: rt.webglAvailable,
    };
  });

  useEffect(() => {
    handle.current?.update({ mode, compact });
  }, [mode, compact, handle, status]);

  return (
    <div ref={host} className={cn("relative", className)} aria-hidden>
      {status !== "ready" ? <SigilFallback /> : null}
      <canvas
        ref={canvas}
        className={cn(
          "absolute inset-0 h-full w-full transition-opacity duration-1000",
          status === "ready" ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}

/* ---------------------------------- shelf --------------------------------- */

export interface ShelfItem extends ShelfBook {
  subtitle: string;
  /** 0..1 read */
  progress: number;
  action: string;
}

export function Shelf3D({
  items,
  onOpen,
  fallback,
}: {
  items: ShelfItem[];
  onOpen: (id: string) => void;
  /** rendered where WebGL is unavailable */
  fallback: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [focus, setFocus] = useState(0);
  const latest = useRef({ items, focus, onOpen });
  latest.current = { items, focus, onOpen };

  const { status, handle } = useLazyScene<{
    update: (p: { books: ShelfBook[]; focus: number }) => void;
    setPalette: (p: never) => void;
    dispose: () => void;
  }>(host, canvas, async () => {
    const mod = await import("./shelf");
    const rt = await import("./runtime");
    return {
      create: (cv, el) =>
        mod.mount(
          cv,
          el,
          { books: latest.current.items, focus: latest.current.focus },
          {
            onFocus: (i) => setFocus(i),
            onOpen: (id) => latest.current.onOpen(id),
          },
        ),
      readPalette: rt.readPalette,
      webglAvailable: rt.webglAvailable,
    };
  });

  const safeFocus = Math.min(focus, Math.max(0, items.length - 1));
  useEffect(() => {
    handle.current?.update({ books: items, focus: safeFocus });
  }, [items, safeFocus, handle, status]);

  if (status === "unsupported") return <>{fallback}</>;

  const current = items[safeFocus];
  const go = (d: number) => setFocus((f) => Math.max(0, Math.min(items.length - 1, f + d)));

  return (
    <div
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(-1);
        if (e.key === "ArrowRight") go(1);
      }}
    >
      <div ref={host} className="relative h-[300px] sm:h-[380px]">
        {status !== "ready" ? (
          <div className="absolute inset-0 grid place-items-center">
            <div className="shimmer h-[70%] w-[28%] min-w-[140px] rounded-lg bg-[var(--bg-elev-2)]" />
          </div>
        ) : null}
        <canvas
          ref={canvas}
          aria-hidden
          style={{ touchAction: "pan-y" }}
          className={cn(
            "absolute inset-0 h-full w-full transition-opacity duration-700",
            status === "ready" ? "opacity-100" : "opacity-0",
          )}
        />
        <button
          onClick={() => go(-1)}
          disabled={safeFocus === 0}
          aria-label="เรื่องก่อนหน้า"
          className="glass absolute left-1 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-[var(--line)] text-[var(--fg-muted)] transition hover:text-[var(--fg)] disabled:opacity-0 sm:left-3"
        >
          <ChevronLeft size={20} />
        </button>
        <button
          onClick={() => go(1)}
          disabled={safeFocus >= items.length - 1}
          aria-label="เรื่องถัดไป"
          className="glass absolute right-1 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-[var(--line)] text-[var(--fg-muted)] transition hover:text-[var(--fg)] disabled:opacity-0 sm:right-3"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {current ? (
        <div key={current.id} className="rise mx-auto -mt-2 max-w-[520px] px-4 text-center">
          <h3 className="line-clamp-2 font-serif text-[20px] font-semibold leading-snug sm:text-[22px]">{current.title}</h3>
          <p className="mt-1 text-[13px] text-[var(--fg-muted)]">{current.subtitle}</p>
          <div className="mx-auto mt-3 h-1 w-40 overflow-hidden rounded-full bg-[var(--line)]">
            <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.round(current.progress * 100)}%` }} />
          </div>
          <button
            onClick={() => onOpen(current.id)}
            className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-[var(--accent-strong)] px-6 text-[14px] font-semibold text-[var(--accent-ink)] shadow-[0_10px_28px_-10px_var(--accent)] transition hover:brightness-110"
          >
            <Play size={14} fill="currentColor" /> {current.action}
          </button>
          <div className="mt-4 flex justify-center gap-1.5" role="tablist" aria-label="เลือกเรื่อง">
            {items.slice(0, 12).map((it, i) => (
              <button
                key={it.id}
                role="tab"
                aria-selected={i === safeFocus}
                aria-label={it.title}
                onClick={() => setFocus(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === safeFocus ? "w-6 bg-[var(--accent)]" : "w-1.5 bg-[var(--line)] hover:bg-[var(--fg-dim)]",
                )}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
