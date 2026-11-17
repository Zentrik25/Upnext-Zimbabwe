import "server-only";
import { cache } from "react";
import { getInsightsSitemap, getSitemapEntries, hasPlaces } from "./catalog";

/**
 * Which public sections hold something to show right now, so the navigation never sends a visitor to an empty one
 * (owner instruction 2026-11-16, D-79). Found on the live site that day: the header led to "Locations are not
 * available right now" and to a Career Insights page with no article, and the home page and the footer led to three
 * empty category lists. Google's publisher policies name "dead end" screens and pages "under construction" as places
 * where its advertisements may not appear.
 *
 * Nothing is removed for good: a section returns to the navigation by itself as soon as it has content, and its
 * address keeps working (and keeps its own `noindex` while empty, D-51) for anyone who has the link.
 *
 * An answer that could not be read keeps the link (fail open): a section is hidden only when the API said it is empty.
 */
export type SiteSections = {
  /** Whether a category list holds an open listing. */
  categoryOpen: (code: string) => boolean;
  /** Whether the place catalogue holds any place (the location directory and filter need one). */
  locations: boolean;
  /** Whether a Career Insights article is published. */
  insights: boolean;
};

export const ALL_SECTIONS: SiteSections = { categoryOpen: () => true, locations: true, insights: true };

/** Shared by the header, the footer and the page within one request; the three feeds are cached by the web tier. */
export const siteSections = cache(async (): Promise<SiteSections> => {
  const [feed, places, insights] = await Promise.all([
    getSitemapEntries(),
    hasPlaces(),
    getInsightsSitemap(),
  ]);
  const counted = feed.ok ? feed.data.categories : undefined;
  const open = counted ? new Set(counted.filter((c) => c.count > 0).map((c) => c.code)) : null;
  return {
    categoryOpen: (code) => open === null || open.has(code),
    locations: places,
    insights: !insights.ok || insights.data.articles.length > 0,
  };
});

/** The category a list address shows (`/opportunities?category=<code>`), or null for any other address. */
export function categoryOf(href: string): string | null {
  return /^\/opportunities\?category=([a-z-]+)$/.exec(href)?.[1] ?? null;
}

/** Whether a navigation link leads somewhere with content. Links to anything but the three sections always do. */
export function leadsSomewhere(href: string, sections: SiteSections): boolean {
  if (href === "/locations") return sections.locations;
  if (href === "/insights") return sections.insights;
  const category = categoryOf(href);
  return category === null || sections.categoryOpen(category);
}
