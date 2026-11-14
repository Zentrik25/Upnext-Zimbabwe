import Link from "next/link";
import type { ArticleCard as Card } from "@/lib/insights-types";
import { longDate } from "./dates";

/** One article in a list: picture (when there is one), category, headline, summary, author and date. */
export function ArticleCard({ article, headingLevel = 3 }: { article: Card; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const date = longDate(article.published_at);
  return (
    <article className="flex h-full flex-col gap-2" data-testid="article-card">
      {article.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- Media Library pictures are already optimised.
        <img
          src={article.image.url}
          alt={article.image.alt}
          width={640}
          height={360}
          loading="lazy"
          decoding="async"
          className="aspect-[16/9] w-full rounded-card bg-surface-pale object-cover"
        />
      ) : null}
      {article.category ? (
        <Link
          href={`/insights/category/${article.category.slug}`}
          className="text-small font-strong text-link"
        >
          {article.category.name}
        </Link>
      ) : null}
      <Heading className="m-0 text-title font-strong leading-title text-ink">
        <Link href={`/insights/${article.slug}`} className="hover:underline">
          {article.headline}
        </Link>
      </Heading>
      {article.summary ? <p className="m-0 text-ctl text-muted">{article.summary}</p> : null}
      <p className="m-0 mt-auto text-small text-muted">
        {article.author.name}
        {date ? (
          <>
            {" · "}
            <time dateTime={article.published_at ?? undefined}>{date}</time>
          </>
        ) : null}
        {" · "}
        {article.reading_minutes} min read
      </p>
    </article>
  );
}
