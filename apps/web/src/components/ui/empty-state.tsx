import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Designed empty state: text always explains what happened and what to do next. */
export function EmptyState({
  title,
  children,
  className,
  as: Heading = "h3",
}: {
  title: string;
  children?: ReactNode;
  className?: string;
  /** Heading level: pages whose main content is this state use "h1". */
  as?: "h1" | "h2" | "h3";
}) {
  return (
    <div
      className={cn(
        "rounded-card border border-dashed border-border-empty p-7 text-center text-empty-text",
        className,
      )}
    >
      <Heading className="text-title font-strong text-ink">{title}</Heading>
      {children ? <p className="mt-[7px] text-base text-empty-text">{children}</p> : null}
    </div>
  );
}
