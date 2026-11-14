import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/layout";
import { ArticleGrid, Pager, pageOf } from "@/components/insights/article-list";
import { JsonLd } from "@/components/seo/json-ld";
import { socialFor } from "@/lib/brand";
import { listInsightsArticles, listInsightsCategories } from "@/lib/catalog";
import { absolute, SITE_NAME } from "@/lib/site";
import { breadcrumbFor } from "@/lib/structured-data";
import { unavailable } from "@/lib/unavailable";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function categoryOf(slug: string) {
  const result = await listInsightsCategories();
  if (!result.ok) unavailable(result.reason);
  return result.data.data.find((c) => c.slug === slug) ?? null;
}

/** An article category (D-78). Indexed only while it holds a published article, and only page one. */
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = pageOf((await searchParams).page);
  const category = await categoryOf(slug);
  if (!category) return { title: "Category not found", robots: { index: false } };
  const title = category.seo_title || `${category.name}: Career Insights`;
  const description =
    category.seo_description || category.description || `${category.name} articles from UPNEXT Careers.`;
  const path = `/insights/category/${category.slug}`;
  return {
    title,
    description,
    alternates: { canonical: page > 1 ? `${path}?page=${page}` : path },
    ...socialFor(path, { title, description }),
    ...(category.count === 0 || page > 1 ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function InsightsCategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const page = pageOf((await searchParams).page);
  const category = await categoryOf(slug);
  if (!category) notFound();
  const result = await listInsightsArticles(
    new URLSearchParams({ category: category.slug, page: String(page), limit: "12" }),
  );
  if (!result.ok) unavailable(result.reason);
  const { data, page: info } = result.data;
  const path = `/insights/category/${category.slug}`;
  return (
    <Container className="py-10 max-sm:py-6">
      <JsonLd
        data={breadcrumbFor([
          { name: SITE_NAME, url: absolute("/") },
          { name: "Career Insights", url: absolute("/insights") },
          { name: category.name, url: absolute(path) },
        ])}
      />
      <nav aria-label="Breadcrumb" className="text-small text-muted">
        <Link href="/insights" className="text-link">
          Career Insights
        </Link>
      </nav>
      <h1 className="m-0 mt-2 text-display">{category.name}</h1>
      {category.description ? (
        <p className="mt-3 max-w-[62ch] text-lead text-muted">{category.description}</p>
      ) : null}
      <div className="mt-8">
        {data.length > 0 ? (
          <ArticleGrid articles={data} label={`${category.name} articles`} />
        ) : (
          <p className="m-0 text-base text-ink" data-testid="category-empty">
            No article is published in this category yet.{" "}
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
      </div>
      <Pager page={info.page} pages={info.pages} href={(n) => (n > 1 ? `${path}?page=${n}` : path)} />
    </Container>
  );
}
