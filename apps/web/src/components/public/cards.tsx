import Link from "next/link";
import { Icon, CATEGORY_ICON } from "@/components/ui/icons";
import { CATEGORY_SEO } from "@/lib/category-seo";
import { CATEGORY_SUMMARY } from "@/lib/filters";
import type { GUIDES } from "@/lib/guides";

const CARD =
  "flex h-full flex-col gap-2 rounded-card border border-line bg-surface p-5 hover:bg-surface-pale";

/** One of the six launch categories: its list heading, what it holds, and a plain link. No count is shown because
 *  none is available without an extra request, and a made-up one would mislead. */
export function CategoryCard({ code }: { code: string }) {
  const copy = CATEGORY_SEO[code];
  if (!copy) return null;
  return (
    <Link href={`/opportunities?category=${code}`} className={CARD}>
      <Icon name={CATEGORY_ICON[code] ?? "grid"} className="h-6 w-6 text-accent" />
      <span className="text-title font-strong text-ink">{copy.heading}</span>
      <span className="text-ctl text-muted">{CATEGORY_SUMMARY[code] ?? copy.description}</span>
      <span className="mt-auto pt-2 text-ctl text-link">View opportunities</span>
    </Link>
  );
}

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

/** A career guide teaser: title, description and the date its text last changed. */
export function GuideCard({ guide }: { guide: (typeof GUIDES)[number] }) {
  return (
    <Link href={guide.path} className={CARD}>
      <span className="text-title font-strong text-ink">{guide.title}</span>
      <span className="text-ctl text-muted">{guide.description}</span>
      <span className="mt-auto pt-2 text-small text-muted">
        Updated <time dateTime={guide.dateModified}>{longDate(guide.dateModified)}</time>
      </span>
    </Link>
  );
}

/** A section heading with an optional "view all" link, used by every home section. */
export function SectionHeading({
  id,
  title,
  href,
  linkLabel = "View all",
  hiddenLabel,
}: {
  id: string;
  title: string;
  href?: string;
  linkLabel?: string;
  hiddenLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <h2 id={id} className="m-0 text-sub">
        {title}
      </h2>
      {href ? (
        <Link href={href} className="inline-flex min-h-[24px] items-center gap-1 text-ctl text-link">
          {linkLabel}
          {hiddenLabel ? <span className="sr-only"> {hiddenLabel}</span> : null}
          <Icon name="arrowRight" className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );
}
