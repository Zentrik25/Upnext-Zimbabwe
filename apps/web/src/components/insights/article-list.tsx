import Link from "next/link";
import type { ArticleCard as Card } from "@/lib/insights-types";
import { ArticleCard } from "./article-card";

/** A grid of article cards. */
export function ArticleGrid({ articles, label }: { articles: Card[]; label?: string }) {
  return (
    <ul aria-label={label} className="m-0 grid list-none gap-8 p-0 sm:grid-cols-2 lg:grid-cols-3">
      {articles.map((a) => (
        <li key={a.slug}>
          <ArticleCard article={a} />
        </li>
      ))}
    </ul>
  );
}

/** Previous / next links for a paged list; `href` builds the address of a page (page one has no parameter). */
export function Pager({
  page,
  pages,
  href,
}: {
  page: number;
  pages: number;
  href: (page: number) => string;
}) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pages" className="mt-10 flex items-center justify-between gap-4 text-ctl">
      {page > 1 ? (
        <Link href={href(page - 1)} rel="prev" className="text-link underline">
          ← Newer articles
        </Link>
      ) : (
        <span />
      )}
      <span className="text-muted">
        Page {page} of {pages}
      </span>
      {page < pages ? (
        <Link href={href(page + 1)} rel="next" className="text-link underline">
          Older articles →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

/** Reads a positive page number from a query value; anything else is page one. */
export function pageOf(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = Number(raw);
  return Number.isInteger(n) && n > 1 && n <= 10_000 ? n : 1;
}

export function first(value: string | string[] | undefined): string {
  return ((Array.isArray(value) ? value[0] : value) ?? "").trim();
}
