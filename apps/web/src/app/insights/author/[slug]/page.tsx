import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/layout";
import { ArticleGrid } from "@/components/insights/article-list";
import { JsonLd } from "@/components/seo/json-ld";
import { socialFor } from "@/lib/brand";
import { getInsightsAuthor } from "@/lib/catalog";
import { absolute, SITE_NAME } from "@/lib/site";
import { unavailable } from "@/lib/unavailable";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

/**
 * An author archive (D-78). The API answers only for a public profile with enough published articles
 * (AUTHOR_ARCHIVE_MIN), so a thin archive page never exists. Biography and expertise are what the profile states;
 * nothing is invented here.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const result = await getInsightsAuthor(slug);
  if (!result.ok) unavailable(result.reason);
  if (result.data === null) return { title: "Author not found", robots: { index: false } };
  const author = result.data;
  const title = `${author.name}: Career Insights`;
  const description = author.bio || `Career Insights articles by ${author.name} on UPNEXT Careers.`;
  return {
    title,
    description,
    alternates: { canonical: `/insights/author/${author.slug}` },
    ...socialFor(`/insights/author/${author.slug}`, { title, description }),
  };
}

export default async function InsightsAuthorPage({ params }: Props) {
  const { slug } = await params;
  const result = await getInsightsAuthor(slug);
  if (!result.ok) unavailable(result.reason);
  if (result.data === null) notFound();
  const author = result.data;
  return (
    <Container className="py-10 max-sm:py-6">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ProfilePage",
          url: absolute(`/insights/author/${author.slug}`),
          mainEntity: {
            "@type": "Person",
            name: author.name,
            ...(author.bio ? { description: author.bio } : {}),
            ...(author.expertise.length ? { knowsAbout: author.expertise } : {}),
            worksFor: { "@type": "Organization", name: SITE_NAME, url: absolute("/") },
          },
        }}
      />
      <nav aria-label="Breadcrumb" className="text-small text-muted">
        <Link href="/insights" className="text-link">
          Career Insights
        </Link>
      </nav>
      <h1 className="m-0 mt-2 text-display">{author.name}</h1>
      {author.bio ? <p className="mt-3 max-w-[62ch] text-lead text-muted">{author.bio}</p> : null}
      {author.expertise.length ? (
        <p className="m-0 mt-2 text-ctl text-muted">Writes about: {author.expertise.join(", ")}</p>
      ) : null}
      <section aria-labelledby="by-author" className="mt-10">
        <h2 id="by-author" className="m-0 mb-4 text-title font-semibold text-ink">
          Articles by {author.name}
        </h2>
        <ArticleGrid articles={author.articles} />
      </section>
    </Container>
  );
}
