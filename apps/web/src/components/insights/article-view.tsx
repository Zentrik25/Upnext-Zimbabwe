import Link from "next/link";
import { Container } from "@/components/layout/container";
import { ArticleHtml } from "@/lib/article-html";
import type { OpportunitySummary } from "@/lib/catalog-types";
import { guidesFor } from "@/lib/category-resources";
import type { ArticleDetail } from "@/lib/insights-types";
import { absolute } from "@/lib/site";
import { ArticleCard } from "./article-card";
import { longDate, updatedLater } from "./dates";
import { ShareControls } from "./share-controls";

/**
 * A Career Insights article (D-78): breadcrumb, category, headline, summary, author, dates and reading time; the
 * featured picture with its caption and credit (never invented); the optional reader aids (shown only when written);
 * the body; tags; sources; sharing; the author; then related articles, open opportunities in the categories the
 * editors linked, and the published guides for them. Everything is in the first HTML.
 */
export function ArticleView({
  article,
  jobs = [],
  preview = false,
}: {
  article: ArticleDetail;
  /** Open opportunities in the article's linked categories (already filtered by the page: never closed ones). */
  jobs?: OpportunitySummary[];
  preview?: boolean;
}) {
  const published = longDate(article.published_at);
  const updated = updatedLater(article.published_at, article.updated_at)
    ? longDate(article.updated_at)
    : null;
  const guides = [
    ...new Map(
      article.opportunity_categories.flatMap((code) => guidesFor(code)).map((g) => [g.path, g] as const),
    ).values(),
  ].slice(0, 3);
  const url = absolute(`/insights/${article.slug}`);

  return (
    <Container className="py-8 max-sm:py-5">
      <article aria-labelledby="article-title" className="mx-auto max-w-[720px]">
        <nav aria-label="Breadcrumb" className="text-small text-muted">
          <Link href="/insights" className="text-link">
            Career Insights
          </Link>
          {article.category ? (
            <>
              <span aria-hidden="true"> › </span>
              <Link href={`/insights/category/${article.category.slug}`} className="text-link">
                {article.category.name}
              </Link>
            </>
          ) : null}
        </nav>
        {article.category ? (
          <p className="m-0 mt-4 text-small font-strong uppercase tracking-[0.06em] text-muted">
            {article.category.name}
          </p>
        ) : null}
        <h1
          id="article-title"
          className="m-0 mt-2 text-[2rem] leading-[1.15] font-semibold tracking-[-0.015em] text-ink sm:text-[2.5rem]"
        >
          {article.headline}
        </h1>
        {article.summary ? (
          <p className="m-0 mt-3 text-[1.2rem] leading-[1.5] text-muted">{article.summary}</p>
        ) : null}
        <p className="m-0 mt-4 text-ctl text-muted" data-testid="article-meta">
          By{" "}
          {article.author.slug && !preview ? (
            <Link href={`/insights/author/${article.author.slug}`} className="text-link">
              {article.author.name}
            </Link>
          ) : (
            <span className="text-ink">{article.author.name}</span>
          )}
          {published ? (
            <>
              {" · "}
              <time dateTime={article.published_at ?? undefined}>{published}</time>
            </>
          ) : preview ? (
            " · Not published yet"
          ) : null}
          {updated ? (
            <>
              {" · Updated "}
              <time dateTime={article.updated_at ?? undefined}>{updated}</time>
            </>
          ) : null}
          {" · "}
          {article.reading_minutes} min read
        </p>

        {article.image ? (
          <figure className="m-0 mt-6">
            {/* eslint-disable-next-line @next/next/no-img-element -- Media Library pictures are already optimised. */}
            <img
              src={article.image.url}
              alt={article.image.alt}
              width={1280}
              height={720}
              fetchPriority="high"
              className="aspect-[16/9] w-full rounded-card bg-surface-pale object-cover"
            />
            {article.image.caption || article.image.credit ? (
              <figcaption className="mt-2 text-small text-muted">
                {article.image.caption}
                {article.image.caption && article.image.credit ? " " : null}
                {article.image.credit ? <span>Picture: {article.image.credit}</span> : null}
              </figcaption>
            ) : null}
          </figure>
        ) : null}

        {article.in_short.length > 0 || article.why_it_matters ? (
          <aside className="mt-6 grid gap-4 rounded-card bg-surface-pale p-5" aria-label="Reader aids">
            {article.in_short.length > 0 ? (
              <section aria-labelledby="in-short">
                <h2 id="in-short" className="m-0 text-ctl font-semibold text-ink">
                  In short
                </h2>
                <ul className="m-0 mt-2 grid list-disc gap-1 pl-5 text-base text-ink">
                  {article.in_short.map((point, i) => (
                    <li key={i}>{point}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            {article.why_it_matters ? (
              <section aria-labelledby="why-it-matters">
                <h2 id="why-it-matters" className="m-0 text-ctl font-semibold text-ink">
                  Why it matters
                </h2>
                <p className="m-0 mt-2 text-base text-ink">{article.why_it_matters}</p>
              </section>
            ) : null}
          </aside>
        ) : null}

        <div className="insights-prose mt-8" data-testid="article-body">
          <ArticleHtml html={article.body_html} />
        </div>

        {article.tags.length > 0 ? (
          <ul aria-label="Tags" className="m-0 mt-8 flex list-none flex-wrap gap-2 p-0">
            {article.tags.map((t) => (
              <li key={t.slug}>
                <Link
                  href={`/insights?tag=${t.slug}`}
                  className="inline-flex min-h-[32px] items-center rounded-control border border-line px-3 text-small text-ink hover:bg-surface-pale"
                >
                  {t.name}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        {article.sources.length > 0 ? (
          <section aria-labelledby="sources" className="mt-10 border-t border-line pt-6">
            <h2 id="sources" className="m-0 text-title font-semibold text-ink">
              Sources and references
            </h2>
            <ol className="m-0 mt-3 grid list-decimal gap-2 pl-5 text-ctl text-ink">
              {article.sources.map((s, i) => (
                <li key={i}>
                  {s.url ? (
                    <a href={s.url} rel="noopener noreferrer" target="_blank" className="text-link underline">
                      {s.title}
                    </a>
                  ) : (
                    s.title
                  )}
                  {s.publisher ? <>, {s.publisher}</> : null}
                  {s.published_on ? <>, published {longDate(s.published_on)}</> : null}
                  {s.accessed_on ? <> (accessed {longDate(s.accessed_on)})</> : null}
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {!preview ? (
          <section aria-labelledby="share" className="mt-8 border-t border-line pt-6">
            <h2 id="share" className="m-0 mb-3 text-ctl font-semibold text-ink">
              Share this article
            </h2>
            <ShareControls url={url} title={article.headline} />
          </section>
        ) : null}

        {article.author.bio ? (
          <section aria-labelledby="about-author" className="mt-8 rounded-card border border-line p-5">
            <h2 id="about-author" className="m-0 text-ctl font-semibold text-ink">
              About {article.author.name}
            </h2>
            <p className="m-0 mt-2 text-ctl text-ink">{article.author.bio}</p>
            {article.author.expertise?.length ? (
              <p className="m-0 mt-2 text-small text-muted">
                Writes about: {article.author.expertise.join(", ")}
              </p>
            ) : null}
          </section>
        ) : null}

        <p className="m-0 mt-8 text-small text-muted">
          Spotted an error?{" "}
          <Link href="/contact" className="text-link underline">
            Tell the editors
          </Link>
          .
        </p>
      </article>

      {article.related.length > 0 || jobs.length > 0 || guides.length > 0 ? (
        <div className="mx-auto mt-12 grid max-w-[1080px] gap-10 border-t border-line pt-8">
          {article.related.length > 0 ? (
            <section aria-labelledby="related-articles">
              <h2 id="related-articles" className="m-0 mb-4 text-title font-semibold text-ink">
                Related articles
              </h2>
              <ul className="m-0 grid list-none gap-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
                {article.related.map((r) => (
                  <li key={r.slug}>
                    <ArticleCard article={r} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {jobs.length > 0 ? (
            <section aria-labelledby="related-jobs">
              <h2 id="related-jobs" className="m-0 mb-4 text-title font-semibold text-ink">
                Open opportunities
              </h2>
              <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
                {jobs.map((job) => (
                  <li key={job.id} className="rounded-card border border-line p-4">
                    <Link
                      href={`/opportunities/${job.slug}`}
                      className="text-ctl font-semibold text-ink hover:underline"
                    >
                      {job.title}
                    </Link>
                    <p className="m-0 mt-1 text-small text-muted">{job.organisation.name}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {guides.length > 0 ? (
            <section aria-labelledby="related-guides">
              <h2 id="related-guides" className="m-0 mb-4 text-title font-semibold text-ink">
                Career guides
              </h2>
              <ul className="m-0 grid list-none gap-2 p-0">
                {guides.map((g) => (
                  <li key={g.path}>
                    <Link href={g.path} className="text-ctl text-link underline">
                      {g.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </Container>
  );
}
