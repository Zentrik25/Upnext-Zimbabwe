import type { MetadataRoute } from "next";
import { getSitemapEntries } from "@/lib/catalog";
import { CATEGORY_SEO } from "@/lib/category-seo";
import { GUIDES } from "@/lib/guides";
import { LANDING_MIN_LISTINGS, landingPage, landingPath } from "@/lib/landing-pages";
import { absolute, STATIC_PATHS } from "@/lib/site";
import { unavailable } from "@/lib/unavailable";
import { legalPublished } from "@/content/legal/operator";

export const dynamic = "force-dynamic";

const GUIDE_DATES = new Map<string, string>(GUIDES.map((g) => [g.path, g.dateModified]));
const date = (iso: string | null | undefined) => (iso ? new Date(iso) : undefined);

/**
 * Canonical, public, indexable addresses only, each with a real `lastmod` where one exists:
 *  - the static pages (no date: they have no recorded change time, and a made-up one would mislead), the guides (the
 *    date their text last changed);
 *  - one list per catalogue category while it holds an open listing (the newest publication in it);
 *  - each landing page while it holds at least `LANDING_MIN_LISTINGS` open listings (the same rule as its `robots`);
 *  - every open published listing (its last publication: first publication or the last material change);
 *  - every public company profile (the approval of its live revision).
 * Closed, withdrawn and archived listings, search, filter, sort and page addresses, empty lists and almost empty
 * landing pages are never listed (P4-03, D-51, D-68). One API request feeds the whole file.
 *
 * If that request fails the file is answered with a server error rather than a shortened list: a crawler then keeps
 * the last good copy and tries again, instead of seeing every listing vanish (SEO-B03). The API caps the listings at
 * 49,000 so one file stays under the protocol's 50,000-URL limit; past that, split with `generateSitemaps`.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const feed = await getSitemapEntries();
  if (!feed.ok) unavailable(feed.reason);
  // The legal pages are listed only once the owner has recorded their approval (UPNEXT_LEGAL_APPROVED).
  const open = legalPublished();
  const fixed = STATIC_PATHS.filter((path) => open || (path !== "/privacy" && path !== "/terms")).map(
    (path) => ({ url: absolute(path), lastModified: date(GUIDE_DATES.get(path)) }),
  );
  const { data, categories = [], collections = [], employers = [] } = feed.data;
  const lists = categories
    .filter((c) => Object.hasOwn(CATEGORY_SEO, c.code) && c.count > 0)
    .map((c) => ({ url: absolute(`/opportunities?category=${c.code}`), lastModified: date(c.updated_at) }));
  const landings = collections
    .filter((c) => landingPage(c.slug) && c.count >= LANDING_MIN_LISTINGS)
    .map((c) => ({ url: absolute(landingPath(c.slug)), lastModified: date(c.updated_at) }));
  const listings = data.map((entry) => ({
    url: absolute(`/opportunities/${entry.slug}`),
    lastModified: date(entry.updated_at),
  }));
  const profiles = employers.map((entry) => ({
    url: absolute(`/employers/${entry.slug}`),
    lastModified: date(entry.updated_at),
  }));
  return [...fixed, ...lists, ...landings, ...listings, ...profiles];
}
