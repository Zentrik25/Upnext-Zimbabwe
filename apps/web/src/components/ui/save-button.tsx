import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Save control. Name, state and shape (♡ / ♥) are all programmatic and visible, so colour is never the
 * only cue (ACCESSIBILITY_DEVIATIONS.md §2, AC-A11Y-07).
 */
export function SaveButton({
  title,
  saved,
  className,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title" | "aria-pressed" | "aria-label"> & {
  title: string;
  saved: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={`Save ${title}`}
      className={cn("px-1 text-[20px] leading-[31px]", saved ? "text-save-on" : "text-save-idle", className)}
      {...props}
    >
      <span aria-hidden="true">{saved ? "♥" : "♡"}</span>
    </button>
  );
}
