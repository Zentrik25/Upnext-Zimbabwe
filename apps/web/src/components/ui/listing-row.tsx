import type { ReactNode } from "react";
import { SaveButton } from "./save-button";
import { Tag, type TagTone } from "./tag";

export type ListingRowProps = {
  organisation: string;
  title: string;
  href: string;
  facts: string[];
  tags?: { label: string; tone?: TagTone }[];
  /** Static save control for presentational use. Omit it when there is nothing to save. */
  saved?: boolean;
  /** Optional block under the facts (for example why a recommendation is shown). */
  extra?: ReactNode;
  /** The listing's own featured picture (never an employer logo). Decorative here: the title link names the row. */
  image?: string | null;
  /** Replaces the save control (the live toggle comes from the page, since it needs the session). */
  action?: ReactNode;
};

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("");
}

/**
 * Presentational listing row (no data fetching): divider-separated, no card border, hover tint.
 * As in the reference, plain facts are unboxed text; only `tags` (deadline, verification) are boxed chips.
 */
export function ListingRow({
  organisation,
  title,
  href,
  facts,
  tags = [],
  saved,
  action,
  extra,
  image,
}: ListingRowProps) {
  return (
    <article className="border-b border-line px-[14px] py-[15px] hover:bg-row-hover">
      <div className="flex items-start gap-[11px]">
        <div
          aria-hidden="true"
          className="grid h-avatar w-avatar shrink-0 place-items-center rounded-card border border-avatar-border bg-avatar-bg font-bold text-avatar-text"
        >
          {initials(organisation)}
        </div>
        <div className="min-w-0">
          <h3 className="text-lead font-strong leading-title tracking-title">
            <a href={href}>{title}</a>
          </h3>
          <p className="mt-[3px] text-ctl text-company">{organisation}</p>
        </div>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- a small card picture served from our own media path
          <img
            src={image}
            alt=""
            loading="lazy"
            width={96}
            height={54}
            className="ml-auto hidden h-[54px] w-24 shrink-0 rounded-card border border-line object-cover sm:block"
          />
        ) : null}
        {action ? (
          <div className={image ? "" : "ml-auto"}>{action}</div>
        ) : saved === undefined ? null : (
          <SaveButton title={title} saved={saved} className="ml-auto" />
        )}
      </div>
      <ul className="m-0 mt-3 flex list-none flex-wrap items-center gap-x-[10px] gap-y-2 p-0 text-small text-meta">
        {facts.map((fact) => (
          <li key={fact}>{fact}</li>
        ))}
        {tags.map((tag) => (
          <li key={tag.label}>
            <Tag tone={tag.tone}>{tag.label}</Tag>
          </li>
        ))}
        <li className="ml-auto">
          <a
            href={href}
            aria-label={`View details for ${title}`}
            className="inline-flex min-h-[24px] items-center whitespace-nowrap text-ctl text-link hover:underline"
          >
            View details
          </a>
        </li>
      </ul>
      {extra}
    </article>
  );
}
