import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** Bordered side panel (filters, aside cards). */
export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("h-max border border-border-panel p-[14px]", className)} {...props} />;
}

/** Pale interest/call-out bar. */
export function Callout({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("border border-border-interest bg-surface-pale px-4 py-[14px]", className)}
      {...props}
    />
  );
}
