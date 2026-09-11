"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, AlertTriangle } from "lucide-react";

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg
      className="animate-spin"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

const HUES = [18, 42, 165, 200, 262, 330, 88, 12];

export function avatarHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length];
}

export function Avatar({ seed, size = 26 }: { seed: string; size?: number }) {
  const hue = avatarHue(seed);
  const initials = seed
    .split(/[\s.@_+-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `hsl(${hue} 42% 50% / 0.18)`,
        color: `hsl(${hue} 55% 62%)`,
        border: `1px solid hsl(${hue} 42% 50% / 0.25)`,
      }}
    >
      {initials || "?"}
    </span>
  );
}

export function timeAgo(ts: number): string {
  const ms = Date.now() - ts;
  if (ms < 60_000) return "now";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const date = new Date(ts);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function fmtTime(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  if (d.getFullYear() === today.getFullYear())
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ── Toasts ────────────────────────────────────────────────────────────────

interface ToastItem {
  id: number;
  kind: "success" | "error";
  text: string;
}

let toastListeners: ((t: ToastItem) => void)[] = [];
let toastSeq = 1;

export function toast(kind: "success" | "error", text: string) {
  const t = { id: toastSeq++, kind, text };
  toastListeners.forEach((l) => l(t));
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    const on = (t: ToastItem) => {
      setItems((prev) => [...prev.slice(-3), t]);
      setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== t.id)), 4200);
    };
    toastListeners.push(on);
    return () => {
      toastListeners = toastListeners.filter((l) => l !== on);
    };
  }, []);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2" role="status" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          className={`fade-up flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-[13px] shadow-pop ${
            t.kind === "success"
              ? "border-line bg-surface text-ink"
              : "border-danger/30 bg-surface text-ink"
          }`}
        >
          {t.kind === "success" ? (
            <CheckCircle2 size={15} className="text-success" />
          ) : (
            <AlertTriangle size={15} className="text-danger" />
          )}
          <span className="max-w-[280px]">{t.text}</span>
        </div>
      ))}
    </div>,
    document.body
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-surface-2 text-ink-3">
        {icon}
      </div>
      <div>
        <p className="text-[14px] font-semibold text-ink">{title}</p>
        {hint && <p className="mt-1 max-w-[300px] text-[12.5px] leading-relaxed text-ink-3">{hint}</p>}
      </div>
      {children}
    </div>
  );
}
