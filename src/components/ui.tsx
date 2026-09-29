"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

/* --------------------------------- Button -------------------------------- */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "accent" | "accent-solid" | "ghost" | "outline" | "subtle" | "danger" | "magic";
  size?: "sm" | "md" | "lg" | "icon";
};

export function Button({ variant = "subtle", size = "md", className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium tracking-tight",
        "transition-[background-color,color,border-color,box-shadow,filter] duration-200",
        "active:scale-[0.98] active:transition-transform",
        "disabled:pointer-events-none disabled:opacity-40",
        size === "sm" && "h-9 px-3 text-[13px]",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-6 text-[15px]",
        size === "icon" && "h-10 w-10 shrink-0",
        variant === "primary" && "bg-[var(--btn)] text-[var(--btn-fg)] hover:bg-[var(--btn-hover)]",
        variant === "accent-solid" &&
          "bg-[var(--accent-strong)] text-[var(--accent-ink)] shadow-[0_10px_28px_-10px_var(--accent)] hover:brightness-110",
        variant === "magic" &&
          "bg-[linear-gradient(120deg,var(--accent-strong),color-mix(in_oklab,var(--magic)_85%,var(--accent-strong)))] text-white shadow-[0_12px_32px_-12px_var(--magic)] hover:brightness-110",
        variant === "accent" &&
          "border border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent)] hover:bg-[color-mix(in_oklab,var(--accent)_18%,transparent)]",
        variant === "outline" &&
          "border border-[var(--line)] bg-[var(--bg-elev)]/70 text-[var(--fg)] hover:border-[var(--accent-line)] hover:bg-[var(--bg-elev-2)]",
        variant === "subtle" && "bg-[var(--bg-elev-2)] text-[var(--fg)] hover:bg-[var(--line-soft)]",
        variant === "ghost" &&
          "text-[var(--fg-muted)] hover:bg-[var(--bg-elev-2)] hover:text-[var(--fg)]",
        variant === "danger" &&
          "bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_oklab,var(--danger)_22%,transparent)]",
        className,
      )}
    />
  );
}

/* ------------------------------- scroll lock ------------------------------ */

let locks = 0;

/**
 * Counted, so a confirm dialog opened over a sheet does not hand scrolling
 * back to the page when it closes while the sheet is still up.
 */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    locks += 1;
    document.body.style.overflow = "hidden";
    return () => {
      locks = Math.max(0, locks - 1);
      if (!locks) document.body.style.overflow = "";
    };
  }, [active]);
}

/** Escape closes the topmost layer, without re-binding on every render. */
function useEscape(active: boolean, handler: () => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") ref.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active]);
}

/* ---------------------------------- Sheet -------------------------------- */

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  side = "right",
  header,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  side?: "right" | "bottom";
  /** pinned under the title, outside the scrolling area (search, add row…) */
  header?: ReactNode;
  /** pinned to the bottom, outside the scrolling area */
  footer?: ReactNode;
  /** a roomier side panel, for editors */
  wide?: boolean;
}) {
  useScrollLock(open);
  useEscape(open, onClose);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label={title}>
      <button
        aria-label="ปิด"
        onClick={onClose}
        className="fade-in absolute inset-0 bg-black/60 backdrop-blur-[4px]"
      />
      <div
        className={cn(
          "relative z-10 flex flex-col bg-[var(--bg-elev)] shadow-2xl",
          side === "right"
            ? cn("sheet-left ml-auto h-dvh w-full border-l border-[var(--line)]", wide ? "max-w-[640px]" : "max-w-[480px]")
            : "sheet-up mt-auto max-h-[90dvh] w-full rounded-t-[28px] border-t border-[var(--line)]",
        )}
      >
        {side === "bottom" ? (
          <span className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-[var(--line)]" aria-hidden />
        ) : null}
        <header
          className={cn(
            "flex items-start gap-3 border-b border-[var(--line-soft)] py-3.5 pl-5 pr-2",
            side === "right" && "pt-[max(0.875rem,env(safe-area-inset-top))]",
          )}
        >
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-[16px] font-semibold tracking-tight">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--fg-muted)]">{description}</p>
            ) : null}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="ปิด">
            <X size={18} />
          </Button>
        </header>
        {header ? <div className="border-b border-[var(--line-soft)] px-5 py-3">{header}</div> : null}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 [-webkit-overflow-scrolling:touch]">
          {children}
        </div>
        {footer ? (
          <div className="border-t border-[var(--line-soft)] px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------------------------- Field -------------------------------- */

export function Field({
  label,
  hint,
  children,
  action,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-[var(--fg-muted)]">{label}</span>
        {action}
      </div>
      {children}
      {hint ? <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--fg-dim)]">{hint}</p> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm " +
  "placeholder:text-[var(--fg-dim)] transition-[border-color,box-shadow] focus:border-[var(--accent)] " +
  "focus:shadow-[0_0_0_4px_var(--accent-soft)] focus:outline-none " +
  // 16px on phones stops iOS Safari zooming the page on focus.
  "max-sm:text-base";

/* -------------------------------- Segmented ------------------------------ */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; title?: string }[];
  className?: string;
}) {
  return (
    <div className={cn("flex gap-1 rounded-xl border border-[var(--line)] bg-[var(--bg)] p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all duration-200",
            value === o.value
              ? "bg-[var(--bg-elev-2)] text-[var(--fg)] shadow-sm ring-1 ring-[var(--accent-line)]"
              : "text-[var(--fg-dim)] hover:text-[var(--fg-muted)]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* --------------------------------- Switch -------------------------------- */

export function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left transition-colors hover:bg-[var(--bg-elev-2)]"
    >
      <span
        className={cn(
          "relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200",
          checked ? "bg-[var(--accent-strong)]" : "bg-[var(--line)]",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200",
            checked ? "translate-x-[18px]" : "translate-x-0.5",
          )}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-medium">{label}</span>
        {hint ? <span className="mt-0.5 block text-[12px] leading-snug text-[var(--fg-dim)]">{hint}</span> : null}
      </span>
    </button>
  );
}

/* --------------------------------- Slider -------------------------------- */

export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  display,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  label: string;
  display?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px] font-medium text-[var(--fg-muted)]">{label}</span>
        <span className="font-mono text-[12px] text-[var(--fg-dim)]">{display ?? value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        style={{ background: `linear-gradient(90deg, var(--accent) ${pct}%, var(--line) ${pct}%)` }}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full
          [&::-moz-range-thumb]:h-[18px] [&::-moz-range-thumb]:w-[18px] [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[var(--accent)]
          [&::-webkit-slider-thumb]:h-[18px] [&::-webkit-slider-thumb]:w-[18px]
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-[var(--accent)] [&::-webkit-slider-thumb]:shadow-[0_0_0_4px_var(--accent-soft)]"
      />
    </div>
  );
}

/* ---------------------------------- Chip --------------------------------- */

export function Chip({
  children,
  tone = "plain",
  className,
}: {
  children: ReactNode;
  tone?: "plain" | "accent" | "magic" | "success" | "danger";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-medium",
        tone === "plain" && "border border-[var(--line)] bg-[var(--bg-elev)]/70 text-[var(--fg-muted)]",
        tone === "accent" && "bg-[var(--accent-soft)] text-[var(--accent)] ring-1 ring-[var(--accent-line)]",
        tone === "magic" &&
          "bg-[color-mix(in_oklab,var(--magic)_16%,transparent)] text-[color-mix(in_oklab,var(--magic)_80%,var(--fg))]",
        tone === "success" && "bg-[color-mix(in_oklab,var(--success)_15%,transparent)] text-[var(--success)]",
        tone === "danger" && "bg-[color-mix(in_oklab,var(--danger)_15%,transparent)] text-[var(--danger)]",
        className,
      )}
    >
      {children}
    </span>
  );
}

/* -------------------------------- Skeleton ------------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("shimmer rounded-xl bg-[var(--bg-elev-2)]", className)} />;
}

/* ------------------------------- Long press ------------------------------- */

/**
 * Runs an action only after the press is held down. Touch screens have no
 * hover, so a destructive control cannot hide behind one — holding is what
 * makes the intent deliberate instead of a mis-tap.
 */
export function useLongPress(onLongPress: () => void, ms = 500) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    origin.current = null;
  };

  useEffect(() => clear, []);

  return {
    /** True when the press became a hold, so the click that follows is ignored. */
    consumed: () => fired.current,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        fired.current = false;
        origin.current = { x: e.clientX, y: e.clientY };
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          fired.current = true;
          timer.current = null;
          onLongPress();
        }, ms);
      },
      onPointerMove: (e: React.PointerEvent) => {
        // A scroll should never arm the hold; a resting thumb still can.
        const from = origin.current;
        if (!from) return;
        if (Math.hypot(e.clientX - from.x, e.clientY - from.y) > 10) clear();
      },
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    },
  };
}

/* --------------------------------- Toasts -------------------------------- */

export interface Toast {
  id: string;
  message: string;
  tone: "info" | "error" | "success";
}

export type Notify = (message: string, tone?: Toast["tone"]) => void;

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // Stable for the life of the page: the translation pipeline's callbacks
  // depend on it, and a fresh function every render rebuilt all of them.
  const push = useCallback<Notify>((message, tone = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-2), { id, message, tone }]);
    timers.current.set(
      id,
      setTimeout(() => {
        timers.current.delete(id);
        setToasts((t) => t.filter((x) => x.id !== id));
      }, 5200),
    );
  }, []);

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach(clearTimeout);
  }, []);

  return { toasts, push };
}

const TOAST_STYLE: Record<Toast["tone"], { wrap: string; icon: ReactNode }> = {
  success: {
    wrap: "border-[color-mix(in_oklab,var(--success)_45%,transparent)] bg-[var(--bg-elev-2)] text-[var(--fg)]",
    icon: <CheckCircle2 size={18} className="shrink-0 text-[var(--success)]" />,
  },
  error: {
    wrap: "border-[color-mix(in_oklab,var(--danger)_55%,transparent)] bg-[color-mix(in_oklab,var(--danger)_92%,black)] text-white",
    icon: <AlertTriangle size={18} className="shrink-0" />,
  },
  info: {
    wrap: "border-[var(--line)] bg-[var(--bg-elev-2)] text-[var(--fg)]",
    icon: <Info size={18} className="shrink-0 text-[var(--accent)]" />,
  },
};

/** Solid, high-contrast and icon-led: these often appear over prose. */
export function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(7.5rem+env(safe-area-inset-bottom))] z-[80] mx-auto flex w-[min(92vw,440px)] flex-col gap-2 px-1 sm:bottom-6">
      {toasts.map((t) => {
        const style = TOAST_STYLE[t.tone];
        return (
          <div
            key={t.id}
            role="status"
            aria-live="polite"
            className={cn(
              "rise pointer-events-auto flex items-center gap-2.5 rounded-2xl border px-4 py-3.5",
              "text-[14px] font-medium leading-snug shadow-[0_16px_40px_-10px_rgba(0,0,0,.6)]",
              style.wrap,
            )}
          >
            {style.icon}
            <span className="min-w-0 flex-1">{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------- Confirm ------------------------------- */

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = "ยกเลิก",
  onConfirm,
  onCancel,
  tone = "primary",
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  tone?: "primary" | "danger";
}) {
  useScrollLock(open);
  useEscape(open, onCancel);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-5" role="alertdialog" aria-modal="true" aria-label={title}>
      <button aria-label="ยกเลิก" onClick={onCancel} className="fade-in absolute inset-0 bg-black/65 backdrop-blur-[4px]" />
      <div className="rise gilded relative z-10 w-full max-w-[400px] rounded-3xl bg-[var(--bg-elev)] p-6 shadow-2xl">
        <h2 className="font-serif text-[18px] font-semibold tracking-tight">{title}</h2>
        <div className="mt-2.5 text-[13.5px] leading-relaxed text-[var(--fg-muted)]">{body}</div>
        <div className="mt-6 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} className="flex-1" onClick={onConfirm} autoFocus>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
