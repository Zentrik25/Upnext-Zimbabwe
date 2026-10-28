import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type TagTone = "default" | "good" | "urgent";
const tones: Record<TagTone, string> = {
  default: "bg-tag-bg text-meta",
  good: "bg-good-bg text-good",
  urgent: "bg-urgent-bg text-urgent",
};

/** Small metadata chip. The tone changes colour only; the label text always carries the meaning. */
export function Tag({
  tone = "default",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: TagTone }) {
  return (
    <span
      className={cn(
        "inline-block rounded-control border border-tag-border px-1.5 py-[2px] text-small",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
