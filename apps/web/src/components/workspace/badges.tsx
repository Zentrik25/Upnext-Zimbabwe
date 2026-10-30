import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { StatusTone } from "@/lib/staff-types";

const TONES: Record<StatusTone, string> = {
  neutral: "border-line bg-surface-pale text-muted",
  muted: "border-line bg-transparent text-muted",
  success: "border-good/35 bg-good-bg text-good",
  warning: "border-urgent/35 bg-urgent-bg text-urgent",
  danger: "border-danger/35 bg-danger-bg text-danger",
  info: "border-border-interest bg-match-bg text-accent",
};

/** A status badge: the word is always shown, colour only reinforces it. */
export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-block whitespace-nowrap rounded-control border px-2 py-[2px] text-small leading-[1.4]",
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const DATETIME = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

export function dateText(value: string | null | undefined, fallback = "Not stated"): string {
  return value ? DATE.format(new Date(value)) : fallback;
}

export function dateTimeText(value: string | null | undefined): string {
  return value ? `${DATETIME.format(new Date(value))} UTC` : "-";
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];
/** "2 hours ago" from an ISO time and the current time (passed in so pages render the same on both sides). */
export function ago(value: string, now: number): string {
  const seconds = Math.round((new Date(value).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of UNITS)
    if (Math.abs(seconds) >= size) return rtf.format(Math.trunc(seconds / size), unit);
  return "just now";
}
