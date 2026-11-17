/**
 * The navigation offers only sections that hold something (D-79, owner instruction 2026-11-16). On the live site
 * that day the header led to an empty location directory and to Career Insights without an article, and the home
 * page and the footer led to three empty category lists.
 */
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
const catalog = vi.hoisted(() => ({
  getSitemapEntries: vi.fn(),
  getInsightsSitemap: vi.fn(),
  hasPlaces: vi.fn(),
  listLocations: vi.fn(async () => []),
  listOpportunities: vi.fn(),
}));
vi.mock("@/lib/catalog", () => catalog);
vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn(async () => null), getSavedIds: vi.fn() }));

import { BrowseByCategory } from "@/components/home/browse";
import { HeroFrame, HeroSearch } from "@/components/home/sections";
import { BottomNav } from "@/components/layout/bottom-nav";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader, publicNav } from "@/components/layout/site-header";
import { ALL_SECTIONS, leadsSomewhere, siteSections } from "@/lib/site-sections";
import { serverHtml } from "./helpers";

const unreachable = { ok: false as const, reason: "unreachable" as const };
const feed = (counts: Record<string, number>) => ({
  ok: true as const,
  data: {
    data: [],
    categories: Object.entries(counts).map(([code, count]) => ({ code, count, updated_at: null })),
  },
});
const insights = (articles: number) => ({
  ok: true as const,
  data: {
    articles: Array.from({ length: articles }, (_, i) => ({
      slug: `a-${i}`,
      updated_at: "2026-11-16T00:00:00Z",
    })),
    categories: [],
    authors: [],
    updated_at: null,
  },
});

/** The live site on 2026-11-16: three categories with listings, no places, no articles. */
function asLive() {
  catalog.getSitemapEntries.mockResolvedValue(feed({ jobs: 32, internships: 1, "graduate-programmes": 3 }));
  catalog.hasPlaces.mockResolvedValue(false);
  catalog.getInsightsSitemap.mockResolvedValue(insights(0));
}
function full() {
  catalog.getSitemapEntries.mockResolvedValue(
    feed({ jobs: 5, internships: 1, "graduate-programmes": 1, scholarships: 2, tenders: 3, grants: 1 }),
  );
  catalog.hasPlaces.mockResolvedValue(true);
  catalog.getInsightsSitemap.mockResolvedValue(insights(2));
}
const hrefs = (root: HTMLElement) =>
  within(root)
    .getAllByRole("link")
    .map((a) => a.getAttribute("href"));

describe("which sections hold something", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads the open categories, the places and the published articles", async () => {
    asLive();
    const s = await siteSections();
    expect(["jobs", "internships", "graduate-programmes"].every((c) => s.categoryOpen(c))).toBe(true);
    expect(["scholarships", "tenders", "grants"].some((c) => s.categoryOpen(c))).toBe(false);
    expect(s.locations).toBe(false);
    expect(s.insights).toBe(false);
    expect(leadsSomewhere("/opportunities?category=tenders", s)).toBe(false);
    expect(leadsSomewhere("/opportunities", s)).toBe(true); // the full list and every other page are never hidden
    expect(leadsSomewhere("/about", s)).toBe(true);
  });

  it("keeps a link when the answer could not be read: only a known-empty section is hidden", async () => {
    catalog.getSitemapEntries.mockResolvedValue(unreachable);
    catalog.getInsightsSitemap.mockResolvedValue(unreachable);
    catalog.hasPlaces.mockResolvedValue(true); // hasPlaces itself answers true when the API cannot be read
    const s = await siteSections();
    expect(s.categoryOpen("tenders") && s.insights && s.locations).toBe(true);
  });
});

describe("the header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  });

  it("offers all five places when each holds something", () => {
    expect(publicNav(ALL_SECTIONS).map((i) => i.href)).toEqual([
      "/opportunities",
      "/categories",
      "/locations",
      "/insights",
      "/employers",
    ]);
  });

  it("leaves out Locations without places and offers the career guides until an article is published", async () => {
    asLive();
    render(await SiteHeader());
    const bar = screen.getByRole("navigation", { name: "Primary" });
    expect(hrefs(bar)).toEqual(["/opportunities", "/categories", "/guides", "/employers"]);
    expect(within(bar).getByRole("link", { name: "Career Guides" })).toBeTruthy();
  });
});

describe("the footer, the phone tabs and the home page", () => {
  beforeEach(() => vi.clearAllMocks());

  it("the footer links no empty section, and links them again once they hold something", async () => {
    asLive();
    const { unmount } = render(await SiteFooter());
    const empty = hrefs(screen.getByRole("navigation", { name: "Footer" }));
    for (const gone of [
      "/locations",
      "/insights",
      "/opportunities?category=tenders",
      "/opportunities?category=scholarships",
    ])
      expect(empty, gone).not.toContain(gone);
    for (const kept of [
      "/opportunities",
      "/opportunities?category=jobs",
      "/guides",
      "/privacy",
      "/terms",
      "/contact",
    ])
      expect(empty, kept).toContain(kept);
    unmount();
    full();
    render(await SiteFooter());
    const all = hrefs(screen.getByRole("navigation", { name: "Footer" }));
    for (const back of ["/locations", "/insights", "/opportunities?category=tenders"])
      expect(all, back).toContain(back);
  });

  it("the phone tab opens the guides until an article is published", () => {
    const { unmount } = render(<BottomNav insights={false} />);
    expect(screen.getByRole("link", { name: "Guides" }).getAttribute("href")).toBe("/guides");
    expect(screen.queryByRole("link", { name: "Insights" })).toBeNull();
    unmount();
    render(<BottomNav />);
    expect(screen.getByRole("link", { name: "Insights" }).getAttribute("href")).toBe("/insights");
  });

  it("the home page advertises only categories with open listings and no empty Location list", async () => {
    asLive();
    const html = await serverHtml(
      <>
        <HeroFrame>
          <HeroSearch categories={[]} locations={[]} />
        </HeroFrame>
        <BrowseByCategory />
      </>,
    );
    const linked = (code: string) => html.querySelector(`a[href="/opportunities?category=${code}"]`) !== null;
    expect(linked("jobs") && linked("internships") && linked("graduate-programmes")).toBe(true);
    for (const code of ["tenders", "scholarships", "grants"]) expect(linked(code), code).toBe(false);
    expect(html.querySelector("#home-location")).toBeNull();
    expect(html.querySelector("#home-q")).not.toBeNull();
  });
});
