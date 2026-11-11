/**
 * Search Console noindex audit (2026-11): malformed category addresses, the unfilled search template, opportunity
 * metadata and canonical tags, the clean category policy and the sitemap. Each test fails if its fix is removed.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  permanentRedirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
  usePathname: () => "/",
}));
vi.mock("@/components/ads/ad-slot", () => ({ AdSlot: () => null }));
const catalog = vi.hoisted(() => ({
  getSitemapEntries: vi.fn(),
  listCategories: vi.fn(),
  listLocations: vi.fn(),
  getOpportunity: vi.fn(),
  listOpportunities: vi.fn(),
}));
vi.mock("@/lib/catalog", () => catalog);
vi.mock("@/lib/session", () => ({
  getCurrentUser: vi.fn(async () => null),
  getSavedIds: vi.fn(async () => new Set()),
}));
vi.mock("@/content/legal/operator", () => ({ legalPublished: () => false }));

import OpportunitiesPage, { generateMetadata as listMeta } from "@/app/opportunities/page";
import { generateMetadata as listingMeta } from "@/app/opportunities/[slug]/page";
import sitemap from "@/app/sitemap";
import type { OpportunityDetail } from "@/lib/catalog-types";
import { CATEGORY_SEO } from "@/lib/category-seo";
import { PRIORITY_DESTINATIONS } from "@/lib/destinations";
import { classifyList, repairCategory, repairedListAddress } from "@/lib/list-seo";
import { websiteFor } from "@/lib/structured-data";

process.env.UPNEXT_PUBLIC_BASE_URL = "https://upnext.co.zw";
const ORIGIN = "https://upnext.co.zw";
const srcDir = resolve(__dirname, "../../src");

describe("malformed category addresses (category=jobsJobs, category=tendersTenders)", () => {
  it("repairs a category written as its code twice or in another letter case", () => {
    expect(repairCategory("jobsJobs")).toBe("jobs");
    expect(repairCategory("tendersTenders")).toBe("tenders");
    expect(repairCategory("graduate-programmesGraduate programmes")).toBe("graduate-programmes");
    expect(repairCategory("Jobs")).toBe("jobs");
  });
  it("never guesses: other values stay unknown filters", () => {
    for (const value of ["jobsTenders", "jobsjobsjobs", "job", "", "jobs,tenders", "no-such"])
      expect(repairCategory(value), value).toBeUndefined();
  });
  it("sends a malformed category to the clean list with one permanent redirect, keeping the other filters", () => {
    expect(repairedListAddress({ category: "jobsJobs" })).toBe("/opportunities?category=jobs");
    expect(repairedListAddress({ category: "tendersTenders", location: "harare" })).toBe(
      "/opportunities?category=tenders&location=harare",
    );
    expect(repairedListAddress({ category: "jobs" })).toBeNull();
    expect(repairedListAddress({ category: "no-such" })).toBeNull();
    expect(repairedListAddress({})).toBeNull();
  });
  it("does that in the page and in its metadata", async () => {
    const searchParams = Promise.resolve({ category: "jobsJobs" });
    await expect(listMeta({ searchParams })).rejects.toThrow("NEXT_REDIRECT /opportunities?category=jobs");
    await expect(OpportunitiesPage({ searchParams })).rejects.toThrow(
      "NEXT_REDIRECT /opportunities?category=jobs",
    );
  });
  it("is not produced by any link in the source: every literal category address names a real category", () => {
    const bad: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(name)) {
          for (const m of readFileSync(full, "utf8").matchAll(
            /\/(?:opportunities|for-you|saved)\?category=([A-Za-z0-9-]+)(?![A-Za-z0-9${-])/g,
          ))
            if (!Object.hasOwn(CATEGORY_SEO, m[1]!)) bad.push(`${full}: ${m[0]}`);
        }
      }
    };
    walk(srcDir);
    expect(bad).toEqual([]);
  });
  it("every priority destination and the sitemap list only exact category codes", () => {
    for (const d of PRIORITY_DESTINATIONS) {
      const code = new URL(d.href, ORIGIN).searchParams.get("category");
      if (code) expect(Object.hasOwn(CATEGORY_SEO, code), d.href).toBe(true);
    }
  });
});

describe("the search template", () => {
  it("is not in the site's structured data, so no crawler is handed a literal placeholder", () => {
    expect(JSON.stringify(websiteFor(ORIGIN))).not.toMatch(/search_term_string|SearchAction|%7B/i);
  });
  it("sends a request carrying the unfilled placeholder to the plain list, dropping only the search words", () => {
    expect(repairedListAddress({ q: "{search_term_string}" })).toBe("/opportunities");
    expect(repairedListAddress({ q: "{SEARCH_TERM_STRING}", category: "jobs" })).toBe(
      "/opportunities?category=jobs",
    );
  });
  it("keeps real searches working: a searched list stays a noindex view canonical to its list", () => {
    expect(repairedListAddress({ q: "engineer" })).toBeNull();
    expect(classifyList({ q: "engineer" })).toMatchObject({
      index: false,
      canonical: "/opportunities",
    });
    expect(classifyList({ q: "engineer", category: "jobs" })).toMatchObject({
      index: false,
      canonical: "/opportunities?category=jobs",
    });
  });
});

describe("clean category filters (policy)", () => {
  it("each of the six launch categories is an indexable, self-canonical landing list; nothing else is", () => {
    expect(Object.keys(CATEGORY_SEO).sort()).toEqual(
      ["graduate-programmes", "grants", "internships", "jobs", "scholarships", "tenders"].sort(),
    );
    for (const code of Object.keys(CATEGORY_SEO))
      expect(classifyList({ category: code })).toMatchObject({
        index: true,
        canonical: `/opportunities?category=${code}`,
      });
  });
  it("a category list with no open listing is noindex, follow, still canonical to itself", async () => {
    catalog.listOpportunities.mockResolvedValue({ ok: true, data: { data: [], page: {} } });
    const meta = await listMeta({ searchParams: Promise.resolve({ category: "grants" }) });
    expect(meta.robots).toEqual({ index: false, follow: true });
    expect(meta.alternates?.canonical).toBe("/opportunities?category=grants");
  });
  it("a category list with open listings has no robots tag", async () => {
    catalog.listOpportunities.mockResolvedValue({ ok: true, data: { data: [{ id: "1" }], page: {} } });
    const meta = await listMeta({ searchParams: Promise.resolve({ category: "jobs" }) });
    expect(meta.robots).toBeUndefined();
  });
});

const listing = (over: Partial<OpportunityDetail> = {}) =>
  ({
    id: "1",
    slug: "driver-salesperson-4q3mkv",
    title: "Driver Salesperson",
    summary: "Sell and deliver.",
    category: { code: "jobs", name: "Jobs" },
    organisation: { id: "o", name: "Example Foods" },
    locations: [{ slug: "harare", name: "Harare", is_primary: true }],
    work_mode: "on_site",
    employment_type: "full_time",
    deadline: { at: "2099-01-01T21:59:59Z", timezone: "Africa/Harare", is_date_only: true, state: "open" },
    status: "published",
    published_at: "2026-10-17T10:00:00Z",
    description_html: "<p>Drive.</p>",
    canonical_path: "/opportunities/driver-salesperson-4q3mkv",
    seo: { title: null, description: null, og_title: null, og_description: null },
    image: null,
    ...over,
  }) as unknown as OpportunityDetail;

describe("opportunity detail metadata", () => {
  beforeEach(() => catalog.getOpportunity.mockReset());
  const meta = (data: OpportunityDetail) => {
    catalog.getOpportunity.mockResolvedValue({ ok: true, data });
    return listingMeta({ params: Promise.resolve({ slug: data.slug }) });
  };
  it("an open, approved listing is indexable and canonical to its own address", async () => {
    const m = await meta(listing());
    expect(m.robots).toBeUndefined();
    expect(m.alternates?.canonical).toBe("/opportunities/driver-salesperson-4q3mkv");
  });
  it("a listing closing soon or with no stated deadline is still indexable", async () => {
    for (const state of ["closing_soon", "unknown"] as const) {
      const m = await meta(
        listing({ deadline: { at: null, timezone: "Africa/Harare", is_date_only: false, state } } as never),
      );
      expect(m.robots, state).toBeUndefined();
    }
  });
  it("noindex is explained only by a closed state: past deadline, expired, withdrawn or archived", async () => {
    const expired = {
      at: "2026-10-01T00:00:00Z",
      timezone: "Africa/Harare",
      is_date_only: true,
      state: "expired",
    };
    expect((await meta(listing({ deadline: expired } as never))).robots).toEqual({ index: false });
    for (const status of ["expired", "withdrawn", "archived", "closed"])
      expect((await meta(listing({ status } as never))).robots, status).toEqual({ index: false });
  });
  it("a closed listing keeps the canonical tag, so Google consolidates rather than guesses", async () => {
    const m = await meta(listing({ status: "expired" } as never));
    expect(m.alternates?.canonical).toBe("/opportunities/driver-salesperson-4q3mkv");
  });
});

describe("sitemap against the indexing policy", () => {
  beforeEach(() => catalog.getSitemapEntries.mockReset());
  it("lists only addresses the metadata policy indexes, each canonical to itself", async () => {
    catalog.getSitemapEntries.mockResolvedValue({
      ok: true,
      data: {
        data: [{ slug: "driver-salesperson-4q3mkv", updated_at: "2026-10-20T08:00:00Z" }],
        categories: [
          { code: "jobs", count: 4, updated_at: "2026-10-21T08:00:00Z" },
          { code: "tenders", count: 0, updated_at: null },
          { code: "jobsJobs", count: 9, updated_at: null },
          { code: "tendersTenders", count: 9, updated_at: null },
        ],
        collections: [],
        employers: [],
      },
    });
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain(`${ORIGIN}/opportunities?category=jobs`);
    expect(urls).not.toContain(`${ORIGIN}/opportunities?category=tenders`);
    expect(urls.some((u) => /jobsJobs|tendersTenders|search_term_string|[{}]/.test(u))).toBe(false);
    expect(urls).toContain(`${ORIGIN}/opportunities/driver-salesperson-4q3mkv`);
    for (const url of urls) {
      const { pathname, search } = new URL(url);
      if (pathname === "/opportunities") {
        const view = classifyList(Object.fromEntries(new URLSearchParams(search)));
        expect(view.index, url).toBe(true);
        expect(`${pathname}${search}`).toBe(view.canonical);
      }
    }
  });
});
