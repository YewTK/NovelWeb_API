"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

/* --------------------------------- Button -------------------------------- */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline" | "subtle" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
};

export function Button({
  variant = "subtle",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200",
        "disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97]",
        size === "sm" && "h-8 px-3 text-[13px]",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-6 text-[15px]",
        size === "icon" && "h-10 w-10 shrink-0",
        variant === "primary" &&
          "bg-[var(--accent)] text-[#0a0c14] shadow-[0_6px_24px_-6px_var(--accent)] hover:brightness-110",
        variant === "outline" &&
          "border border-[var(--line)] bg-[var(--bg-elev)] hover:border-[var(--fg-dim)] hover:bg-[var(--bg-elev-2)]",
        variant === "subtle" &&
          "bg-[var(--bg-elev-2)] text-[var(--fg)] hover:bg-[var(--line-soft)]",
        variant === "ghost" &&
          "text-[var(--fg-muted)] hover:bg-[var(--bg-elev-2)] hover:text-[var(--fg)]",
        variant === "danger" && "bg-red-500/12 text-red-400 hover:bg-red-500/20",
        className,
      )}
    />
  );
}

/* ---------------------------------- Sheet -------------------------------- */

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  side = "right",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  side?: "right" | "bottom";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        aria-label="ปิด"
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-[3px]"
      />
      <div
        className={cn(
          "rise relative z-10 flex flex-col bg-[var(--bg-elev)] shadow-2xl",
          side === "right"
            ? "ml-auto h-full w-full max-w-[440px] border-l border-[var(--line)]"
            : "mt-auto max-h-[88vh] w-full rounded-t-3xl border-t border-[var(--line)]",
        )}
      >
        <header className="flex items-start gap-3 border-b border-[var(--line-soft)] px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--fg-muted)]">
                {description}
              </p>
            ) : null}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="ปิด">
            <X size={18} />
          </Button>
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5">
          {children}
        </div>
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
        <span className="text-[13px] font-medium text-[var(--fg-muted)]">
          {label}
        </span>
        {action}
      </div>
      {children}
      {hint ? (
        <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--fg-dim)]">
          {hint}
        </p>
      ) : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm " +
  "placeholder:text-[var(--fg-dim)] transition-colors focus:border-[var(--accent)] focus:outline-none";

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
    <div
      className={cn(
        "flex gap-1 rounded-xl border border-[var(--line)] bg-[var(--bg)] p-1",
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          aria-pressed={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all duration-200",
            value === o.value
              ? "bg-[var(--bg-elev-2)] text-[var(--fg)] shadow-sm"
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
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left transition-colors hover:bg-[var(--bg-elev-2)]"
    >
      <span
        className={cn(
          "relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200",
          checked ? "bg-[var(--accent)]" : "bg-[var(--line)]",
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
        {hint ? (
          <span className="mt-0.5 block text-[12px] leading-snug text-[var(--fg-dim)]">
            {hint}
          </span>
        ) : null}
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
        <span className="text-[13px] font-medium text-[var(--fg-muted)]">
          {label}
        </span>
        <span className="font-mono text-[12px] text-[var(--fg-dim)]">
          {display ?? value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        style={{
          background: `linear-gradient(90deg, var(--accent) ${pct}%, var(--line) ${pct}%)`,
        }}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full
          [&::-moz-range-thumb]:h-[18px] [&::-moz-range-thumb]:w-[18px] [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[var(--accent)]
          [&::-webkit-slider-thumb]:h-[18px] [&::-webkit-slider-thumb]:w-[18px]
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-[var(--accent)] [&::-webkit-slider-thumb]:shadow-md"
      />
    </div>
  );
}

/* --------------------------------- Toasts -------------------------------- */

export interface Toast {
  id: string;
  message: string;
  tone: "info" | "error" | "success";
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const push = (message: string, tone: Toast["tone"] = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-2), { id, message, tone }]);
    timers.current.set(
      id,
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5200),
    );
  };

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach(clearTimeout);
  }, []);

  return { toasts, push };
}

const TOAST_STYLE: Record<Toast["tone"], { wrap: string; icon: ReactNode }> = {
  success: {
    wrap: "border-emerald-400/40 bg-emerald-500 text-white",
    icon: <CheckCircle2 size={18} className="shrink-0" />,
  },
  error: {
    wrap: "border-red-400/40 bg-red-500 text-white",
    icon: <AlertTriangle size={18} className="shrink-0" />,
  },
  info: {
    wrap: "border-[var(--line)] bg-[var(--bg-elev-2)] text-[var(--fg)]",
    icon: <Info size={18} className="shrink-0 text-[var(--accent)]" />,
  },
};

/**
 * Solid, high-contrast and icon-led. The old translucent tints were nearly
 * unreadable over prose, which is exactly where these appear.
 */
export function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[7.5rem] z-[60] mx-auto flex w-[min(92vw,440px)] flex-col gap-2 px-1 sm:bottom-6">
      {toasts.map((t) => {
        const style = TOAST_STYLE[t.tone];
        return (
          <div
            key={t.id}
            role="status"
            aria-live="polite"
            className={cn(
              "rise pointer-events-auto flex items-center gap-2.5 rounded-2xl border px-4 py-3.5",
              "text-[14px] font-medium leading-snug shadow-[0_12px_32px_-8px_rgba(0,0,0,.5)]",
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
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-5" role="dialog" aria-modal="true">
      <button
        aria-label="ยกเลิก"
        onClick={onCancel}
        className="absolute inset-0 bg-black/60 backdrop-blur-[3px]"
      />
      <div className="rise relative z-10 w-full max-w-[400px] rounded-3xl border border-[var(--line)] bg-[var(--bg-elev)] p-6 shadow-2xl">
        <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
        <div className="mt-2.5 text-[13.5px] leading-relaxed text-[var(--fg-muted)]">
          {body}
        </div>
        <div className="mt-6 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant="primary" className="flex-1" onClick={onConfirm} autoFocus>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
