import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** Full-width information strip at the top of the page. */
export function Notice({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="note"
      className={cn(
        "border-b border-border-notice bg-surface-notice p-2 text-center text-small text-muted",
        className,
      )}
      {...props}
    />
  );
}
