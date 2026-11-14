/**
 * Opportunity discovery works without JavaScript (D-74, owner instruction 2026-11-14). The live audit found every
 * listing link of /opportunities and the home page inside a hidden streaming container that only a script reveals, so
 * a client without JavaScript saw "Loading …". These tests read the server's HTML once every request has resolved
 * (what a no-JavaScript client and a crawler receive) and pin that it holds real listing links, the GET search and
 * filter forms, and pagination as a plain link. `skeleton-system.test.tsx` separately pins that no Suspense fallback is
 * put back in front of this content.
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
  getInsightsHome: vi.fn(async () => ({ ok: false as const, reason: "unreachable" as const })),
  listInsightsArticles: vi.fn(async () => ({
    ok: true as const,
    data: { data: [], page: { page: 1, pages: 1, total: 0, limit: 3 } },
  })),
  getInsightsSitemap: vi.fn(async () => ({
    ok: true as const,
    data: { articles: [], categories: [], authors: [], updated_at: null },
  })),
  listCategories: vi.fn(),
  listLocations: vi.fn(),
  listOpportunities: vi.fn(),
}));
vi.mock("@/lib/catalog", () => catalog);
vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn(async () => null), getSavedIds: vi.fn() }));

import HomePage from "@/app/page";
import OpportunitiesPage from "@/app/opportunities/page";
import { serverHtml, summaryRow } from "./helpers";

process.env.UPNEXT_PUBLIC_BASE_URL = "https://upnext.co.zw";

const rows = [
  summaryRow(1, { slug: "accountant-a3n4am", title: "Accountant" }),
  summaryRow(2, {
    slug: "graduate-trainee-civil-engineering-phduf3",
    title: "Graduate Trainee – Civil Engineering",
    category: { code: "graduate-programmes", name: "Graduate programmes" },
  }),
];
const listed = (more = false) => ({
  ok: true as const,
  data: { data: rows, page: { limit: 20, has_more: more, next_cursor: more ? "c2" : null, total: 2 } },
});

beforeEach(() => {
  catalog.listCategories.mockResolvedValue([
    { code: "jobs", name: "Jobs", count: 1 },
    { code: "graduate-programmes", name: "Graduate programmes", count: 1 },
  ]);
  catalog.listLocations.mockResolvedValue([{ slug: "harare", name: "Harare", kind: "city", count: 1 }]);
  catalog.listOpportunities.mockResolvedValue(listed());
});
afterEach(() => vi.clearAllMocks());

/** Links to listings that a reader can see: not inside an element hidden from everyone. */
function visibleListingLinks(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLAnchorElement>('a[href^="/opportunities/"]')]
    .filter((a) => !a.closest("[hidden]"))
    .map((a) => a.getAttribute("href")!);
}

describe("/opportunities without JavaScript", () => {
  it("sends every listing as a visible link, with no loading placeholder", async () => {
    const html = await serverHtml(await OpportunitiesPage({ searchParams: Promise.resolve({}) }));
    expect(visibleListingLinks(html)).toEqual(
      expect.arrayContaining([
        "/opportunities/accountant-a3n4am",
        "/opportunities/graduate-trainee-civil-engineering-phduf3",
      ]),
    );
    expect(html.textContent).not.toMatch(/Loading/);
    expect(html.querySelector('[data-testid="loading"]')).toBeNull();
  });

  it("keeps search and filters as GET forms and the next page as a plain link", async () => {
    catalog.listOpportunities.mockResolvedValue(listed(true));
    const html = await serverHtml(
      await OpportunitiesPage({ searchParams: Promise.resolve({ category: "jobs" }) }),
    );
    const forms = [...html.querySelectorAll("form")];
    expect(forms.length).toBeGreaterThanOrEqual(2); // the search box and the filters
    for (const form of forms) {
      expect(form.getAttribute("action")).toBe("/opportunities");
      expect((form.getAttribute("method") ?? "get").toLowerCase()).toBe("get");
    }
    expect(html.querySelector('select[name="location"] option[value="harare"]')).not.toBeNull();
    const next = html.querySelector<HTMLAnchorElement>('a[rel="next"]');
    expect(next?.getAttribute("href")).toContain("cursor=c2");
    expect(next?.getAttribute("href")).toContain("category=jobs");
  });

  it("an API failure is an error state with a message, never an empty list or a placeholder", async () => {
    catalog.listOpportunities.mockResolvedValue({ ok: false, reason: "unreachable" });
    const html = await serverHtml(await OpportunitiesPage({ searchParams: Promise.resolve({ q: "x" }) }));
    expect(html.querySelector('[role="alert"]')?.textContent).toContain("Opportunities are unavailable");
    expect(visibleListingLinks(html)).toEqual([]);
    expect(html.textContent).not.toMatch(/Loading/);
  });
});

describe("home page without JavaScript", () => {
  it("sends the latest listings as visible links, with no loading placeholder", async () => {
    const html = await serverHtml(HomePage());
    expect(visibleListingLinks(html)).toContain("/opportunities/accountant-a3n4am");
    expect(html.textContent).not.toMatch(/Loading/);
    expect(html.querySelector('form[action="/opportunities"]')).not.toBeNull();
  });
});
