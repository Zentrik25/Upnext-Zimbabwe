import type { OpportunityDetail } from "./catalog-types";
import { deadlineView, labelFor, locationLabel } from "./format";

/**
 * The text of a listing's shared-link preview card (WhatsApp, Facebook, LinkedIn, X). It is built only from what the
 * listing already says, so a card never claims more than the page: no invented image, no logo, no counts. Pure, so
 * the clamping and the wording are testable without rendering a picture.
 */
export type ListingCard = {
  initials: string;
  category: string;
  title: string;
  titleSize: number;
  organisation: string;
  facts: string[];
};

/** Two initials of the organisation, as the listing rows show them. */
export function initialsOf(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word][0] ?? "")
    .join("")
    .toUpperCase();
  return letters || "U";
}

/** Cuts at a word boundary and adds an ellipsis when the text is longer than `max` characters. */
export function clamp(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** Longer titles get smaller type so three lines always fit on the 1200x630 card. */
export function titleSizeFor(title: string): number {
  if (title.length <= 44) return 68;
  if (title.length <= 70) return 56;
  return 46;
}

export function cardFor(listing: OpportunityDetail): ListingCard {
  const title = clamp(listing.title, 110);
  return {
    initials: initialsOf(listing.organisation.name),
    category: listing.category.name,
    title,
    titleSize: titleSizeFor(title),
    organisation: clamp(listing.organisation.name, 60),
    facts: [
      locationLabel(listing),
      labelFor(listing.employment_type),
      deadlineView(listing.deadline, listing.status).label,
    ].filter((fact): fact is string => Boolean(fact)),
  };
}
