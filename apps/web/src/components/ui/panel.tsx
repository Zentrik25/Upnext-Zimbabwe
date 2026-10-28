import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** Bordered side panel (filters, aside cards). */
export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "h-max rounded-card border border-border-panel bg-surface p-[14px] shadow-subtle",
        className,
      )}
      {...props}
    />
  );
}

/** Pale interest/call-out bar. */
export function Callout({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-card border border-border-interest bg-surface-pale px-4 py-[14px]", className)}
      {...props}
    />
  );
}
