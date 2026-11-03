import "server-only";
import { legalPublished } from "@/content/legal/operator";
import { getSitemapFeed, type SitemapFeed } from "./catalog";
import { CATEGORY_SEO } from "./category-seo";
import { GUIDES } from "./guides";
import { isIndexableLanding, placePath, REMOTE_PATH } from "./landing";
import { absolute, STATIC_PATHS } from "./site";
import { JOB_CATEGORIES } from "./structured-data";

/**
 * XML sitemaps (ADR-0027): `/sitemap.xml` is a sitemap index; the files it lists are
 *   /sitemaps/pages.xml            static pages, guides, category lists, city and province pages, remote work
 *   /sitemaps/employers.xml        public employer profiles
 *   /sitemaps/jobs-N.xml           open listings that carry JobPosting data (jobs, internships, graduate programmes)
 *   /sitemaps/opportunities-N.xml  other open listings (scholarships, tenders, grants)
 * Listing files are cut into chunks of `chunkSize()` addresses, well under the protocol's 50,000-URL limit.
 * Only canonical, indexable addresses are listed. `lastmod` is only ever a real date: a listing's last publication,
 * a profile's last approval, a guide's last meaningful edit, or the newest publication on a landing page. Static pages
 * carry none. Search, filter, sort and page addresses, closed listings and private pages are never listed.
 */
export type UrlEntry = { loc: string; lastmod?: string };
export type IndexItem = { loc: string; lastmod?: string };

export const chunkSize = (): number => {
  const n = Number(process.env.UPNEXT_SITEMAP_CHUNK ?? 10000);
  return Number.isInteger(n) && n >= 1 && n <= 45000 ? n : 10000;
};

const iso = (value: string | null | undefined): string | undefined => {
  if (!value) return undefined;
  const t = Date.parse(value);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
};

const newest = (dates: (string | undefined)[]): string | undefined =>
  dates
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1);

const isJob = (category: string) => JOB_CATEGORIES.has(category);

function pageEntries(feed: SitemapFeed | null): UrlEntry[] {
  const published = legalPublished();
  const fixed: UrlEntry[] = STATIC_PATHS.filter(
    (path) => published || (path !== "/privacy" && path !== "/terms"),
  ).map((path) => {
    const guide = GUIDES.find((g) => g.path === path);
    return { loc: absolute(path), ...(guide ? { lastmod: `${guide.dateModified}T00:00:00.000Z` } : {}) };
  });
  if (!feed) return fixed;
  const categories = (feed.categories ?? [])
    .filter((c) => Object.hasOwn(CATEGORY_SEO, c.code) && c.count > 0)
    .map((c) => ({
      loc: absolute(`/opportunities?category=${c.code}`),
      ...(iso(c.updated_at) ? { lastmod: iso(c.updated_at) } : {}),
    }));
  const places = (feed.locations ?? [])
    .filter((l) => isIndexableLanding(l.count))
    .map((l) => ({
      loc: absolute(placePath(l.slug)),
      ...(iso(l.updated_at) ? { lastmod: iso(l.updated_at) } : {}),
    }));
  const remote =
    feed.remote && isIndexableLanding(feed.remote.count)
      ? [
          {
            loc: absolute(REMOTE_PATH),
            ...(iso(feed.remote.updated_at) ? { lastmod: iso(feed.remote.updated_at) } : {}),
          },
        ]
      : [];
  return [...fixed, ...categories, ...places, ...remote];
}

const employerEntries = (feed: SitemapFeed | null): UrlEntry[] =>
  (feed?.organisations ?? []).map((o) => ({
    loc: absolute(`/employers/${o.slug}`),
    ...(iso(o.updated_at) ? { lastmod: iso(o.updated_at) } : {}),
  }));

function listingEntries(feed: SitemapFeed | null, jobs: boolean): UrlEntry[] {
  return (feed?.data ?? [])
    .filter((e) => isJob(e.category) === jobs)
    .map((e) => ({
      loc: absolute(`/opportunities/${e.slug}`),
      ...(iso(e.updated_at) ? { lastmod: iso(e.updated_at) } : {}),
    }));
}

async function loadFeed(): Promise<SitemapFeed | null> {
  const result = await getSitemapFeed();
  return result.ok ? result.data : null;
}

const chunks = <T>(items: T[]): T[][] => {
  const size = chunkSize();
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/** Every file the index lists, with its entries. Empty listing groups produce no file. */
export async function buildSitemaps(): Promise<Map<string, UrlEntry[]>> {
  const feed = await loadFeed();
  const files = new Map<string, UrlEntry[]>();
  files.set("pages.xml", pageEntries(feed));
  const employers = employerEntries(feed);
  if (employers.length) files.set("employers.xml", employers);
  chunks(listingEntries(feed, true)).forEach((c, i) => files.set(`jobs-${i + 1}.xml`, c));
  chunks(listingEntries(feed, false)).forEach((c, i) => files.set(`opportunities-${i + 1}.xml`, c));
  return files;
}

export async function buildIndex(): Promise<IndexItem[]> {
  const files = await buildSitemaps();
  return [...files.entries()].map(([name, entries]) => {
    const lastmod = newest(entries.map((e) => e.lastmod));
    return { loc: absolute(`/sitemaps/${name}`), ...(lastmod ? { lastmod } : {}) };
  });
}

export const xmlEscape = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n';
const row = (tag: string, e: { loc: string; lastmod?: string }) =>
  `<${tag}><loc>${xmlEscape(e.loc)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ""}</${tag}>`;

export const renderUrlset = (entries: UrlEntry[]): string =>
  `${HEAD}<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map((e) => row("url", e)).join("\n")}\n</urlset>\n`;

export const renderIndex = (items: IndexItem[]): string =>
  `${HEAD}<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items.map((e) => row("sitemap", e)).join("\n")}\n</sitemapindex>\n`;

export const XML_HEADERS = {
  "Content-Type": "application/xml; charset=utf-8",
  "Cache-Control": "public, max-age=300",
  "X-Robots-Tag": "noindex", // the file is for crawlers; the addresses inside it are what should be indexed
};
