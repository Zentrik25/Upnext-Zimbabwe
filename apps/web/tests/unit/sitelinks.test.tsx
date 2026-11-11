/**
 * The eight priority destinations for branded search (D-69): each is linked from every public page's footer with a
 * descriptive, crawlable link; the seven public ones have unique titles, descriptions and headings and are
 * self-canonical; Sign In stays out of the index and the sitemap. Google decides which sitelinks appear.
 */
import { render, screen, within } from "@testing-library/react";
import type { Metadata } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), usePathname: () => "/" }));
vi.mock("@/components/ads/ad-slot", () => ({ AdSlot: () => null }));
const catalog = vi.hoisted(() => ({
  getSitemapEntries: vi.fn(),
  listCategories: vi.fn(async () => []),
  listLocations: vi.fn(async () => []),
  listOpportunities: vi.fn(),
}));
vi.mock("@/lib/catalog", () => catalog);
vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn(async () => null), getSavedIds: vi.fn() }));
vi.mock("@/content/legal/operator", () => ({ legalPublished: () => false }));

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import OpportunitiesPage, { generateMetadata as listMeta } from "@/app/opportunities/page";
import { metadata as employersMeta } from "@/app/employers/page";
import { metadata as signInMeta } from "@/app/sign-in/page";
import { metadata as homeMeta } from "@/app/page";
import { SiteFooter } from "@/components/layout/site-footer";
import { BRAND } from "@/lib/brand";
import { CATEGORY_SEO } from "@/lib/category-seo";
import { PRIORITY_DESTINATIONS } from "@/lib/destinations";

process.env.UPNEXT_PUBLIC_BASE_URL = "https://upnext.co.zw";
const ORIGIN = "https://upnext.co.zw";
const listed = { ok: true, data: { data: [{ id: "1" }], page: { total: 1 } } };

async function metaOf(href: string): Promise<Metadata> {
  if (href === "/employers") return employersMeta;
  if (href === "/sign-in") return signInMeta;
  const query = Object.fromEntries(new URL(href, ORIGIN).searchParams);
  return listMeta({ searchParams: Promise.resolve(query) });
}

describe("the eight priority destinations (D-69)", () => {
  beforeEach(() => catalog.listOpportunities.mockResolvedValue(listed));

  it("are the owner's eight, in order, each at a distinct address", () => {
    expect(PRIORITY_DESTINATIONS.map((d) => d.label)).toEqual([
      "Jobs & opportunities in Zimbabwe",
      "Latest jobs",
      "Latest tenders",
      "Internships & attachments",
      "Graduate trainee programmes",
      "Scholarships & fellowships",
      "For employers",
      "Sign in",
    ]);
    expect(new Set(PRIORITY_DESTINATIONS.map((d) => d.href)).size).toBe(8);
  });

  it("are all linked from the footer with their descriptive names", () => {
    render(<SiteFooter />);
    const footer = screen.getByRole("navigation", { name: "Footer" });
    for (const d of PRIORITY_DESTINATIONS) {
      const link = within(footer).getByRole("link", { name: d.label });
      expect(link.getAttribute("href"), d.label).toBe(d.href);
    }
    // No two footer links share an address under different names (the old "All opportunities" / "Browse by category").
    const hrefs = within(footer)
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("the seven public ones have unique titles and descriptions, are indexable and self-canonical", async () => {
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    for (const d of PRIORITY_DESTINATIONS.filter((x) => x.indexable)) {
      const meta = await metaOf(d.href);
      expect(meta.robots, d.href).toBeUndefined();
      expect(meta.alternates?.canonical, d.href).toBe(d.href);
      titles.add(String(meta.title));
      descriptions.add(String(meta.description));
    }
    titles.add(BRAND.homeTitle);
    descriptions.add(BRAND.homeDescription);
    expect(titles.size).toBe(8); // seven destinations plus the home page, all different
    expect(descriptions.size).toBe(8);
  });

  it("use the owner's names in their titles", async () => {
    expect((await metaOf("/opportunities")).title).toBe("Jobs & Opportunities in Zimbabwe");
    expect(CATEGORY_SEO.jobs!.title).toBe("Latest Jobs in Zimbabwe");
    expect(CATEGORY_SEO.tenders!.title).toBe("Latest Tenders in Zimbabwe");
    expect(CATEGORY_SEO.internships!.title).toBe("Internships & Attachments in Zimbabwe");
    expect(CATEGORY_SEO["graduate-programmes"]!.title).toBe("Graduate Trainee Programmes in Zimbabwe");
    expect(CATEGORY_SEO.scholarships!.title).toBe("Scholarships & Fellowships");
    expect(employersMeta.title).toBe("For Employers");
  });

  it("each list has its own heading, visible introduction and a breadcrumb", async () => {
    const headings = new Set<string>();
    for (const d of PRIORITY_DESTINATIONS.filter((x) => x.href.startsWith("/opportunities"))) {
      const query = Object.fromEntries(new URL(d.href, ORIGIN).searchParams);
      const { container, unmount } = render(
        await OpportunitiesPage({ searchParams: Promise.resolve(query) }),
      );
      const h1 = container.querySelector("h1")!.textContent!;
      headings.add(h1);
      // The plain list shows no intro (owner instruction 2026-11-11, superseding D-69 for that one list); its text stays in the metadata.
      const introEl = container.querySelector("h1 + p");
      if (!query.category) expect(introEl, d.href).toBeNull();
      const intro = introEl?.textContent ?? "";
      if (query.category) expect(intro.length, d.href).toBeGreaterThan(60);
      const ld = [...container.querySelectorAll('script[type="application/ld+json"]')].map(
        (s) => s.textContent,
      );
      if (query.category) {
        expect(intro).toContain(CATEGORY_SEO[query.category]!.description);
        expect(ld.join(""), d.href).toContain('"BreadcrumbList"');
      }
      expect(ld.join(""), d.href).not.toContain("JobPosting"); // lists never carry it
      unmount();
    }
    expect(headings.size).toBe(6);
  });

  it("keeps Sign In linked, crawlable so its noindex can be read, and out of the sitemap", async () => {
    expect(signInMeta.robots).toEqual({ index: false });
    const rule = (robots().rules as { disallow: string[] }[])[0]!;
    // Not disallowed (D-69): a crawler barred from it could never see its noindex.
    expect(rule.disallow.some((d) => "/sign-in".startsWith(d.replace(/\/$/, "")) && d !== "/")).toBe(false);
    catalog.getSitemapEntries.mockResolvedValue({
      ok: true,
      data: { data: [], categories: [{ code: "jobs", count: 1, updated_at: null }] },
    });
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls.some((u) => u.includes("/sign-in"))).toBe(false);
    for (const d of PRIORITY_DESTINATIONS.filter((x) => x.indexable && !x.href.includes("?category=")))
      expect(urls, d.href).toContain(`${ORIGIN}${d.href}`);
  });

  it("gives the home page the owner's title and description", () => {
    expect(homeMeta.title).toEqual({ absolute: "UPNEXT Careers | Jobs & Opportunities in Zimbabwe" });
    expect(homeMeta.description).toBe(
      "Discover the latest jobs, tenders, internships, graduate trainee programmes, scholarships and career opportunities across Zimbabwe on UPNEXT Careers.",
    );
  });
});
