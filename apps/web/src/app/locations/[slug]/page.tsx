import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Container } from "@/components/layout";
import { LandingView } from "@/components/opportunities/landing";
import { EmptyState } from "@/components/ui";
import { socialFor } from "@/lib/brand";
import { getSitemapFeed, listLocations, listOpportunities } from "@/lib/catalog";
import { isIndexableLanding, placeCopy, placePath, REMOTE_PATH } from "@/lib/landing";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };
const LIMIT = 20;

/** Only a city or province has a landing page: the country is the whole list and remote work has its own page. */
const placeOf = cache(async (slug: string) =>
  (await listLocations()).find((l) => l.slug === slug && (l.kind === "city" || l.kind === "province")),
);
const listingsOf = cache((slug: string) =>
  listOpportunities(new URLSearchParams({ location: slug, limit: String(LIMIT) })),
);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const place = await placeOf(slug);
  if (!place) return { title: "Location not found", robots: { index: false } };
  const copy = placeCopy(place.name);
  const list = await listingsOf(slug);
  // Offered to search engines only while the page holds enough real listings (the sitemap applies the same rule).
  const index = list.ok && isIndexableLanding(list.data.data.length);
  return {
    title: copy.title,
    description: copy.description,
    alternates: { canonical: placePath(slug) },
    ...socialFor(placePath(slug), { title: copy.title, description: copy.description }),
    ...(index ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function LocationPage({ params }: Props) {
  const { slug } = await params;
  const place = await placeOf(slug);
  if (!place) notFound();
  const [list, feed] = await Promise.all([listingsOf(slug), getSitemapFeed()]);
  if (!list.ok) {
    return (
      <Container className="py-10" role="alert">
        <EmptyState as="h1" title="This page is unavailable">
          {list.reason === "rate-limited"
            ? "Too many requests. Wait a minute and try again."
            : "The service could not be reached. Try again shortly."}
        </EmptyState>
      </Container>
    );
  }
  const others = feed.ok
    ? [
        ...feed.data.locations
          .filter((l) => l.slug !== slug && isIndexableLanding(l.count))
          .map((l) => ({ href: placePath(l.slug), label: `Jobs in ${l.name}` })),
        ...(isIndexableLanding(feed.data.remote.count) ? [{ href: REMOTE_PATH, label: "Remote jobs" }] : []),
      ]
    : [];
  return (
    <LandingView
      path={placePath(slug)}
      heading={placeCopy(place.name).heading}
      subject={`in ${place.name}`}
      rows={list.data.data}
      hasMore={list.data.page.has_more}
      seeAllHref={`/opportunities?location=${slug}`}
      others={others}
      othersLabel="Other places"
    />
  );
}
