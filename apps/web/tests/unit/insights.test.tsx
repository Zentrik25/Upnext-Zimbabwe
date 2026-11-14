import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Career Insights (D-78): the article body renderer refuses anything outside its vocabulary, the public pages are
 * complete in the first HTML with real dates and structured data, and only canonical, non-empty addresses are
 * indexable or listed in the sitemap.
 */
vi.mock("server-only", () => ({}));

const catalog = vi.hoisted(() => ({
  getInsightsHome: vi.fn(),
  listInsightsArticles: vi.fn(),
  listInsightsCategories: vi.fn(),
  getInsightsArticle: vi.fn(),
  getInsightsAuthor: vi.fn(),
  getInsightsSitemap: vi.fn(),
  getSitemapEntries: vi.fn(),
  listOpportunities: vi.fn(),
}));
const nav = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  permanentRedirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT ${to}`);
  }),
}));
vi.mock("@/lib/catalog", () => catalog);
vi.mock("next/navigation", () => nav);
vi.mock("@/content/legal/operator", () => ({ legalPublished: () => false }));
vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn(async () => null), getSavedIds: vi.fn() }));

import InsightsHomePage, { generateMetadata as homeMeta } from "@/app/insights/page";
import ArticlePage, { generateMetadata as articleMeta } from "@/app/insights/[slug]/page";
import CategoryPage, { generateMetadata as categoryMeta } from "@/app/insights/category/[slug]/page";
import sitemap from "@/app/sitemap";
import { ArticleHtml, safeHref, safeSrc } from "@/lib/article-html";
import type { ArticleCard, ArticleDetail } from "@/lib/insights-types";
import { serverHtml } from "./helpers";

process.env.UPNEXT_PUBLIC_BASE_URL = "https://upnext.co.zw";

const card = (i: number, over: Partial<ArticleCard> = {}): ArticleCard => ({
  slug: `article-${i}`,
  headline: `How to write a strong CV, part ${i}`,
  summary: "A practical guide to the CV Zimbabwean employers expect, section by section.",
  category: { slug: "cvs-and-interviews", name: "CVs & Interviews" },
  author: { name: "UPNEXT Editors", slug: null },
  published_at: "2026-11-10T08:00:00Z",
  updated_at: "2026-11-10T08:00:00Z",
  reading_minutes: 6,
  image: null,
  ...over,
});

const detail = (over: Partial<ArticleDetail> = {}): ArticleDetail => ({
  ...card(1),
  author: { name: "Tendai M.", slug: "tendai-m", bio: "Careers editor.", expertise: ["CVs"] },
  updated_at: "2026-11-12T08:00:00Z",
  image: {
    url: "https://upnext.co.zw/media/insights/a.jpg",
    alt: "A CV on a desk",
    caption: "",
    credit: "UPNEXT",
  },
  body_html: "<h2>Start with contacts</h2><p>Put your <strong>phone</strong> first.</p>",
  in_short: ["Keep it to two pages."],
  why_it_matters: "",
  tags: [{ slug: "cv", name: "cv" }],
  sources: [
    {
      title: "Labour Act",
      publisher: "Government of Zimbabwe",
      url: "https://example.org/labour",
      published_on: null,
      accessed_on: "2026-11-01",
    },
  ],
  canonical_url: null,
  seo: { title: null, description: null, social_title: null, social_description: null, social_image: null },
  opportunity_categories: ["jobs"],
  word_count: 900,
  related: [card(2)],
  ...over,
});

const page = (data: ArticleCard[], extra: Partial<{ page: number; pages: number; total: number }> = {}) => ({
  ok: true as const,
  data: { data, page: { page: 1, pages: 1, total: data.length, limit: 12, ...extra } },
});

beforeEach(() => {
  vi.clearAllMocks();
  catalog.listOpportunities.mockResolvedValue({ ok: true, data: { data: [], page: {} } });
});

describe("article body renderer", () => {
  const html = (body: string) => renderToStaticMarkup(<ArticleHtml html={body} />);

  it("keeps the editor's vocabulary", () => {
    const out = html(
      "<h2>A</h2><h3>B</h3><p><strong>b</strong><em>i</em><u>u</u></p><ul><li>x</li></ul><ol><li>y</li></ol><blockquote><p>q</p></blockquote>",
    );
    for (const tag of ["<h2>", "<h3>", "<strong>", "<em>", "<u>", "<ul>", "<ol>", "<blockquote>"])
      expect(out).toContain(tag);
  });

  it("never builds scripts, handlers, styles or iframes", () => {
    const out = html(
      '<script>alert(1)</script><p onclick="x()" style="color:red">t</p><iframe src="https://e.x"></iframe><img src="x" onerror="alert(1)">',
    );
    expect(out).not.toMatch(/<script|<iframe|onclick|onerror|style=/i);
    expect(out).toContain("&lt;script&gt;"); // shown as text, never interpreted
  });

  it("refuses unsafe link and picture addresses", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,x")).toBeNull();
    expect(safeHref("http://insecure.example")).toBeNull();
    expect(safeHref("//evil.example")).toBeNull();
    expect(safeHref("https://ok.example/a")).toBe("https://ok.example/a");
    expect(safeHref("/opportunities")).toBe("/opportunities");
    expect(safeSrc("/media/insights/a.jpg")).toBe("/media/insights/a.jpg");
    expect(safeSrc("data:image/png;base64,AAAA")).toBeNull();
    const out = html('<p><a href="javascript:alert(1)">x</a></p>');
    expect(out).not.toContain("href");
  });

  it("opens outside links safely and wraps tables in a scrolling region", () => {
    const out = html(
      '<p><a href="https://ok.example">o</a></p><table><tbody><tr><td colspan="99">c</td></tr></tbody></table>',
    );
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('role="region"');
    expect(out).not.toContain('colSpan="99"');
    expect(out).not.toContain('colspan="99"');
  });
});

describe("article page", () => {
  it("renders the whole article in the first HTML, with reader aids only when written", async () => {
    catalog.getInsightsArticle.mockResolvedValue({ ok: true, data: detail() });
    const root = await serverHtml(await ArticlePage({ params: Promise.resolve({ slug: "article-1" }) }));
    expect(root.querySelector("h1")?.textContent).toBe("How to write a strong CV, part 1");
    expect(root.querySelector('[data-testid="article-body"] h2')?.textContent).toBe("Start with contacts");
    expect(root.textContent).toContain("In short");
    expect(root.textContent).not.toContain("Why it matters"); // empty: not shown
    expect(root.textContent).toContain("Sources and references");
    expect(root.querySelector("time")?.getAttribute("dateTime")).toBe("2026-11-10T08:00:00Z");
    expect(root.textContent).toContain("Picture: UPNEXT");
    const blocks = [...root.querySelectorAll('script[type="application/ld+json"]')].map((s) =>
      JSON.parse(s.textContent ?? "{}"),
    );
    const article = blocks.find((b) => b["@type"] === "Article");
    expect(article.datePublished).toBe("2026-11-10T08:00:00Z");
    expect(article.dateModified).toBe("2026-11-12T08:00:00Z");
    expect(article.author.name).toBe("Tendai M.");
    expect(blocks.some((b) => b["@type"] === "BreadcrumbList")).toBe(true);
  });

  it("moves an old address permanently to the current one", async () => {
    catalog.getInsightsArticle.mockResolvedValue({ ok: true, data: detail() });
    await expect(ArticlePage({ params: Promise.resolve({ slug: "old-address" }) })).rejects.toThrow(
      "REDIRECT /insights/article-1",
    );
  });

  it("is canonical to itself, with article Open Graph data and the search title when set", async () => {
    catalog.getInsightsArticle.mockResolvedValue({
      ok: true,
      data: detail({ seo: { ...detail().seo, title: "Writing a CV in Zimbabwe" } }),
    });
    const meta = await articleMeta({ params: Promise.resolve({ slug: "article-1" }) });
    expect(meta.title).toBe("Writing a CV in Zimbabwe");
    expect(meta.alternates?.canonical).toBe("/insights/article-1");
    expect((meta.openGraph as { type?: string }).type).toBe("article");
    expect(meta.robots).toBeUndefined();
  });

  it("an unknown article is not found and never indexed", async () => {
    catalog.getInsightsArticle.mockResolvedValue({ ok: true, data: null });
    const meta = await articleMeta({ params: Promise.resolve({ slug: "nope" }) });
    expect(meta.robots).toEqual({ index: false });
    await expect(ArticlePage({ params: Promise.resolve({ slug: "nope" }) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});

describe("Career Insights home and lists", () => {
  const home = (has: boolean) => ({
    ok: true as const,
    data: {
      featured: has ? card(1) : null,
      top_story: null,
      carousel: [],
      latest: has ? [card(1), card(2)] : [],
      graduate: [],
      categories: [
        {
          slug: "cvs-and-interviews",
          name: "CVs & Interviews",
          description: "",
          seo_title: null,
          seo_description: null,
          count: has ? 2 : 0,
          updated_at: null,
        },
      ],
      total: has ? 2 : 0,
      has_articles: has,
    },
  });
  const params = (q: Record<string, string> = {}) => ({ searchParams: Promise.resolve(q) });

  it("is not indexed while no article is published, and still links the guides", async () => {
    catalog.getInsightsHome.mockResolvedValue(home(false));
    expect((await homeMeta(params())).robots).toEqual({ index: false, follow: true });
    const root = await serverHtml(await InsightsHomePage(params()));
    expect(root.querySelector('[data-testid="insights-empty"]')).not.toBeNull();
    expect(root.querySelector('a[href="/guides/how-to-prepare-a-cv"]')).not.toBeNull();
  });

  it("is indexed with articles, and lists them as plain links", async () => {
    catalog.getInsightsHome.mockResolvedValue(home(true));
    expect((await homeMeta(params())).robots).toBeUndefined();
    const root = await serverHtml(await InsightsHomePage(params()));
    expect(root.querySelector('a[href="/insights/article-2"]')).not.toBeNull();
    expect(root.querySelector('a[href="/insights/category/cvs-and-interviews"]')).not.toBeNull();
  });

  it("a search, a tag and a later page are views: noindex, follow, canonical to the home", async () => {
    for (const q of [{ q: "cv" }, { tag: "cv" }, { page: "2" }] as Record<string, string>[]) {
      const meta = await homeMeta(params(q));
      expect(meta.robots).toEqual({ index: false, follow: true });
      expect(meta.alternates?.canonical).toBe("/insights");
    }
    catalog.listInsightsArticles.mockResolvedValue(page([card(3)]));
    const root = await serverHtml(await InsightsHomePage(params({ q: "cv" })));
    expect(root.textContent).toContain("Articles about “cv”");
    expect(root.querySelector('a[href="/insights/article-3"]')).not.toBeNull();
  });

  it("an empty category is not indexed; a later page is canonical to itself and not indexed", async () => {
    const cat = (count: number) => ({
      ok: true as const,
      data: {
        data: [
          {
            slug: "graduates-and-internships",
            name: "Graduates & Internships",
            description: "d",
            seo_title: null,
            seo_description: null,
            count,
            updated_at: null,
          },
        ],
      },
    });
    catalog.listInsightsCategories.mockResolvedValue(cat(0));
    const props = (q: Record<string, string> = {}) => ({
      params: Promise.resolve({ slug: "graduates-and-internships" }),
      searchParams: Promise.resolve(q),
    });
    expect((await categoryMeta(props())).robots).toEqual({ index: false, follow: true });
    catalog.listInsightsArticles.mockResolvedValue(page([]));
    const root = await serverHtml(await CategoryPage(props()));
    expect(root.querySelector('[data-testid="category-empty"]')).not.toBeNull();

    catalog.listInsightsCategories.mockResolvedValue(cat(20));
    expect((await categoryMeta(props())).robots).toBeUndefined();
    const later = await categoryMeta(props({ page: "2" }));
    expect(later.robots).toEqual({ index: false, follow: true });
    expect(later.alternates?.canonical).toBe("/insights/category/graduates-and-internships?page=2");
  });
});

describe("sitemap", () => {
  const feed = { ok: true as const, data: { data: [], categories: [], collections: [], employers: [] } };

  it("lists Career Insights only once an article is published", async () => {
    catalog.getSitemapEntries.mockResolvedValue(feed);
    catalog.getInsightsSitemap.mockResolvedValue({
      ok: true,
      data: { articles: [], categories: [], authors: [], updated_at: null },
    });
    expect((await sitemap()).some((e) => e.url.includes("/insights"))).toBe(false);

    catalog.getInsightsSitemap.mockResolvedValue({
      ok: true,
      data: {
        articles: [{ slug: "article-1", updated_at: "2026-11-12T08:00:00Z" }],
        categories: [{ slug: "cvs-and-interviews", updated_at: "2026-11-12T08:00:00Z" }],
        authors: [],
        updated_at: "2026-11-12T08:00:00Z",
      },
    });
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain("https://upnext.co.zw/insights");
    expect(urls).toContain("https://upnext.co.zw/insights/article-1");
    expect(urls).toContain("https://upnext.co.zw/insights/category/cvs-and-interviews");
    expect(urls.some((u) => u.includes("?"))).toBe(false);
  });
});
