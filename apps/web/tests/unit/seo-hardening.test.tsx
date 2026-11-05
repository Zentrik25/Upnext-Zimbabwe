/**
 * SEO hardening (audit 2026-11, D-68): metadata always in <head>, faults are server errors rather than "noindex",
 * one canonical address per listing, the full JobPosting description, and the organic landing pages.
 */
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const nav = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  permanentRedirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
  usePathname: () => "/",
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("next/navigation", () => nav);
vi.mock("@/components/ads/ad-slot", () => ({ AdSlot: () => null }));
const catalog = vi.hoisted(() => ({
  getSitemapEntries: vi.fn(),
  listCategories: vi.fn(),
  getOpportunity: vi.fn(),
  listOpportunities: vi.fn(),
  getEmployerProfile: vi.fn(),
}));
vi.mock("@/lib/catalog", () => catalog);
vi.mock("@/lib/session", () => ({
  getCurrentUser: vi.fn(async () => null),
  getSavedIds: vi.fn(async () => new Set()),
}));

import nextConfig from "../../next.config";
import OpportunityPage, { generateMetadata as listingMeta } from "@/app/opportunities/[slug]/page";
import { generateMetadata as employerMeta } from "@/app/employers/[slug]/page";
import LandingPage, { generateMetadata as landingMeta } from "@/app/jobs/[slug]/page";
import JobsIndex from "@/app/jobs/page";
import type { OpportunityDetail } from "@/lib/catalog-types";
import { LANDING_MIN_LISTINGS, LANDING_PAGES, LANDING_SLUGS } from "@/lib/landing-pages";
import { jobDescription, jobPostingFor } from "@/lib/structured-data";
import { ContentUnavailableError } from "@/lib/unavailable";

process.env.UPNEXT_PUBLIC_BASE_URL = "https://upnext.co.zw";
const FAULTS = ["unreachable", "rate-limited", "unexpected-response"] as const;

describe("metadata is sent in <head> to every client (SEO-B02)", () => {
  it("treats every user agent as one that needs blocking metadata", () => {
    const limited = nextConfig.htmlLimitedBots as RegExp;
    for (const ua of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)",
      "Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36",
    ])
      expect(limited.test(ua), ua).toBe(true);
  });
});

const listing = (over: Partial<OpportunityDetail> = {}) =>
  ({
    id: "1",
    slug: "graduate-engineer-abc123",
    title: "Graduate Engineer",
    summary: "Entry <role> & more",
    category: { code: "jobs", name: "Jobs" },
    organisation: { id: "o", name: "Example Power" },
    locations: [{ slug: "harare", name: "Harare", is_primary: true }],
    work_mode: "on_site",
    employment_type: "contract",
    deadline: { at: "2099-01-01T21:59:59Z", timezone: "Africa/Harare", is_date_only: true, state: "open" },
    salary: null,
    status: "published",
    published_at: "2026-10-17T10:00:00Z",
    description_html: "<p>Inspect sites.</p>",
    requirements_html: "<ul><li>BSc Electrical</li></ul>",
    canonical_path: "/opportunities/graduate-engineer-abc123",
    seo: { title: null, description: null, og_title: null, og_description: null },
    reference_number: null,
    verification: { level: "source_checked", checked_at: null },
    image: null,
    ...over,
  }) as unknown as OpportunityDetail;

describe("a listing that cannot be loaded is a server error, never 200 + noindex (SEO-B01)", () => {
  beforeEach(() => catalog.getOpportunity.mockReset());
  it.each(FAULTS)("throws for %s, in the metadata and in the page", async (reason) => {
    catalog.getOpportunity.mockResolvedValue({ ok: false, reason });
    const params = Promise.resolve({ slug: "graduate-engineer-abc123" });
    await expect(listingMeta({ params })).rejects.toBeInstanceOf(ContentUnavailableError);
    await expect(OpportunityPage({ params })).rejects.toBeInstanceOf(ContentUnavailableError);
  });
  it("keeps a real 404 for a listing that does not exist", async () => {
    catalog.getOpportunity.mockResolvedValue({ ok: true, data: null });
    const params = Promise.resolve({ slug: "nope" });
    expect((await listingMeta({ params })).robots).toEqual({ index: false });
    await expect(OpportunityPage({ params })).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("moves any other spelling of the address to the canonical one (SEO-B07)", async () => {
    catalog.getOpportunity.mockResolvedValue({ ok: true, data: listing() });
    await expect(
      OpportunityPage({ params: Promise.resolve({ slug: "GRADUATE-ENGINEER-ABC123" }) }),
    ).rejects.toThrow("NEXT_REDIRECT /opportunities/graduate-engineer-abc123");
  });
  it("does the same for a company profile", async () => {
    catalog.getEmployerProfile.mockResolvedValue({ ok: false, reason: "unreachable" });
    await expect(employerMeta({ params: Promise.resolve({ slug: "x" }) })).rejects.toBeInstanceOf(
      ContentUnavailableError,
    );
  });
});

describe("JobPosting description (SEO-B06)", () => {
  it("is the full visible text as HTML, under the page's own headings", () => {
    expect(jobDescription(listing())).toBe(
      "<h2>Key responsibilities</h2><p>Inspect sites.</p><h2>Qualifications &amp; experience</h2><ul><li>BSc Electrical</li></ul>",
    );
    const data = jobPostingFor(listing(), "https://upnext.co.zw/opportunities/graduate-engineer-abc123")!;
    expect(data.description).toBe(jobDescription(listing()));
  });
  it("is never cut short", () => {
    const long = `<p>${"word ".repeat(3000)}</p>`;
    expect(jobDescription(listing({ description_html: long, requirements_html: null }))).toContain(long);
  });
  it("falls back to the escaped summary when there is no description", () => {
    expect(jobDescription(listing({ description_html: "", requirements_html: null }))).toBe(
      "<p>Entry &lt;role&gt; &amp; more</p>",
    );
  });
});

const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    ...listing({ id: String(i), slug: `listing-${i}`, title: `Listing ${i}` }),
  }));
const listed = (n: number, more = false) => ({
  ok: true,
  data: {
    data: rows(n),
    page: { limit: 20, has_more: more, next_cursor: more ? "next-abc" : null, total: n },
  },
});
const props = (slug: string, search: Record<string, string> = {}) => ({
  params: Promise.resolve({ slug }),
  searchParams: Promise.resolve(search),
});

describe("organic landing pages (SEO-B10, D-68)", () => {
  beforeEach(() => catalog.listOpportunities.mockReset());
  it("are exactly the six collections the API defines (keep in step with opportunities/collections.py)", () => {
    expect(LANDING_SLUGS).toEqual([
      "harare",
      "bulawayo",
      "graduate-trainee",
      "engineering",
      "finance-and-accounting",
      "ngo",
    ]);
  });
  it("each has a unique title, heading and description", () => {
    const pages = Object.values(LANDING_PAGES);
    for (const key of ["title", "heading", "description", "intro"] as const)
      expect(new Set(pages.map((p) => p[key])).size, key).toBe(pages.length);
  });
  it("is indexable, canonical to itself, from the threshold of open listings", async () => {
    catalog.listOpportunities.mockResolvedValue(listed(LANDING_MIN_LISTINGS));
    const meta = await landingMeta(props("harare", { utm_source: "x" }));
    expect(meta.title).toBe("Jobs in Harare");
    expect(meta.alternates?.canonical).toBe("/jobs/harare");
    expect(meta.robots).toBeUndefined();
    const asked = catalog.listOpportunities.mock.calls.at(-1)![0] as URLSearchParams;
    expect(asked.get("collection")).toBe("harare");
  });
  it("is noindex, follow below the threshold, so no thin page is offered to search engines", async () => {
    catalog.listOpportunities.mockResolvedValue(listed(LANDING_MIN_LISTINGS - 1));
    expect((await landingMeta(props("bulawayo"))).robots).toEqual({ index: false, follow: true });
    catalog.listOpportunities.mockResolvedValue(listed(0));
    expect((await landingMeta(props("ngo"))).robots).toEqual({ index: false, follow: true });
  });
  it("makes later pages noindex, follow and canonical to themselves", async () => {
    catalog.listOpportunities.mockResolvedValue(listed(10));
    const meta = await landingMeta(props("engineering", { cursor: "abc" }));
    expect(meta.robots).toEqual({ index: false, follow: true });
    expect(meta.alternates?.canonical).toBe("/jobs/engineering?cursor=abc");
  });
  it("answers a fault with a server error and an unknown page with 404", async () => {
    for (const reason of FAULTS) {
      catalog.listOpportunities.mockResolvedValue({ ok: false, reason });
      await expect(landingMeta(props("harare"))).rejects.toBeInstanceOf(ContentUnavailableError);
    }
    expect((await landingMeta(props("doorway-page"))).robots).toEqual({ index: false });
    await expect(LandingPage(props("doorway-page"))).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("renders the real listings, pagination and related links on the server", async () => {
    catalog.listOpportunities.mockResolvedValue(listed(4, true));
    const { container, getByRole } = render(await LandingPage(props("harare")));
    expect(getByRole("heading", { level: 1 }).textContent).toBe("Jobs in Harare");
    expect(container.querySelectorAll('a[href^="/opportunities/listing-"]').length).toBeGreaterThanOrEqual(4);
    expect(container.querySelector('a[rel="next"]')?.getAttribute("href")).toBe(
      "/jobs/harare?cursor=next-abc",
    );
    for (const other of LANDING_SLUGS.filter((s) => s !== "harare"))
      expect(container.querySelector(`a[href="/jobs/${other}"]`), other).not.toBeNull();
    expect(container.querySelector('a[href="/opportunities?category=jobs"]')).not.toBeNull();
    expect(container.querySelector('script[type="application/ld+json"]')?.textContent).toContain(
      "BreadcrumbList",
    );
    // Lists never carry JobPosting: that belongs on the listing's own page.
    expect(container.innerHTML).not.toContain("JobPosting");
  });
  it("offers the broader list when it has no listings", async () => {
    catalog.listOpportunities.mockResolvedValue(listed(0));
    const { container } = render(await LandingPage(props("ngo")));
    expect(container.textContent).toContain("No open listings here right now");
    expect(container.querySelector('a[href="/opportunities?category=jobs"]')).not.toBeNull();
  });
  it("sends /jobs on its own to the jobs category list", () => {
    expect(() => JobsIndex()).toThrow("NEXT_REDIRECT /opportunities?category=jobs");
  });
});
