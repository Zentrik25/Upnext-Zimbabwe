import type { MetadataRoute } from "next";
import { getSitemapEntries } from "@/lib/catalog";
import { absolute, STATIC_PATHS } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * Static pages plus every open published listing. Closed, withdrawn and archived listings stay readable by
 * their address but are not listed (provisional default P4-03). Filter, search and page URLs are not listed.
 * If the API cannot be reached the file lists the static pages only.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fixed = STATIC_PATHS.map((path) => ({ url: absolute(path === "/" ? "/" : path) }));
  const result = await getSitemapEntries();
  const listings = result.ok
    ? result.data.data.map((entry) => ({
        url: absolute(`/opportunities/${entry.slug}`),
        lastModified: new Date(entry.updated_at),
      }))
    : [];
  return [...fixed, ...listings];
}
