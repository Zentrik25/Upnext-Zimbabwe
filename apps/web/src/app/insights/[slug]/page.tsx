import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { ArticleView } from "@/components/insights/article-view";
import { JsonLd } from "@/components/seo/json-ld";
import { socialFor } from "@/lib/brand";
import { getInsightsArticle, listOpportunities } from "@/lib/catalog";
import type { ArticleDetail } from "@/lib/insights-types";
import { absolute, SITE_NAME } from "@/lib/site";
import { breadcrumbFor } from "@/lib/structured-data";
import { unavailable } from "@/lib/unavailable";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

const canonicalOf = (a: ArticleDetail) => a.canonical_url ?? `/insights/${a.slug}`;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const result = await getInsightsArticle(slug);
  if (!result.ok) unavailable(result.reason);
  if (result.data === null) return { title: "Article not found", robots: { index: false } };
  const a = result.data;
  const title = a.seo.title || a.headline;
  const description = a.seo.description || a.summary;
  const image = a.seo.social_image?.startsWith("https://")
    ? { url: a.seo.social_image, alt: a.image?.alt || undefined }
    : null;
  const social = socialFor(`/insights/${a.slug}`, {
    title: a.seo.social_title || title,
    description: a.seo.social_description || description,
    image,
  });
  return {
    title,
    description,
    alternates: { canonical: canonicalOf(a) },
    ...social,
    openGraph: {
      ...social.openGraph,
      type: "article",
      ...(a.published_at ? { publishedTime: a.published_at } : {}),
      ...(a.updated_at ? { modifiedTime: a.updated_at } : {}),
      ...(a.category ? { section: a.category.name } : {}),
      tags: a.tags.map((t) => t.name),
    },
  };
}

export default async function InsightsArticlePage({ params }: Props) {
  const { slug } = await params;
  const result = await getInsightsArticle(slug);
  if (!result.ok) unavailable(result.reason);
  if (result.data === null) notFound();
  const a = result.data;
  // An old address (the slug changed after publication) moves permanently to the current one.
  if (a.slug !== slug) permanentRedirect(`/insights/${a.slug}`);

  // Open listings in the first job category the editors linked; never closed ones (the public list shows open only).
  const code = a.opportunity_categories[0];
  const jobs = code ? await listOpportunities(new URLSearchParams({ category: code, limit: "6" })) : null;

  const url = absolute(`/insights/${a.slug}`);
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: a.headline,
          description: a.summary,
          mainEntityOfPage: url,
          url,
          ...(a.published_at ? { datePublished: a.published_at } : {}),
          ...(a.updated_at ? { dateModified: a.updated_at } : {}),
          author: {
            "@type": "Person",
            name: a.author.name,
            ...(a.author.slug ? { url: absolute(`/insights/author/${a.author.slug}`) } : {}),
          },
          publisher: { "@type": "Organization", name: SITE_NAME, url: absolute("/") },
          ...(a.image?.url.startsWith("https://") ? { image: [a.image.url] } : {}),
          ...(a.category ? { articleSection: a.category.name } : {}),
          ...(a.tags.length ? { keywords: a.tags.map((t) => t.name).join(", ") } : {}),
          wordCount: a.word_count,
        }}
      />
      <JsonLd
        data={breadcrumbFor([
          { name: SITE_NAME, url: absolute("/") },
          { name: "Career Insights", url: absolute("/insights") },
          ...(a.category
            ? [{ name: a.category.name, url: absolute(`/insights/category/${a.category.slug}`) }]
            : []),
          { name: a.headline, url },
        ])}
      />
      <ArticleView article={a} jobs={jobs?.ok ? jobs.data.data : []} />
    </>
  );
}
