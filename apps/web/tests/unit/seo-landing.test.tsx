import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);
vi.mock("next/navigation", () => ({
  notFound,
  usePathname: () => "/",
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
const catalog = vi.hoisted(() => ({
  getSitemapFeed: vi.fn(),
  listLocations: vi.fn(),
  listOpportunities: vi.fn(),
  listCategories: vi.fn(),
}));
vi.mock("@/lib/catalog", () => catalog);
vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn(), getSavedIds: vi.fn() }));

import LocationPage, { generateMetadata as locationMeta } from "@/app/locations/[slug]/page";
import RemotePage, { generateMetadata as remoteMeta } from "@/app/remote-jobs/page";
import robots from "@/app/robots";
import { GET as llmsRoute } from "@/app/llms.txt/route";
import {
  PRIVATE_PATHS,
  SEARCH_AND_ANSWER_CRAWLERS,
  TRAINING_CRAWLERS,
  trainingCrawlersAllowed,
} from "@/lib/crawler-policy";
import { isIndexableLanding, MIN_LANDING_LISTINGS } from "@/lib/landing";
import { classifyList } from "@/lib/list-seo";
import { llmsTxt } from "@/lib/llms";
import { GUIDES } from "@/lib/guides";

process.env.UPNEXT_PUBLIC_BASE_URL = "https://upnext.co.zw";
const ORIGIN = "https://upnext.co.zw";
afterEach(cleanup);

const row = (n: number) => ({
  id: `id-${n}`,
  slug: `job-${n}-abcdef`,
  title: `Job ${n}`,
  summary: "A role.",
  category: { code: "jobs", name: "Jobs" },
  organisation: { id: "o", name: "Org" },
  locations: [{ slug: "harare", name: "Harare", is_primary: true }],
  work_mode: null,
  employment_type: null,
  deadline: { at: null, timezone: null, is_date_only: false, state: "unknown" },
  salary: null,
  salary_text: null,
  location_text: null,
  verification: { level: "not_verified", checked_at: null },
  primary_source_name: "Source",
  image: null,
  status: "published",
  published_at: "2026-10-30T08:00:00Z",
  is_saved: null,
});
const rows = (n: number) => Array.from({ length: n }, (_, i) => row(i + 1));
const list = (n: number, hasMore = false) => ({
  ok: true,
  data: { data: rows(n), page: { limit: 20, has_more: hasMore, next_cursor: null, total: null } },
});
const feed = {
  ok: true,
  data: {
    data: [],
    organisations: [],
    categories: [],
    locations: [
      { slug: "harare", name: "Harare", count: 5, updated_at: null },
      { slug: "bulawayo", name: "Bulawayo", count: 3, updated_at: null },
      { slug: "gweru", name: "Gweru", count: 1, updated_at: null },
    ],
    remote: { count: 4, updated_at: null },
  },
};

beforeEach(() => {
  for (const fn of Object.values(catalog)) fn.mockReset();
  notFound.mockClear();
  catalog.listLocations.mockResolvedValue([
    { id: "1", slug: "zimbabwe", name: "Zimbabwe", kind: "country", parent_slug: null },
    { id: "2", slug: "harare", name: "Harare", kind: "city", parent_slug: null },
    { id: "3", slug: "remote", name: "Remote", kind: "remote", parent_slug: null },
  ]);
  catalog.getSitemapFeed.mockResolvedValue(feed);
});

describe("landing pages: indexing rule", () => {
  it("indexes a place only from three open listings, with its own canonical", async () => {
    catalog.listOpportunities.mockResolvedValue(list(MIN_LANDING_LISTINGS));
    const meta = await locationMeta({ params: Promise.resolve({ slug: "harare" }) });
    expect(meta.robots).toBeUndefined();
    expect(meta.alternates?.canonical).toBe("/locations/harare");
    expect(meta.title).toBe("Jobs and Opportunities in Harare, Zimbabwe");
    expect(meta.openGraph?.url).toBe("/locations/harare");
    expect(meta.twitter?.title).toBe(meta.title);
  });
  it("keeps a thin or failed place page out of the index but follows its links", async () => {
    catalog.listOpportunities.mockResolvedValue(list(MIN_LANDING_LISTINGS - 1));
    expect((await locationMeta({ params: Promise.resolve({ slug: "harare" }) })).robots).toEqual({
      index: false,
      follow: true,
    });
    catalog.listOpportunities.mockResolvedValue({ ok: false, reason: "unreachable" });
    expect((await locationMeta({ params: Promise.resolve({ slug: "harare" }) })).robots).toEqual({
      index: false,
      follow: true,
    });
  });
  it("has no page for an unknown place, the country or remote", async () => {
    for (const slug of ["no-such-town", "zimbabwe", "remote"]) {
      expect((await locationMeta({ params: Promise.resolve({ slug }) })).robots).toEqual({ index: false });
      await expect(LocationPage({ params: Promise.resolve({ slug }) })).rejects.toThrow("NEXT_NOT_FOUND");
    }
  });
  it("remote jobs follow the same threshold", async () => {
    catalog.listOpportunities.mockResolvedValue(list(3));
    const meta = await remoteMeta();
    expect(meta.robots).toBeUndefined();
    expect(meta.alternates?.canonical).toBe("/remote-jobs");
    catalog.listOpportunities.mockResolvedValue(list(1));
    expect((await remoteMeta()).robots).toEqual({ index: false, follow: true });
  });
  it("one rule for the sitemap and the page", () => {
    expect(isIndexableLanding(2)).toBe(false);
    expect(isIndexableLanding(3)).toBe(true);
  });
});

describe("landing pages: content", () => {
  it("renders one H1, a truthful introduction, crawlable listing links and internal links", async () => {
    catalog.listOpportunities.mockResolvedValue(list(4));
    render(await LocationPage({ params: Promise.resolve({ slug: "harare" }) }));
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Jobs and opportunities in Harare");
    expect(screen.getByTestId("landing-intro").textContent).toContain("4 open listings in Harare");
    const listings = within(screen.getByTestId("landing-listings")).getAllByRole("link");
    expect(listings.some((a) => a.getAttribute("href") === "/opportunities/job-1-abcdef")).toBe(true);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/opportunities?category=jobs");
    expect(hrefs).toContain("/locations/bulawayo"); // another place that qualifies
    expect(hrefs).not.toContain("/locations/gweru"); // one listing: below the threshold
    expect(hrefs).not.toContain("/locations/harare"); // not linked to itself
    expect(hrefs).toContain("/remote-jobs");
    expect(document.querySelector('script[type="application/ld+json"]')?.textContent).toContain(
      "BreadcrumbList",
    );
  });
  it("says so honestly when there is nothing open, and offers the way out", async () => {
    catalog.listOpportunities.mockResolvedValue(list(0));
    render(await LocationPage({ params: Promise.resolve({ slug: "harare" }) }));
    expect(
      screen.getByRole("heading", { level: 3, name: /No open listings in Harare right now/ }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("landing-intro")).toBeNull();
    expect(screen.getByRole("link", { name: /All opportunities/ }).getAttribute("href")).toBe(
      "/opportunities",
    );
  });
  it("points to the full list when there are more than one page of listings", async () => {
    catalog.listOpportunities.mockResolvedValue(list(20, true));
    render(await RemotePage());
    expect(screen.getByTestId("landing-intro").textContent).toContain("The 20 newest open listings");
    expect(screen.getByRole("link", { name: "See the full list" }).getAttribute("href")).toBe(
      "/opportunities?work_mode=remote",
    );
  });
  it("shows an unavailable state, not an empty page, when the API cannot be reached", async () => {
    catalog.listOpportunities.mockResolvedValue({ ok: false, reason: "unreachable" });
    render(await LocationPage({ params: Promise.resolve({ slug: "harare" }) }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});

describe("list addresses that belong to a landing page", () => {
  const places = new Set(["harare"]);
  it("a list narrowed to one known place canonicalises to its landing page, noindex", () => {
    expect(classifyList({ location: "harare" }, places)).toMatchObject({
      index: false,
      canonical: "/locations/harare",
    });
    expect(classifyList({ work_mode: "remote" })).toMatchObject({ index: false, canonical: "/remote-jobs" });
  });
  it("any other combination keeps its earlier canonical (no thousands of combination pages)", () => {
    expect(classifyList({ location: "harare", category: "jobs" }, places)).toMatchObject({
      canonical: "/opportunities?category=jobs",
    });
    expect(classifyList({ location: "unknown" }, places).canonical).toBe("/opportunities");
    expect(classifyList({ location: "harare", work_mode: "remote" }, places).canonical).toBe(
      "/opportunities",
    );
  });
});

describe("crawler-access policy in robots.txt", () => {
  type Rule = { userAgent?: string | string[]; allow?: string; disallow?: string | string[] };
  const rulesFor = (agent: string): Rule | undefined => {
    const all = robots().rules as Rule[];
    return (
      all.find((r) => [r.userAgent].flat().includes(agent)) ??
      all.find((r) => [r.userAgent].flat().includes("*"))
    );
  };
  afterEach(() => {
    delete process.env.UPNEXT_AI_TRAINING_CRAWLERS;
  });
  it("lets every search and answer crawler fetch the public pages and keeps the private areas closed", () => {
    for (const agent of SEARCH_AND_ANSWER_CRAWLERS) {
      const rule = rulesFor(agent)!;
      const disallow = [rule.disallow].flat();
      expect(disallow, agent).not.toContain("/");
      expect(disallow, agent).toEqual(PRIVATE_PATHS);
    }
  });
  it("keeps training-only crawlers out by default, and lets the owner reverse it", () => {
    expect(trainingCrawlersAllowed()).toBe(false);
    for (const agent of TRAINING_CRAWLERS) expect([rulesFor(agent)!.disallow].flat()).toEqual(["/"]);
    process.env.UPNEXT_AI_TRAINING_CRAWLERS = "allow";
    for (const agent of TRAINING_CRAWLERS) expect([rulesFor(agent)!.disallow].flat()).toEqual(PRIVATE_PATHS);
    expect((robots().rules as Rule[]).length).toBe(1);
  });
  it("names the sitemap index on the official domain and no crawler is a search crawler and a training crawler", () => {
    expect(robots().sitemap).toBe(`${ORIGIN}/sitemap.xml`);
    const overlap = SEARCH_AND_ANSWER_CRAWLERS.filter((a) =>
      (TRAINING_CRAWLERS as readonly string[]).includes(a),
    );
    expect(overlap).toEqual([]);
  });
});

describe("llms.txt", () => {
  it("describes the site from its own facts, with absolute https addresses and no promise of citation", async () => {
    const text = llmsTxt();
    expect(text.startsWith("# UPNEXT Careers")).toBe(true);
    for (const g of GUIDES) expect(text).toContain(`${ORIGIN}${g.path}`);
    expect(text).toContain("info@upnext.co.zw");
    expect(text).toContain(`${ORIGIN}/sitemap.xml`);
    expect(text).not.toMatch(/guarante|ranked first|trusted by/i);
    expect(text).not.toMatch(/https?:\/\/(?!upnext\.co\.zw)/); // no foreign address
    const response = llmsRoute();
    expect(response.headers.get("content-type")).toContain("text/plain");
  });
});
