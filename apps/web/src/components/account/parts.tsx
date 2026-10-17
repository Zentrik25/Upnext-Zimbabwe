import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Page-level error: text starts with "Error:" so colour is never the only cue. */
export function FormError({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <div id={id} role="alert" className="border border-urgent p-[10px] text-base text-urgent">
      <span className="font-strong">Error:</span> {children}
    </div>
  );
}

export function FormSuccess({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="status"
      className={cn("border border-border-interest bg-surface-pale p-[10px] text-base", className)}
      {...props}
    >
      {children}
    </div>
  );
}

/** Narrow single-column page body used by the account forms. */
export function FormPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[440px] px-6 pt-8 pb-[65px] max-sm:px-[14px]">
      <h1 className="text-section font-strong tracking-section">{title}</h1>
      {intro ? <p className="mt-1 mb-4 text-base text-muted">{intro}</p> : <div className="mb-4" />}
      {children}
    </div>
  );
}
