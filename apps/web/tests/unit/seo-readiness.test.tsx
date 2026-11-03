import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { render } from "@testing-library/react";
import type { Metadata } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), usePathname: () => "/" }));

const catalog = vi.hoisted(() => ({
  getSitemapEntries: vi.fn(),
  listCategories: vi.fn(),
  getOpportunity: vi.fn(),
  listOpportunities: vi.fn(),
}));
vi.mock("@/lib/catalog", () => catalog);
vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn(), getSavedIds: vi.fn() }));
vi.mock("@/content/legal/operator", () => ({ legalPublished: () => false }));

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { BRAND } from "@/lib/brand";
import { CATEGORY_SEO } from "@/lib/category-seo";
import { GUIDES } from "@/lib/guides";
import { classifyList } from "@/lib/list-seo";
import { STATIC_PATHS } from "@/lib/site";
import { readRepoFile } from "./helpers";

process.env.UPNEXT_PUBLIC_BASE_URL = "https://upnext.co.zw";
const ORIGIN = "https://upnext.co.zw";
const appDir = resolve(__dirname, "../../src/app");

describe("list pages: what is indexed and what each address canonicalises to", () => {
  it("indexes the plain list and one known category, each canonical to itself", () => {
    expect(classifyList({})).toEqual({ kind: "plain", index: true, canonical: "/opportunities" });
    expect(classifyList({ category: "internships" })).toMatchObject({
      kind: "category",
      index: true,
      canonical: "/opportunities?category=internships",
    });
  });
  it("ignores tracking parameters the page does not read", () => {
    expect(classifyList({ utm_source: "x", fbclid: "y" })).toMatchObject({ kind: "plain", index: true });
    expect(classifyList({ category: "jobs", utm_campaign: "x" })).toMatchObject({ kind: "category" });
  });
  it("keeps searched, filtered, sorted and resized views out of the index, canonical to the nearest list", () => {
    for (const raw of [{ q: "engineer" }, { sort: "closing_soon" }, { limit: "2" }, { location: "harare" }]) {
      expect(classifyList(raw)).toMatchObject({ index: false, canonical: "/opportunities" });
    }
    expect(classifyList({ category: "jobs", location: "harare" })).toMatchObject({
      index: false,
      canonical: "/opportunities?category=jobs",
    });
  });
  it("treats an unknown or multiple category as a filter, never as an indexable page", () => {
    expect(classifyList({ category: "no-such" })).toMatchObject({
      index: false,
      canonical: "/opportunities",
    });
    expect(classifyList({ category: "jobs,tenders" })).toMatchObject({ index: false });
  });
  it("gives a later page its own canonical address instead of page one", () => {
    const view = classifyList({ category: "jobs", cursor: "abc" });
    expect(view).toMatchObject({
      kind: "paged",
      index: false,
      canonical: "/opportunities?category=jobs&cursor=abc",
    });
    expect(classifyList({ cursor: "abc" }).canonical).toBe("/opportunities?cursor=abc");
  });
  it("has search copy for every launch category, within snippet length", () => {
    for (const [code, copy] of Object.entries(CATEGORY_SEO)) {
      expect(copy.title.length, code).toBeLessThanOrEqual(60);
      expect(copy.description.length, code).toBeLessThanOrEqual(175);
    }
    expect(new Set(Object.values(CATEGORY_SEO).map((c) => c.title)).size).toBe(
      Object.keys(CATEGORY_SEO).length,
    );
  });
});

describe("robots.txt", () => {
  const rules = robots().rules as { userAgent: string; allow: string; disallow: string[] }[];
  it("allows the site, names the sitemap on the official domain and blocks no rendering resource", () => {
    expect(rules[0]!.allow).toBe("/");
    expect(robots().sitemap).toBe(`${ORIGIN}/sitemap.xml`);
    for (const blocked of rules[0]!.disallow) {
      expect(blocked).not.toMatch(/_next|\.css|\.js|\/brand|\/illustrations|\/fonts/);
      expect(blocked).not.toBe("/");
    }
  });
  it("blocks private areas, but not the public employer pages", () => {
    const d = rules[0]!.disallow;
    for (const path of ["/workspace", "/api/", "/account", "/sign-in", "/employer/"])
      expect(d).toContain(path);
    expect(d).not.toContain("/employer"); // would also match /employers
    expect(d).not.toContain("/employers");
  });
  it("never hides a noindex: pages linked from public pages that say noindex are crawlable", () => {
    const d = rules[0]!.disallow;
    for (const path of ["/employers/register", "/opportunities/*/report"]) expect(d).not.toContain(path);
    expect(d.some((rule) => /[?*]/.test(rule.replace("/opportunities/*", "")))).toBe(false);
    expect(d.some((rule) => /(sort|cursor|limit)=/.test(rule))).toBe(false);
  });
});

describe("sitemap.xml source", () => {
  beforeEach(() => {
    catalog.getSitemapEntries.mockReset();
    catalog.listCategories.mockReset();
    catalog.listOpportunities.mockReset();
    catalog.listOpportunities.mockResolvedValue({ ok: true, data: { data: [{ id: "1" }], page: {} } });
    catalog.listCategories.mockResolvedValue([
      { code: "jobs", name: "Jobs" },
      { code: "tenders", name: "Tenders" },
      { code: "not-a-launch-category", name: "Other" },
    ]);
  });
  it("lists canonical absolute addresses once each, with real dates only on listings", async () => {
    catalog.getSitemapEntries.mockResolvedValue({
      ok: true,
      data: { data: [{ slug: "graduate-engineer-abc123", updated_at: "2026-10-20T08:00:00Z" }] },
    });
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(new Set(urls).size).toBe(urls.length);
    for (const url of urls) expect(url.startsWith(`${ORIGIN}/`) || url === ORIGIN).toBe(true);
    expect(urls).toContain(`${ORIGIN}/opportunities?category=jobs`);
    expect(urls).toContain(`${ORIGIN}/opportunities?category=tenders`);
    expect(urls.some((u) => u.includes("not-a-launch-category"))).toBe(false);
    for (const guide of GUIDES) expect(urls).toContain(`${ORIGIN}${guide.path}`);
    const listing = entries.find((e) => e.url.endsWith("/graduate-engineer-abc123"))!;
    expect(listing.lastModified).toEqual(new Date("2026-10-20T08:00:00Z"));
    expect(entries.filter((e) => e.lastModified).length).toBe(1);
  });
  it("leaves out private and unapproved pages, and any search or filter address", async () => {
    catalog.getSitemapEntries.mockResolvedValue({ ok: true, data: { data: [] } });
    const urls = (await sitemap()).map((e) => e.url);
    for (const path of [
      "/workspace",
      "/account",
      "/sign-in",
      "/register",
      "/saved",
      "/employer/",
      "/privacy",
      "/terms",
    ])
      expect(
        urls.some((u) => u.includes(path)),
        path,
      ).toBe(false);
    expect(urls.filter((u) => u.includes("?")).every((u) => /\?category=[a-z-]+$/.test(u))).toBe(true);
    expect(urls.some((u) => /[?&](q|sort|cursor|limit|location)=/.test(u))).toBe(false);
  });
  it("lists a category only while it holds an open listing, so the sitemap never offers a noindex address", async () => {
    catalog.getSitemapEntries.mockResolvedValue({ ok: true, data: { data: [] } });
    catalog.listOpportunities.mockImplementation(async (q: URLSearchParams) =>
      q.get("category") === "tenders"
        ? { ok: true, data: { data: [], page: {} } }
        : { ok: true, data: { data: [{ id: "1" }], page: {} } },
    );
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain(`${ORIGIN}/opportunities?category=jobs`);
    expect(urls).not.toContain(`${ORIGIN}/opportunities?category=tenders`);
    catalog.listOpportunities.mockResolvedValue({ ok: false, reason: "unreachable" });
    expect((await sitemap()).some((e) => e.url.includes("?category="))).toBe(false);
  });
  it("still lists the static pages when the API is down", async () => {
    catalog.getSitemapEntries.mockResolvedValue({ ok: false, reason: "unreachable" });
    catalog.listCategories.mockResolvedValue([]);
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain(`${ORIGIN}/`);
    expect(urls).toContain(`${ORIGIN}/opportunities`);
    expect(urls.length).toBeGreaterThan(5);
  });
});

describe("listing page metadata", () => {
  const listing = (over: Record<string, unknown> = {}) => ({
    id: "1",
    slug: "graduate-engineer-abc123",
    canonical_path: "/opportunities/graduate-engineer-abc123",
    title: "Graduate Engineer",
    summary: "Support projects on site.",
    category: { code: "jobs", name: "Jobs" },
    organisation: { id: "o", name: "Example Power Services" },
    status: "published",
    deadline: { at: "2026-12-02T14:30:00Z", timezone: "Africa/Harare", is_date_only: false, state: "open" },
    ...over,
  });
  async function metaFor(data: unknown) {
    catalog.getOpportunity.mockResolvedValue({ ok: true, data });
    const { generateMetadata } = await import("@/app/opportunities/[slug]/page");
    return generateMetadata({ params: Promise.resolve({ slug: "graduate-engineer-abc123" }) });
  }
  it("names the role and the employer, with a canonical address and matching social cards", async () => {
    const meta = await metaFor(listing());
    expect(meta.title).toBe("Graduate Engineer at Example Power Services");
    expect(meta.description).toBe("Support projects on site.");
    expect(meta.alternates?.canonical).toBe("/opportunities/graduate-engineer-abc123");
    expect(meta.robots).toBeUndefined();
    expect(meta.openGraph).toMatchObject({ title: meta.title, description: meta.description });
    expect(meta.twitter).toMatchObject({ title: meta.title, description: meta.description });
  });
  it("is noindex when closed, withdrawn, or past its deadline before the expiry job ran", async () => {
    for (const over of [
      { status: "expired" },
      { status: "withdrawn" },
      { deadline: { at: "2026-01-01T00:00:00Z", timezone: null, is_date_only: true, state: "expired" } },
    ]) {
      expect((await metaFor(listing(over))).robots).toEqual({ index: false });
    }
  });
  it("is noindex when the listing is not public at all", async () => {
    catalog.getOpportunity.mockResolvedValue({ ok: true, data: null });
    const { generateMetadata } = await import("@/app/opportunities/[slug]/page");
    const meta = await generateMetadata({ params: Promise.resolve({ slug: "draft-listing-1" }) });
    expect(meta.robots).toEqual({ index: false });
  });
});

describe("list page metadata", () => {
  const results = (n: number) => ({
    ok: true,
    data: { data: Array.from({ length: n }, (_, i) => ({ id: `${i}` })), page: {} },
  });
  async function metaFor(raw: Record<string, string>) {
    const { generateMetadata } = await import("@/app/opportunities/page");
    return generateMetadata({ searchParams: Promise.resolve(raw) });
  }
  beforeEach(() => catalog.listOpportunities.mockReset());
  it("gives the plain list and each category a unique title, description and canonical address", async () => {
    catalog.listOpportunities.mockResolvedValue(results(2));
    const plain = await metaFor({});
    const internships = await metaFor({ category: "internships" });
    expect(plain.title).toBe("Latest Jobs & Opportunities in Zimbabwe");
    expect(plain.robots).toBeUndefined();
    expect(internships.title).toBe("Internships in Zimbabwe");
    expect(internships.alternates?.canonical).toBe("/opportunities?category=internships");
    expect(internships.robots).toBeUndefined();
    expect(internships.description).not.toBe(plain.description);
    expect(internships.twitter).toMatchObject({ title: "Internships in Zimbabwe" });
    expect(catalog.listOpportunities.mock.calls.at(-1)![0].toString()).toBe("category=internships");
  });
  it("keeps an empty category list, or one that could not be loaded, out of the index", async () => {
    catalog.listOpportunities.mockResolvedValue(results(0));
    expect((await metaFor({ category: "tenders" })).robots).toEqual({ index: false, follow: true });
    expect((await metaFor({})).robots).toEqual({ index: false, follow: true });
    catalog.listOpportunities.mockResolvedValue({ ok: false, reason: "unreachable" });
    expect((await metaFor({ category: "jobs" })).robots).toEqual({ index: false, follow: true });
  });
  it("marks a searched view and a later page noindex, follow without asking the API", async () => {
    const searched = await metaFor({ q: "engineer" });
    expect(searched.robots).toEqual({ index: false, follow: true });
    expect(searched.alternates?.canonical).toBe("/opportunities");
    const paged = await metaFor({ category: "jobs", cursor: "abc" });
    expect(paged.robots).toEqual({ index: false, follow: true });
    expect(paged.alternates?.canonical).toBe("/opportunities?category=jobs&cursor=abc");
    expect(catalog.listOpportunities).not.toHaveBeenCalled();
  });
});

describe("editorial guides", () => {
  const pages = [
    ["how-to-find-jobs-in-zimbabwe", () => import("@/app/guides/how-to-find-jobs-in-zimbabwe/page")],
    ["apply-safely-and-avoid-scams", () => import("@/app/guides/apply-safely-and-avoid-scams/page")],
    ["how-listings-are-verified", () => import("@/app/guides/how-listings-are-verified/page")],
  ] as const;
  it("has one page per listed guide", () => {
    expect(GUIDES.map((g) => g.path.split("/").pop()).sort()).toEqual(pages.map(([n]) => n).sort());
  });
  for (const [name, load] of pages) {
    it(`${name}: one h1, h2 sections with no skipped level, visible dates equal to the Article dates`, async () => {
      const mod = await load();
      const { container } = render(mod.default());
      expect(container.querySelectorAll("h1")).toHaveLength(1);
      const levels = [...container.querySelectorAll("h1,h2,h3")].map((h) => Number(h.tagName[1]));
      expect(levels.length).toBeGreaterThan(3);
      levels.forEach((level, i) => {
        if (i > 0) expect(level - levels[i - 1]!).toBeLessThanOrEqual(1);
      });
      const blocks = [...container.querySelectorAll('script[type="application/ld+json"]')].map((n) =>
        JSON.parse(n.textContent!),
      );
      const article = blocks.find((b) => b["@type"] === "Article");
      expect(article).toMatchObject({ "@type": "Article", inLanguage: "en" });
      expect(blocks.some((b) => b["@type"] === "BreadcrumbList")).toBe(true);
      expect(blocks.some((b) => b["@type"] === "FAQPage")).toBe(false);
      const times = [...container.querySelectorAll("time")].map((t) => t.getAttribute("datetime"));
      expect(times).toContain(article.datePublished);
      expect(article.url).toBe(`${ORIGIN}/guides/${name}`);
      expect(String(mod.metadata.alternates?.canonical)).toBe(`/guides/${name}`);
      expect(mod.metadata.twitter).toMatchObject({ title: article.headline });
    });
  }
});

/** Does an internal address resolve to a real page of this app (ignoring query and fragment)? */
function routeExists(href: string): boolean {
  const path = href.split(/[?#]/)[0]!.replace(/\/$/, "") || "/";
  if (path === "/") return true;
  const parts = path.split("/").filter(Boolean);
  const walk = (dir: string, rest: string[]): boolean => {
    if (rest.length === 0) return existsSync(join(dir, "page.tsx"));
    const [head, ...tail] = rest;
    if (existsSync(join(dir, head!)) && walk(join(dir, head!), tail)) return true;
    return readdirSync(dir)
      .filter((n) => n.startsWith("[") && statSync(join(dir, n)).isDirectory())
      .some((n) => walk(join(dir, n), tail));
  };
  return walk(appDir, parts);
}

describe("internal link integrity", () => {
  it("every guide link and every static or category address in the sitemap resolves to a page", async () => {
    const hrefs = new Set<string>([
      ...STATIC_PATHS,
      ...Object.keys(CATEGORY_SEO).map((c) => `/opportunities?category=${c}`),
    ]);
    for (const [, load] of [
      ["a", () => import("@/app/guides/how-to-find-jobs-in-zimbabwe/page")],
      ["b", () => import("@/app/guides/apply-safely-and-avoid-scams/page")],
      ["c", () => import("@/app/guides/how-listings-are-verified/page")],
    ] as const) {
      const { container } = render((await load()).default());
      container.querySelectorAll("a[href]").forEach((a) => {
        const href = a.getAttribute("href")!;
        if (href.startsWith("/")) hrefs.add(href);
      });
    }
    const missing = [...hrefs].filter((h) => !routeExists(h));
    expect(missing).toEqual([]);
  });
  it("the guides are reachable from the footer", () => {
    const footer = readFileSync(join(appDir, "../components/layout/site-footer.tsx"), "utf8");
    expect(footer).toContain("GUIDES.map");
  });
});

describe("private routes cannot be indexed by accident", () => {
  /** Public, indexable routes. Every other page must say noindex itself or sit under a robots.txt Disallow. */
  const PUBLIC = [
    /^\/$/,
    /^\/opportunities$/,
    /^\/opportunities\/\[slug\]$/,
    /^\/about$/,
    /^\/contact$/,
    /^\/employers$/,
    /^\/employers\/\[slug\]$/,
    /^\/privacy$/,
    /^\/terms$/,
    /^\/guides\/[a-z-]+$/,
  ];
  function pageFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return pageFiles(full);
      return name === "page.tsx" ? [full] : [];
    });
  }
  it("every non-public page is noindex or disallowed in robots.txt", () => {
    const disallow = (robots().rules as { disallow: string[] }[])[0]!.disallow.filter(
      (d) => !d.includes("*"),
    );
    const offenders: string[] = [];
    for (const file of pageFiles(appDir)) {
      const route =
        "/" +
        file
          .slice(appDir.length + 1, -"/page.tsx".length)
          .split("/")
          .filter((part) => !/^\(.*\)$/.test(part))
          .join("/");
      const normalised = route === "/" || route === "/page.tsx" ? "/" : route.replace(/^\/page\.tsx$/, "/");
      if (PUBLIC.some((p) => p.test(normalised))) continue;
      const noindex = /index:\s*false/.test(readFileSync(file, "utf8"));
      const blocked = disallow.some(
        (d) =>
          normalised.startsWith(d.replace(/\/$/, "")) && (d.endsWith("/") ? normalised.startsWith(d) : true),
      );
      if (!noindex && !blocked) offenders.push(normalised);
    }
    expect(offenders).toEqual([]);
  });
});

/** Google's robots.txt matching: the longest matching rule wins, `*` matches any run, `$` anchors; Allow beats Disallow on a tie. */
function robotsAllows(path: string): boolean {
  const rule = (robots().rules as { allow: string; disallow: string[] }[])[0]!;
  const matches = (pattern: string) =>
    new RegExp("^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")).test(path);
  const blocked = rule.disallow.filter(matches).sort((a, b) => b.length - a.length)[0];
  return !blocked || (matches(rule.allow) && rule.allow.length >= blocked.length);
}

describe("sitemap, robots.txt, canonical and noindex agree", () => {
  it("every sitemap address is crawlable, indexable and canonical to itself", async () => {
    catalog.getSitemapEntries.mockResolvedValue({
      ok: true,
      data: { data: [{ slug: "graduate-engineer-abc123", updated_at: "2026-10-20T08:00:00Z" }] },
    });
    catalog.listCategories.mockResolvedValue(Object.keys(CATEGORY_SEO).map((code) => ({ code, name: code })));
    catalog.listOpportunities.mockResolvedValue({ ok: true, data: { data: [{ id: "1" }], page: {} } });
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls.length).toBeGreaterThan(10);
    for (const url of urls) {
      const { pathname, search } = new URL(url);
      expect(robotsAllows(pathname + search), `${url} is blocked by robots.txt`).toBe(true);
      if (pathname === "/opportunities" && search) {
        const view = classifyList(Object.fromEntries(new URLSearchParams(search)));
        expect(view, url).toMatchObject({ kind: "category", index: true, canonical: pathname + search });
      }
    }
  });
  it("static sitemap pages say index and name themselves as canonical", async () => {
    const pages: [string, () => Promise<{ metadata: Metadata }>][] = [
      ["/", () => import("@/app/page")],
      ["/about", () => import("@/app/about/page")],
      ["/contact", () => import("@/app/contact/page")],
      ["/employers", () => import("@/app/employers/page")],
      [
        "/guides/how-to-find-jobs-in-zimbabwe",
        () => import("@/app/guides/how-to-find-jobs-in-zimbabwe/page"),
      ],
      [
        "/guides/apply-safely-and-avoid-scams",
        () => import("@/app/guides/apply-safely-and-avoid-scams/page"),
      ],
      ["/guides/how-listings-are-verified", () => import("@/app/guides/how-listings-are-verified/page")],
    ];
    expect(
      pages
        .filter(([p]) => p.startsWith("/guides/"))
        .map(([p]) => p)
        .sort(),
    ).toEqual(GUIDES.map((g) => g.path as string).sort());
    for (const [path, load] of pages) {
      const { metadata } = await load();
      expect(metadata.robots, path).toBeUndefined();
      expect(metadata.alternates?.canonical, path).toBe(path);
    }
  });
  it("addresses the sitemap never lists are blocked or noindex, never both left open", () => {
    expect(robotsAllows("/account")).toBe(false);
    expect(robotsAllows("/workspace/activity")).toBe(false);
    expect(robotsAllows("/employer/claim")).toBe(false);
    expect(robotsAllows("/employers")).toBe(true);
    expect(robotsAllows("/employers/example-power")).toBe(true);
    expect(robotsAllows("/opportunities?category=jobs")).toBe(true);
  });
});

describe("one canonical domain", () => {
  it("the brand and the production environment template use https://upnext.co.zw only", () => {
    expect(BRAND.canonicalOrigin).toBe("https://upnext.co.zw");
    expect(readRepoFile("infrastructure/compose/production.env.example")).toMatch(
      /^UPNEXT_PUBLIC_BASE_URL=https:\/\/upnext\.co\.zw$/m,
    );
  });
  it("no source file introduces another hostname for the public site", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (
          /\.(tsx?|css)$/.test(name) &&
          /(careers\.upnext\.co\.zw|www\.upnext\.co\.zw)/.test(readFileSync(full, "utf8"))
        )
          offenders.push(full);
      }
    };
    walk(resolve(__dirname, "../../src"));
    expect(offenders).toEqual([]);
  });
});
