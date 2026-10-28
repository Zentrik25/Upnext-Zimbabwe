"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";

export type ThemeChoice = "system" | "light" | "dark";
export const THEME_KEY = "upnext-theme";
const CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: "system", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function stored(): ThemeChoice {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
  try {
    if (choice === "system") window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, choice);
  } catch {
    /* storage can be blocked: the choice then lasts for this page view only */
  }
  listeners.forEach((listener) => listener());
}

/** Auto follows the device setting; Light and Dark are remembered in this browser only (no cookie, nothing sent). */
export function ThemeToggle({ className }: { className?: string }) {
  const choice = useSyncExternalStore(subscribe, stored, () => "system" as ThemeChoice);
  return (
    <div role="group" aria-label="Colour theme" className={cn("flex items-center gap-1", className)}>
      <span className="mr-1" aria-hidden="true">
        Theme
      </span>
      {CHOICES.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          aria-pressed={choice === value}
          onClick={() => applyTheme(value)}
          className={cn(
            "inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-control border px-2 text-small",
            choice === value
              ? "border-brand-dark-text bg-white/10 text-white"
              : "border-transparent text-brand-dark-text hover:bg-white/5",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
