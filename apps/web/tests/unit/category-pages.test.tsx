/**
 * Category pages carry real, useful content in their first HTML (D-74): the directory shows each category's open count
 * from the API and links to its newest listings, says plainly when a category is empty, and says nothing about a
 * category whose list could not be loaded; every list links the guides that help with that kind of opportunity.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  permanentRedirect: vi.fn(),
  usePathname: () => "/",
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/components/ads/ad-slot", () => ({ AdSlot: () => null }));
const catalog = vi.hoisted(() => ({
  listCategories: vi.fn(async () => []),
  listLocations: vi.fn(async () => []),
  listOpportunities: vi.fn(),
}));
vi.mock("@/lib/catalog", () => catalog);
vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn(async () => null), getSavedIds: vi.fn() }));

import CategoriesPage from "@/app/categories/page";
import OpportunitiesPage from "@/app/opportunities/page";
import { CATEGORY_GUIDES, guidesFor } from "@/lib/category-resources";
import { CATEGORY_SEO } from "@/lib/category-seo";
import { GUIDES } from "@/lib/guides";
import { serverHtml, summaryRow } from "./helpers";

process.env.UPNEXT_PUBLIC_BASE_URL = "https://upnext.co.zw";

const ok = (rows: ReturnType<typeof summaryRow>[], total = rows.length) => ({
  ok: true as const,
  data: { data: rows, page: { limit: 3, has_more: total > rows.length, next_cursor: null, total } },
});

beforeEach(() => {
  catalog.listOpportunities.mockImplementation(async (params: URLSearchParams) => {
    const category = params.get("category");
    if (category === "jobs")
      return ok(
        [1, 2, 3].map((i) => summaryRow(i, { slug: `job-${i}`, title: `Job ${i}` })),
        7,
      );
    if (category === "graduate-programmes")
      return ok([summaryRow(9, { slug: "grad-9", title: "Graduate Trainee 9" })]);
    if (category === "grants") return { ok: false, reason: "unreachable" };
    return ok([]);
  });
});
afterEach(() => vi.clearAllMocks());

describe("/categories", () => {
  it("shows the real open count and links to the newest listings of each non-empty category", async () => {
    const html = await serverHtml(await CategoriesPage());
    const jobs = html.querySelector('[data-testid="category-jobs"]')!;
    expect(jobs.querySelector('[data-testid="category-count"]')?.textContent).toBe("7 open listings");
    expect(
      [...jobs.querySelectorAll('a[href^="/opportunities/"]')].map((a) => a.getAttribute("href")),
    ).toEqual(["/opportunities/job-1", "/opportunities/job-2", "/opportunities/job-3"]);
    const grad = html.querySelector('[data-testid="category-graduate-programmes"]')!;
    expect(grad.querySelector('[data-testid="category-count"]')?.textContent).toBe("1 open listing");
    // one small request per category, limited to the newest three
    for (const [params] of catalog.listOpportunities.mock.calls) expect(params.get("limit")).toBe("3");
    expect(catalog.listOpportunities).toHaveBeenCalledTimes(Object.keys(CATEGORY_SEO).length);
  });

  it("says plainly when a category is empty, and says nothing when its list could not be loaded", async () => {
    const html = await serverHtml(await CategoriesPage());
    const tenders = html.querySelector('[data-testid="category-tenders"]')!;
    expect(tenders.textContent).toContain("No open listings right now.");
    expect(tenders.querySelector('a[href^="/opportunities/"]')).toBeNull();
    const grants = html.querySelector('[data-testid="category-grants"]')!;
    expect(grants.querySelector('[data-testid="category-count"]')).toBeNull(); // a fault is not "none"
    expect(grants.querySelector('a[href="/opportunities?category=grants"]')).not.toBeNull();
  });

  it("links each category to its list and to a guide that helps with it", async () => {
    const html = await serverHtml(await CategoriesPage());
    for (const code of Object.keys(CATEGORY_SEO)) {
      const card = html.querySelector(`[data-testid="category-${code}"]`)!;
      expect(card.querySelector(`a[href="/opportunities?category=${code}"]`), code).not.toBeNull();
      expect(card.querySelector(`a[href="${guidesFor(code)[0]!.path}"]`), code).not.toBeNull();
    }
  });
});

describe("career resources on the lists", () => {
  it("names only published guides, for every category", () => {
    const published = new Set(GUIDES.map((g) => g.path));
    for (const [code, paths] of Object.entries(CATEGORY_GUIDES)) {
      expect(Object.hasOwn(CATEGORY_SEO, code), code).toBe(true);
      for (const p of paths) expect(published.has(p), `${code}: ${p}`).toBe(true);
    }
  });

  it("each category list and the plain list link their guides in the first HTML", async () => {
    const grad = await serverHtml(
      await OpportunitiesPage({ searchParams: Promise.resolve({ category: "graduate-programmes" }) }),
    );
    const block = grad.querySelector('[data-testid="career-resources"]')!;
    expect(
      block.querySelector('a[href="/guides/how-to-apply-for-graduate-trainee-programmes"]'),
    ).not.toBeNull();
    const plain = await serverHtml(await OpportunitiesPage({ searchParams: Promise.resolve({}) }));
    expect(
      plain
        .querySelector('[data-testid="career-resources"]')!
        .querySelector('a[href="/guides/how-to-find-jobs-in-zimbabwe"]'),
    ).not.toBeNull();
  });
});
