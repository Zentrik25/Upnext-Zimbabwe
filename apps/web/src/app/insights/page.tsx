import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout";
import { GuideCard } from "@/components/public/cards";
import { ArticleCard } from "@/components/insights/article-card";
import { ArticleGrid, first, Pager, pageOf } from "@/components/insights/article-list";
import { JsonLd } from "@/components/seo/json-ld";
import { socialFor } from "@/lib/brand";
import { getInsightsHome, listInsightsArticles } from "@/lib/catalog";
import type { InsightsHome } from "@/lib/insights-types";
import { GUIDES } from "@/lib/guides";
import { absolute } from "@/lib/site";
import { breadcrumbFor } from "@/lib/structured-data";
import { unavailable } from "@/lib/unavailable";

export const dynamic = "force-dynamic";

const TITLE = "Career Insights";
const DESCRIPTION =
  "Practical, reviewed career advice for Zimbabwe: CVs and interviews, graduate programmes and attachments, workplace rights and the job market, from the UPNEXT Careers editors.";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * The Career Insights home (D-78). Only `/insights` itself is indexable: a search (`?q=`), a tag (`?tag=`) or a later
 * page is a view of the same articles (noindex, follow), so no uncontrolled indexable addresses appear. Everything,
 * including the search results, is in the first HTML.
 *
 * While no article is published (AdSense audit 2026-11-16, D-79) the published career guides are the page's main
 * content, drawn from the same list and card as /guides and linking to their own addresses (nothing is copied, no
 * placeholder is shown), and the article search is not offered because it could find nothing. The page stays
 * `noindex, follow` until it has an article of its own, so it never competes with /guides for the same guides.
 */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const raw = await searchParams;
  const view = Boolean(first(raw.q) || first(raw.tag) || pageOf(raw.page) > 1);
  const home = view ? null : await getInsightsHome();
  const empty = home !== null && home.ok && !home.data.has_articles;
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: "/insights" },
    ...socialFor("/insights", { title: TITLE, description: DESCRIPTION }),
    // Not indexed while it has no published article: an empty blog is not content (AdSense remediation, D-74).
    ...(view || empty ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function InsightsHomePage({ searchParams }: Props) {
  const raw = await searchParams;
  const q = first(raw.q).slice(0, 60);
  const tag = first(raw.tag).slice(0, 60);
  const page = pageOf(raw.page);

  if (q || tag || page > 1) {
    const params = new URLSearchParams({ page: String(page), limit: "12" });
    if (q) params.set("q", q);
    if (tag) params.set("tag", tag);
    const result = await listInsightsArticles(params);
    if (!result.ok) unavailable(result.reason);
    const { data, page: info } = result.data;
    if (info.total === 0) {
      // Nothing is published yet: show the guides rather than an empty result and a search that cannot find anything.
      const home = await getInsightsHome();
      if (home.ok && !home.data.has_articles) return <Hub home={home.data} />;
    }
    const heading = q ? `Articles about “${q}”` : tag ? `Articles tagged “${tag.replace(/-/g, " ")}”` : TITLE;
    const href = (n: number) => {
      const next = new URLSearchParams();
      if (q) next.set("q", q);
      if (tag) next.set("tag", tag);
      if (n > 1) next.set("page", String(n));
      const s = next.toString();
      return s ? `/insights?${s}` : "/insights";
    };
    return (
      <Container className="py-10 max-sm:py-6">
        <Header q={q} />
        <section aria-labelledby="results" className="mt-10">
          <h2 id="results" className="m-0 mb-1 text-title font-semibold text-ink">
            {heading}
          </h2>
          <p className="m-0 mb-6 text-ctl text-muted" role="status">
            {info.total === 1 ? "1 article" : `${info.total} articles`}
          </p>
          {data.length > 0 ? (
            <ArticleGrid articles={data} />
          ) : (
            <p className="m-0 text-base text-ink">
              No published article matches yet.{" "}
              <Link href="/insights" className="text-link underline">
                See all Career Insights
              </Link>{" "}
              or read the{" "}
              <Link href="/guides" className="text-link underline">
                career guides
              </Link>
              .
            </p>
          )}
          <Pager page={info.page} pages={info.pages} href={href} />
        </section>
      </Container>
    );
  }

  const result = await getInsightsHome();
  if (!result.ok) unavailable(result.reason);
  return <Hub home={result.data} />;
}

/** The hub itself: articles when there are any, otherwise the published guides as the main content. */
function Hub({ home }: { home: InsightsHome }) {
  const lead = home.featured ?? home.top_story;
  const latest = home.latest.filter((a) => a.slug !== lead?.slug);
  const categories = home.categories.filter((c) => c.count > 0);

  return (
    <Container className="py-10 max-sm:py-6">
      <JsonLd
        data={breadcrumbFor([
          { name: "UPNEXT Careers", url: absolute("/") },
          { name: TITLE, url: absolute("/insights") },
        ])}
      />
      <Header q="" search={home.has_articles} />

      {!home.has_articles ? (
        <section aria-labelledby="career-guides" className="mt-10" data-testid="insights-guides">
          <h2 id="career-guides" className="m-0 mb-1 text-title font-semibold text-ink">
            Career guides
          </h2>
          <p className="m-0 mb-6 max-w-[62ch] text-base text-muted">
            Written and checked by the UPNEXT Careers editors: finding and applying for jobs in Zimbabwe, CVs,
            graduate programmes, internships, and how listings are verified.
          </p>
          <ul className="m-0 grid list-none grid-cols-2 gap-4 p-0 max-sm:grid-cols-1">
            {GUIDES.map((g) => (
              <li key={g.path}>
                <GuideCard guide={g} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {categories.length > 0 ? (
        <nav aria-label="Article categories" className="mt-6">
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {categories.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/insights/category/${c.slug}`}
                  className="inline-flex min-h-[36px] items-center rounded-pill border border-line px-4 text-ctl text-ink hover:bg-surface-pale"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {lead ? (
        <section aria-labelledby="featured" className="mt-10">
          <h2 id="featured" className="sr-only">
            Featured article
          </h2>
          <div className="max-w-[860px]">
            <ArticleCard article={lead} headingLevel={3} />
          </div>
        </section>
      ) : null}

      {home.carousel.length > 0 ? (
        <section aria-labelledby="editors-picks" className="mt-12">
          <h2 id="editors-picks" className="m-0 mb-4 text-title font-semibold text-ink">
            Editors’ picks
          </h2>
          {/* A scrolling row, not an auto-playing carousel: nothing moves on its own (WCAG 2.2.2). */}
          <ul
            className="m-0 flex list-none snap-x gap-6 overflow-x-auto p-0 pb-2"
            aria-label="Editors’ picks"
            tabIndex={0}
          >
            {home.carousel.map((a) => (
              <li key={a.slug} className="w-[280px] shrink-0 snap-start">
                <ArticleCard article={a} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {latest.length > 0 ? (
        <section aria-labelledby="latest" className="mt-12">
          <h2 id="latest" className="m-0 mb-4 text-title font-semibold text-ink">
            Latest articles
          </h2>
          <ArticleGrid articles={latest} />
          {home.total > latest.length + (lead ? 1 : 0) ? (
            <p className="m-0 mt-6 text-ctl">
              <Link href="/insights?page=2" className="text-link underline">
                Older articles
              </Link>
            </p>
          ) : null}
        </section>
      ) : null}

      {home.graduate.length > 0 ? (
        <section aria-labelledby="graduate" className="mt-12">
          <h2 id="graduate" className="m-0 mb-4 text-title font-semibold text-ink">
            Graduate resources
          </h2>
          <ArticleGrid articles={home.graduate} />
          <p className="m-0 mt-4 text-ctl">
            <Link href="/opportunities?category=graduate-programmes" className="text-link underline">
              Open graduate programmes
            </Link>
          </p>
        </section>
      ) : null}

      {home.has_articles ? (
        <section aria-labelledby="guides" className="mt-12 border-t border-line pt-8">
          <h2 id="guides" className="m-0 mb-4 text-title font-semibold text-ink">
            Featured guides
          </h2>
          <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
            {GUIDES.map((g) => (
              <li key={g.path} className="rounded-card border border-line p-4">
                <Link href={g.path} className="text-ctl font-semibold text-ink hover:underline">
                  {g.title}
                </Link>
                <p className="m-0 mt-1 text-small text-muted">{g.description}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="jobs" className="mt-12 rounded-card bg-surface-pale p-6">
        <h2 id="jobs" className="m-0 text-title font-semibold text-ink">
          Related job opportunities
        </h2>
        <p className="m-0 mt-2 text-base text-ink">
          Put the advice to work: browse open, editor-checked listings.
        </p>
        <ul className="m-0 mt-4 flex list-none flex-wrap gap-x-6 gap-y-2 p-0 text-ctl">
          <li>
            <Link href="/opportunities?category=jobs" className="text-link underline">
              Jobs
            </Link>
          </li>
          <li>
            <Link href="/opportunities?category=internships" className="text-link underline">
              Internships and attachments
            </Link>
          </li>
          <li>
            <Link href="/opportunities?category=graduate-programmes" className="text-link underline">
              Graduate programmes
            </Link>
          </li>
          <li>
            <Link href="/opportunities?category=scholarships" className="text-link underline">
              Scholarships
            </Link>
          </li>
        </ul>
      </section>
    </Container>
  );
}

function Header({ q, search = true }: { q: string; search?: boolean }) {
  return (
    <header>
      <h1 className="m-0 text-display">{TITLE}</h1>
      <p className="mt-3 max-w-[62ch] text-lead text-muted">{DESCRIPTION}</p>
      {search ? <SearchForm q={q} /> : null}
    </header>
  );
}

/** Article search: shown only while there are published articles to search. */
function SearchForm({ q }: { q: string }) {
  return (
    <form role="search" method="get" action="/insights" className="mt-6 flex max-w-[560px] gap-2">
      <label htmlFor="insights-q" className="sr-only">
        Search Career Insights
      </label>
      <input
        id="insights-q"
        name="q"
        type="search"
        defaultValue={q}
        maxLength={60}
        placeholder="Search articles"
        className="min-h-[44px] min-w-0 flex-1 rounded-control border border-control-border bg-surface px-3 text-base text-ink"
      />
      <button
        type="submit"
        className="min-h-[44px] rounded-pill bg-accent-solid px-5 text-base font-semibold text-white"
      >
        Search
      </button>
    </form>
  );
}
