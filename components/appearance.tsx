"use client";

import { useCallback, useEffect, useState } from "react";
import { Moon, Sun, Monitor } from "lucide-react";

export type AppearanceMode = "dark" | "light" | "system";
export type Accent = "gold" | "blue" | "green" | "rose" | "violet";
export type Density = "comfortable" | "compact" | "spacious";

export interface Appearance {
  mode: AppearanceMode;
  accent: Accent;
  density: Density;
  agent?: { provider?: string; model?: string };
  [k: string]: unknown;
}

const KEY = "ip_appearance";
const DEFAULT: Appearance = { mode: "dark", accent: "gold", density: "comfortable" };

export function loadAppearance(): Appearance {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    return DEFAULT;
  }
}

export function applyAppearance(a: Appearance): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const dark =
    a.mode === "dark" ||
    (a.mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
  root.dataset.accent = a.accent === "gold" ? "" : a.accent;
  root.dataset.density = a.density;
}

export function useAppearance(): [Appearance, (next: Partial<Appearance>) => void] {
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const a = loadAppearance();
    setAppearance(a);
    applyAppearance(a);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    applyAppearance(appearance);
  }, [appearance, ready]);

  const update = useCallback((next: Partial<Appearance>) => {
    setAppearance((prev) => {
      const merged = { ...prev, ...next };
      try {
        localStorage.setItem(KEY, JSON.stringify(merged));
      } catch {
        /* private mode */
      }
      return merged;
    });
  }, []);

  return [appearance, update];
}

export function ModeToggle({
  appearance,
  onChange,
}: {
  appearance: Appearance;
  onChange: (next: Partial<Appearance>) => void;
}) {
  const nextMode: Record<AppearanceMode, AppearanceMode> = {
    dark: "light",
    light: "system",
    system: "dark",
  };
  const Icon = appearance.mode === "dark" ? Moon : appearance.mode === "light" ? Sun : Monitor;
  return (
    <button
      className="icon-btn"
      title={`Theme: ${appearance.mode} — click to cycle`}
      aria-label="Toggle theme"
      onClick={() => onChange({ mode: nextMode[appearance.mode] })}
    >
      <Icon size={16} />
    </button>
  );
}
