import type { ReactNode } from "react";
import { ButtonLink } from "./button";
import { SaveButton } from "./save-button";
import { Tag, type TagTone } from "./tag";

export type ListingRowProps = {
  organisation: string;
  title: string;
  href: string;
  facts: string[];
  tags?: { label: string; tone?: TagTone }[];
  sourceNote?: ReactNode;
  /** Static save control for presentational use. Omit it when there is nothing to save. */
  saved?: boolean;
  /** Optional block under the facts (for example why a recommendation is shown). */
  extra?: ReactNode;
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
 * As in the reference, plain facts are unboxed text; only `tags` (deadline, source status) are boxed chips.
 */
export function ListingRow({
  organisation,
  title,
  href,
  facts,
  tags = [],
  sourceNote,
  saved,
  action,
  extra,
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
          <h3 className="text-title font-strong leading-title">
            <a href={href}>{title}</a>
          </h3>
          <p className="mt-[3px] text-ctl text-company">{organisation}</p>
        </div>
        {action ? (
          <div className="ml-auto">{action}</div>
        ) : saved === undefined ? null : (
          <SaveButton title={title} saved={saved} className="ml-auto" />
        )}
      </div>
      <ul className="m-0 my-3 flex list-none flex-wrap gap-[10px] p-0 text-small text-meta">
        {facts.map((fact) => (
          <li key={fact}>{fact}</li>
        ))}
        {tags.map((tag) => (
          <li key={tag.label}>
            <Tag tone={tag.tone}>{tag.label}</Tag>
          </li>
        ))}
      </ul>
      {extra}
      <div className="mt-[13px] flex items-center justify-between gap-2">
        <span className="text-small text-muted">{sourceNote}</span>
        <ButtonLink
          variant="secondary"
          href={href}
          aria-label={`View details for ${title}`}
          className="whitespace-nowrap"
        >
          View details
        </ButtonLink>
      </div>
    </article>
  );
}
