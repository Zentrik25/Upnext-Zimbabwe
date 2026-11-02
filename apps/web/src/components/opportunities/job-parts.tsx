import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { deadlineView, labelFor, locationLabel } from "@/lib/format";
import { initialsOf } from "@/lib/initials";
import type { OpportunitySummary } from "@/lib/catalog-types";

/** A fact about the listing as a light-purple chip with an icon (the mobile job page). Plain text only. */
export function Chip({
  icon,
  tone = "default",
  children,
}: {
  icon: IconName;
  tone?: "default" | "good" | "urgent" | "muted";
  children: ReactNode;
}) {
  const tones = {
    default: "bg-match-bg text-company [&>svg]:text-accent",
    good: "bg-good-bg text-good [&>svg]:text-good",
    urgent: "bg-urgent-bg text-urgent [&>svg]:text-urgent",
    muted: "bg-surface-pale text-meta [&>svg]:text-muted",
  };
  return (
    <li
      className={cn(
        "inline-flex min-h-[36px] items-center gap-1.5 rounded-card px-3 py-1 text-ctl leading-none",
        tones[tone],
      )}
    >
      <Icon name={icon} className="h-[18px] w-[18px] shrink-0" />
      <span>{children}</span>
    </li>
  );
}

/** The organisation's mark: its initials in a small square (the API carries no logo), and the name. */
export function OrgMark({ name, size = "lg" }: { name: string; size?: "lg" | "sm" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-card border border-avatar-border bg-avatar-bg font-bold text-avatar-text",
        size === "lg" ? "h-14 w-14 text-title" : "h-12 w-12 text-base",
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

/** A section of the listing: a thin divider above, a small purple icon and a bold heading. */
export function Block({
  id,
  icon,
  title,
  children,
  divider = true,
}: {
  id?: string;
  icon?: IconName;
  title: string;
  children: ReactNode;
  divider?: boolean;
}) {
  return (
    <section id={id} className={cn("scroll-mt-16 pt-4", divider && "mt-4 border-t border-line")}>
      <h2 className="m-0 mb-2 flex items-center gap-2 text-title font-strong leading-title text-ink">
        {icon ? <Icon name={icon} className="h-6 w-6 shrink-0 text-accent" /> : null}
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * A heading the section already carries ("Responsibilities" under "Key responsibilities") is dropped from the
 * body, so the same word is never printed twice. Only a whole heading with exactly such a title is removed.
 */
export function withoutRepeatedHeadings(html: string): string {
  return html.replace(
    /<h[1-6][^>]*>\s*(?:key\s+)?(?:responsibilities|duties|qualifications(?:\s*(?:&amp;|and)\s*experience)?|requirements|how to apply|overview)\s*:?\s*<\/h[1-6]>\s*/gi,
    "",
  );
}

/** One related listing: initials mark, title, organisation, three facts and a chevron. */
export function RelatedCard({ row }: { row: OpportunitySummary }) {
  const deadline = deadlineView(row.deadline, row.status);
  const place = locationLabel(row);
  const type = labelFor(row.employment_type);
  return (
    <li className="list-none">
      <Link
        href={`/opportunities/${row.slug}`}
        className="flex items-center gap-3 rounded-card border border-line bg-surface p-3 hover:bg-row-hover"
      >
        <OrgMark name={row.organisation.name} size="sm" />
        <span className="grid min-w-0 flex-1 gap-1">
          <span className="text-base font-strong leading-title text-ink [overflow-wrap:anywhere]">
            {row.title}
          </span>
          <span className="text-ctl text-company">{row.organisation.name}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-meta">
            {place ? (
              <span className="inline-flex items-center gap-1">
                <Icon name="pin" className="h-3.5 w-3.5 text-accent" />
                {place}
              </span>
            ) : null}
            {type ? (
              <span className="inline-flex items-center gap-1 rounded-control bg-match-bg px-1.5 py-0.5 text-company">
                <Icon name="briefcase" className="h-3.5 w-3.5 text-accent" />
                {type}
              </span>
            ) : null}
            {row.deadline.at ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-control px-1.5 py-0.5",
                  deadline.tone === "urgent" ? "bg-urgent-bg text-urgent" : "bg-surface-pale text-meta",
                )}
              >
                <Icon name="clock" className="h-3.5 w-3.5" />
                {deadline.label}
              </span>
            ) : null}
          </span>
        </span>
        <Icon name="chevronRight" className="h-5 w-5 shrink-0 text-muted" />
        <span className="sr-only">View {row.title}</span>
      </Link>
    </li>
  );
}
