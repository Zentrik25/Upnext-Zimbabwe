import Link from "next/link";
import { Container } from "@/components/layout/container";
import { getInsightsHome, listInsightsArticles } from "@/lib/catalog";
import type { ArticleCard } from "@/lib/insights-types";
import { longDate } from "./dates";

/**
 * Published Career Insights articles the editors linked to a job category (D-78), for listings, category lists and
 * job pages. Nothing is shown when none is linked or the API cannot answer: these links are a help, never a reason to
 * fail the page that holds them.
 */
export async function RelatedInsights({
  category,
  heading = "Career Insights",
  limit = 3,
  stack = false,
}: {
  category: string | null | undefined;
  heading?: string;
  limit?: number;
  /** One column (a narrow side column) instead of a row of three. */
  stack?: boolean;
}) {
  if (!category) return null;
  const result = await listInsightsArticles(
    new URLSearchParams({ opportunity_category: category, limit: String(limit) }),
  );
  if (!result.ok || result.data.data.length === 0) return null;
  return (
    <InsightLinks articles={result.data.data} heading={heading} id={`insights-${category}`} stack={stack} />
  );
}

/** The home page's Career Insights section: the top story first, then the editors' picks or the latest. */
export async function HomeInsights() {
  const result = await getInsightsHome();
  if (!result.ok || !result.data.has_articles) return null;
  const home = result.data;
  const seen = new Set<string>();
  const picks = [home.top_story, home.featured, ...home.carousel, ...home.latest]
    .filter((a): a is ArticleCard => a !== null && !seen.has(a.slug) && Boolean(seen.add(a.slug)))
    .slice(0, 3);
  return (
    <div className="pb-8 max-sm:pb-6">
      <Container>
        <InsightLinks articles={picks} heading="Career Insights" id="home-insights" all />
      </Container>
    </div>
  );
}

function InsightLinks({
  articles,
  heading,
  id,
  all = false,
  stack = false,
}: {
  articles: ArticleCard[];
  heading: string;
  id: string;
  all?: boolean;
  stack?: boolean;
}) {
  return (
    <section aria-labelledby={id} className="mt-8 border-t border-line pt-5" data-testid="related-insights">
      <h2 id={id} className="m-0 mb-3 text-title font-strong text-ink">
        {heading}
      </h2>
      <ul className={`m-0 grid list-none gap-3 p-0 ${stack ? "" : "sm:grid-cols-3"}`}>
        {articles.map((a) => (
          <li key={a.slug}>
            <Link href={`/insights/${a.slug}`} className="text-ctl font-strong text-link underline">
              {a.headline}
            </Link>
            <p className="m-0 mt-0.5 text-small text-muted">
              {a.category ? `${a.category.name} · ` : null}
              {longDate(a.published_at)}
            </p>
          </li>
        ))}
      </ul>
      <p className="m-0 mt-3 text-small">
        <Link href="/insights" className="text-link underline">
          {all ? "All Career Insights" : "More Career Insights"}
        </Link>
      </p>
    </section>
  );
}
