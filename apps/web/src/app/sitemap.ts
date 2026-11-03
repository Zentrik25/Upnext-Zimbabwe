import type { MetadataRoute } from "next";
import { getSitemapEntries, listCategories, listOpportunities } from "@/lib/catalog";
import { CATEGORY_SEO } from "@/lib/category-seo";
import { absolute, STATIC_PATHS } from "@/lib/site";
import { legalPublished } from "@/content/legal/operator";

export const dynamic = "force-dynamic";

/**
 * Canonical, public, indexable addresses only: the static pages, one list per catalogue category, and every open
 * published listing. Closed, withdrawn and archived listings stay readable by their address but are not listed
 * (provisional default P4-03); search, filter, sort and page addresses, and category lists with no open listing, are not listed. `lastmod` appears only where
 * a real date exists (a listing's last publication); static pages and category lists carry none rather than a
 * made-up one. If the API cannot be reached the file lists the static pages only. The API caps the feed at 49,000
 * listings so one file always stays under the protocol's 50,000-URL limit; past that, split with `generateSitemaps`.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // The legal pages are listed only once the owner has recorded their approval (UPNEXT_LEGAL_APPROVED).
  const open = legalPublished();
  const fixed = STATIC_PATHS.filter((path) => open || (path !== "/privacy" && path !== "/terms")).map(
    (path) => ({ url: absolute(path === "/" ? "/" : path) }),
  );
  const [result, categories] = await Promise.all([getSitemapEntries(), listCategories()]);
  // A category list is offered only while it holds at least one open listing, the same rule the page applies to
  // its own `robots` tag, so the sitemap never lists an address the page marks `noindex`.
  const known = categories.filter((c) => Object.hasOwn(CATEGORY_SEO, c.code));
  const counts = await Promise.all(
    known.map((c) => listOpportunities(new URLSearchParams({ category: c.code, limit: "1" }))),
  );
  const lists = known
    .filter((_, i) => counts[i]!.ok && counts[i]!.data.data.length > 0)
    .map((c) => ({ url: absolute(`/opportunities?category=${c.code}`) }));
  const listings = result.ok
    ? result.data.data.map((entry) => ({
        url: absolute(`/opportunities/${entry.slug}`),
        lastModified: new Date(entry.updated_at),
      }))
    : [];
  return [...fixed, ...lists, ...listings];
}
