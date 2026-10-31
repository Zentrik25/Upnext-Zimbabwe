import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Loading placeholders (R-52, STATE-01 to STATE-06).
 *
 * - Flat, token colours only (`bg-line`, `bg-surface-pale`, `border-border-panel`), so light and dark follow the theme.
 * - One slow opacity pulse on the whole placeholder region (never per block, never on a page background), declared
 *   under `prefers-reduced-motion: no-preference` in globals.css, so reduced motion gets a still placeholder. Opacity
 *   is composited by the GPU and never changes layout.
 * - Every placeholder reserves the size of the real thing it stands in for, so content replaces it without a shift.
 * - A region announces itself once ("Loading …") and hides every decorative block from assistive technology.
 * - No placeholder is ever shown for data that is already available, and none is time-boxed: a skeleton lasts as
 *   long as its request, and a failed request is a different state (`SectionError`), never an empty one.
 *
 * Route-level `loading.tsx` is used for private, signed-in routes only. Public pages (search, listing, report)
 * deliberately have none: a segment loading file streams a 200 response before the page runs, so an unknown listing
 * could no longer answer 404 and crawlers would see a placeholder. Public pages put a Suspense boundary around the
 * slow section instead, after everything that decides the status code.
 */
export function LoadingRegion({
  label,
  children,
  className,
  heading = true,
}: {
  /** What is loading, for screen readers: "Loading <label>…". */
  label: string;
  children: ReactNode;
  /** Layout of the placeholder itself (grid, gap, border, width): the outer element only carries the status. */
  className?: string;
  /**
   * `true` (default) for a whole page: a level-1 heading is announced, because a page always has one (WCAG 2.4.6).
   * `false` for a section inside a page that already has its heading: only the status text is announced.
   */
  heading?: boolean;
}) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" data-testid="loading">
      {heading ? (
        /* A role, not an <h1>, so the moment the real page's <h1> arrives there is still exactly one <h1>. */
        <div role="heading" aria-level={1} className="sr-only">
          Loading {label}…
        </div>
      ) : (
        <span className="sr-only">Loading {label}…</span>
      )}
      <div aria-hidden="true" className={cn("skeleton-pulse", className)}>
        {children}
      </div>
    </div>
  );
}

/**
 * A default width and height that a caller's own `w-*` or `h-*` class replaces. Two conflicting utilities in one
 * class list are resolved by the stylesheet's order, not the list's, so the default must not be emitted at all.
 */
function sized(className: string | undefined, width: string, height: string): string {
  return cn(
    /(^|\s)w-/.test(className ?? "") ? "" : width,
    /(^|\s)h-/.test(className ?? "") ? "" : height,
    className,
  );
}

/** One line of text. `width` is a Tailwind width class (the default is a full line). */
export function SkeletonLine({ className }: { className?: string }) {
  return <div className={cn(sized(className, "w-full", "h-[14px]"), "bg-line")} />;
}

/** A block such as a heading, an image area or a panel body. */
export function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={cn(sized(className, "w-full", "h-[40px]"), "bg-surface-pale border border-border-panel")}
    />
  );
}

/** A paragraph: `lines` lines of body text, the last one shorter. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("grid gap-2", className)}>
      {Array.from({ length: lines }, (_, index) => (
        <SkeletonLine key={index} className={index === lines - 1 && lines > 1 ? "w-2/3" : undefined} />
      ))}
    </div>
  );
}

/** `page` is the real page title at its two sizes: 29px under 651px, 35px from there (26px and 32px type at 1.1). */
const HEADING = { page: "h-[29px] sm:h-[35px]", section: "h-[24px]", title: "h-[20px]" } as const;

/** A heading: `page` (page title), `section` (section title) or `title` (card or panel title). */
export function SkeletonHeading({
  size = "section",
  className,
}: {
  size?: keyof typeof HEADING;
  className?: string;
}) {
  return <div className={cn(sized(className, "w-1/3 max-sm:w-2/3", HEADING[size]), "bg-line")} />;
}

/** An image area that keeps its aspect ratio at every width. */
export function SkeletonImage({ className }: { className?: string }) {
  return <div className={cn("aspect-[16/9] w-full bg-surface-pale border border-border-panel", className)} />;
}

/** The organisation mark of a listing row (same size and radius as the real one). */
export function SkeletonAvatar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        sized(className, "w-avatar", "h-avatar"),
        "shrink-0 rounded-card border border-avatar-border bg-avatar-bg",
      )}
    />
  );
}

/** A button at the standard control height. */
export function SkeletonButton({ className }: { className?: string }) {
  return <div className={cn(sized(className, "w-[112px]", "h-control"), "rounded-control bg-line")} />;
}

/** A tag or status chip. */
export function SkeletonBadge({ className }: { className?: string }) {
  return <div className={cn(sized(className, "w-[72px]", "h-[22px]"), "rounded-control bg-line")} />;
}

/**
 * A form control: a label line above a field. `field` is the field's height class (the search height by default; the
 * filter selects of the listing page are shorter).
 */
export function SkeletonInput({
  label = true,
  field = "h-search",
  className,
}: {
  label?: boolean;
  field?: string;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-[5px]", className)}>
      {label ? (
        <div className="flex h-[17px] items-center">
          <SkeletonLine className="h-[12px] w-1/4" />
        </div>
      ) : null}
      <div className={cn(field, "w-full rounded-control border border-control-border bg-surface")} />
    </div>
  );
}

/** A bordered card. With no children it holds a title and a few lines. */
export function SkeletonCard({
  children,
  lines = 3,
  className,
}: {
  children?: ReactNode;
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-2 rounded-card border border-border-panel p-[14px]", className)}>
      {children ?? (
        <>
          <SkeletonHeading size="title" className="w-1/3 max-sm:w-1/2" />
          <SkeletonText lines={lines} />
        </>
      )}
    </div>
  );
}

/** A bordered panel with a few lines (the square-cornered panel of the account pages). */
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

/** A dashboard figure: icon square, label, number, note (the size of the real KPI card). */
export function SkeletonMetricCard() {
  return (
    <div
      className="flex items-center gap-3 rounded-card border border-line bg-surface p-[14px]"
      data-testid="skeleton-metric"
    >
      <div className="h-10 w-10 flex-none rounded-card bg-line" />
      <div className="grid min-w-0 flex-1 gap-[6px]">
        <SkeletonLine className="h-[14px] w-1/2" />
        <SkeletonLine className="h-[26px] w-1/3" />
        <SkeletonLine className="h-[12px] w-2/3" />
      </div>
    </div>
  );
}

/** A row of metric cards in the dashboard grid (2, 3 or 5 across as the container widens). */
export function SkeletonMetricGrid({ count = 5 }: { count?: number }) {
  return (
    <div className="@container">
      <div className="grid grid-cols-2 gap-[10px] @min-[560px]:grid-cols-3 @min-[940px]:grid-cols-5">
        {Array.from({ length: count }, (_, index) => (
          <SkeletonMetricCard key={index} />
        ))}
      </div>
    </div>
  );
}

/**
 * A page title with its introduction and, optionally, the action on its right.
 *
 * `intro` is the height class of the real introduction at its two widths (for example `h-[67px] sm:h-[22px]`, three
 * lines on a phone and one on a desktop). It also switches to the real page's spacing (4px under the title, no bottom
 * padding), so the header is exactly as tall as the real one. Without it the header keeps its generic shape.
 */
export function SkeletonPageHeader({ action = false, intro }: { action?: boolean; intro?: string }) {
  if (intro) {
    return (
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid min-w-0 flex-1 gap-1">
          <SkeletonHeading size="page" className="w-1/3 max-sm:w-2/3" />
          <div className={cn("grid content-start gap-2 overflow-hidden", intro)}>
            <SkeletonLine className="w-full" />
            <SkeletonLine className="w-full" />
            <SkeletonLine className="w-2/3" />
          </div>
        </div>
        {action ? <SkeletonButton /> : null}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 pb-4">
      <div className="grid min-w-0 flex-1 gap-2">
        <SkeletonHeading size="page" className="w-1/3 max-sm:w-2/3" />
        <SkeletonLine className="w-1/2 max-sm:w-full" />
      </div>
      {action ? <SkeletonButton /> : null}
    </div>
  );
}

/** A labelled group of check boxes or radios: a legend line, then rows (two columns from 651px). */
export function SkeletonChoiceGroup({ rows = 8, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("grid content-start gap-3", className)}>
      <SkeletonLine className="h-[18px] w-1/3" />
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex h-[24px] items-center gap-3">
            <div className="h-[24px] w-[24px] shrink-0 rounded-micro border border-control-border bg-surface" />
            <SkeletonLine className={index % 3 === 2 ? "w-1/2" : "w-2/3"} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Kept for the account-style pages. */
export function SkeletonPageHeading() {
  return <SkeletonPageHeader />;
}

/**
 * A listing row with the structure of the real one (`ListingRow`): mark, title, organisation, facts and tags, source
 * line and the details button.
 */
export function SkeletonListingRow() {
  return (
    <div className="border-b border-line px-[14px] py-[16px]" data-testid="skeleton-row">
      <div className="flex items-start gap-[11px]">
        <SkeletonAvatar />
        <div className="grid min-h-[47px] min-w-0 flex-1 content-start gap-[7px] pt-[2px]">
          <SkeletonLine className="h-[20px] w-2/3 max-sm:w-5/6" />
          <SkeletonLine className="h-[14px] w-1/4 max-sm:w-1/3" />
        </div>
      </div>
      <div className="my-3 flex flex-wrap items-center gap-[10px]">
        <SkeletonLine className="w-[84px]" />
        <SkeletonLine className="w-[72px]" />
        <SkeletonBadge />
        <SkeletonBadge className="w-[96px]" />
      </div>
      <div className="mt-[13px] flex items-center justify-between gap-2">
        <SkeletonLine className="w-[140px] max-w-[45%]" />
        <SkeletonButton />
      </div>
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

/** The compact row of the home page (`HomeListingRow`): mark, title, organisation, one line of facts. */
export function SkeletonHomeRow() {
  return (
    <div
      className="flex items-start gap-3 border-b border-line px-4 py-4 last:border-b-0 max-sm:px-3"
      data-testid="skeleton-row"
    >
      <SkeletonAvatar className="h-12 w-12" />
      <div className="grid min-w-0 flex-1 gap-[7px]">
        <SkeletonLine className="h-[18px] w-2/3 max-sm:w-5/6" />
        <SkeletonLine className="w-1/4 max-sm:w-1/3" />
        <div className="mt-[2px] flex flex-wrap items-center gap-x-4 gap-y-1">
          <SkeletonLine className="w-[84px]" />
          <SkeletonLine className="w-[72px]" />
          <SkeletonBadge />
        </div>
      </div>
    </div>
  );
}

/** A list of rows: any row skeleton, repeated. */
export function SkeletonList({
  count = 5,
  row,
  className,
}: {
  count?: number;
  row?: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {Array.from({ length: count }, (_, index) =>
        row ? <div key={index}>{row}</div> : <SkeletonListingRow key={index} />,
      )}
    </div>
  );
}

const COLUMNS: Record<number, string> = {
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-4",
  5: "md:grid-cols-5",
  6: "md:grid-cols-6",
  7: "md:grid-cols-7",
};

/**
 * A table of `rows` rows and `columns` columns: a header band and cells from 768px (where the real tables switch to
 * a table), and a card of two lines per row below it (where they become cards), so nothing scrolls sideways.
 */
export function SkeletonTable({
  rows = 8,
  columns = 6,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  const grid = COLUMNS[columns] ?? COLUMNS[6];
  return (
    <div className={className} data-testid="skeleton-table">
      <div
        className={cn(
          "max-md:hidden grid gap-4 border-t border-line bg-surface-pale px-[14px] py-[10px]",
          grid,
        )}
      >
        {Array.from({ length: columns }, (_, index) => (
          <SkeletonLine key={index} className="h-[12px] w-2/3" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div
          key={row}
          className={cn("grid items-center gap-2 border-t border-line px-[14px] py-[10px] md:gap-4", grid)}
          data-testid="skeleton-table-row"
        >
          {Array.from({ length: columns }, (_, column) => (
            <SkeletonLine
              key={column}
              className={cn(
                column === 0 ? "h-[16px] w-5/6" : "w-2/3",
                column > 1 && "max-md:hidden",
                column === 1 && "max-md:w-1/3",
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A tab strip: a few tabs of the real height. */
export function SkeletonTabs({ count = 6 }: { count?: number }) {
  return (
    <div className="flex gap-[14px] overflow-hidden border-b border-line py-[14px]">
      {Array.from({ length: count }, (_, index) => (
        <SkeletonLine key={index} className="w-[72px] shrink-0" />
      ))}
    </div>
  );
}
