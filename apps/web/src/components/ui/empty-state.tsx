import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Designed empty state: text always explains what happened and what to do next. */
export function EmptyState({
  title,
  children,
  className,
}: {
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("border border-dashed border-border-empty p-7 text-center text-empty-text", className)}
    >
      <h3 className="text-title font-strong text-ink">{title}</h3>
      {children ? <p className="mt-[7px] text-base text-empty-text">{children}</p> : null}
    </div>
  );
}
