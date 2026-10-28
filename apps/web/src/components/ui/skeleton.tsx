import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Loading placeholders. They are static on purpose (no shimmer or pulse: nothing moves, so nothing needs a
 * reduced-motion exception), flat like the rest of the design, and take their colours from tokens so dark mode
 * works. The region announces itself once ("Loading …") and hides its decorative blocks from assistive
 * technology.
 *
 * Used only on private, signed-in routes. Public pages (search, listing, report) deliberately have no
 * loading.tsx: a segment loading file streams a 200 response before the page runs, so an unknown listing
 * could no longer answer 404 and crawlers would see a placeholder.
 */
export function LoadingRegion({
  label,
  children,
  className,
}: {
  /** What is loading, for screen readers: "Loading <label>…". */
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={className} data-testid="loading">
      {/* A page always has a level-1 heading, loading or not (WCAG 2.4.6). It is a role, not an <h1>, so the
          moment the real page's <h1> arrives there is still exactly one <h1> element in the document. */}
      <div role="heading" aria-level={1} className="sr-only">
        Loading {label}…
      </div>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

/** One line of text. `width` is a Tailwind width class (the default is a full line). */
export function SkeletonLine({ className }: { className?: string }) {
  return <div className={cn("h-[14px] w-full bg-line", className)} />;
}

/** A block such as a heading, an image area or a panel body. */
export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("h-[40px] w-full bg-surface-pale border border-border-panel", className)} />;
}

/** A listing row: organisation, title, a line of facts. */
export function SkeletonListingRow() {
  return (
    <div className="grid gap-2 border-b border-line py-4" data-testid="skeleton-row">
      <SkeletonLine className="w-1/4" />
      <SkeletonLine className="h-[20px] w-2/3 max-sm:w-full" />
      <SkeletonLine className="w-1/2 max-sm:w-3/4" />
    </div>
  );
}

export function SkeletonListingRows({ count = 6 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <SkeletonListingRow key={index} />
      ))}
    </>
  );
}

/** A title and a few lines of text, for account-style pages. */
export function SkeletonPageHeading() {
  return (
    <div className="grid gap-2 pb-4">
      <SkeletonLine className="h-[28px] w-1/3 max-sm:w-2/3" />
      <SkeletonLine className="w-1/2 max-sm:w-full" />
    </div>
  );
}

/** A bordered panel with a few lines. */
export function SkeletonPanel({ lines = 3 }: { lines?: number }) {
  return (
    <div className="grid gap-2 border border-border-panel p-[14px]">
      <SkeletonLine className="h-[18px] w-1/3" />
      {Array.from({ length: lines }, (_, index) => (
        <SkeletonLine key={index} className={index === lines - 1 ? "w-2/3" : undefined} />
      ))}
    </div>
  );
}
