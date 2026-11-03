import type { Metadata } from "next";
import { Container } from "@/components/layout";
import { LandingView } from "@/components/opportunities/landing";
import { EmptyState } from "@/components/ui";
import { socialFor } from "@/lib/brand";
import { getSitemapFeed, listOpportunities } from "@/lib/catalog";
import { isIndexableLanding, placePath, REMOTE_COPY, REMOTE_PATH } from "@/lib/landing";
import { cache } from "react";

export const dynamic = "force-dynamic";
const LIMIT = 20;
const listings = cache(() =>
  listOpportunities(new URLSearchParams({ work_mode: "remote", limit: String(LIMIT) })),
);

export async function generateMetadata(): Promise<Metadata> {
  const list = await listings();
  const index = list.ok && isIndexableLanding(list.data.data.length);
  return {
    title: REMOTE_COPY.title,
    description: REMOTE_COPY.description,
    alternates: { canonical: REMOTE_PATH },
    ...socialFor(REMOTE_PATH, { title: REMOTE_COPY.title, description: REMOTE_COPY.description }),
    ...(index ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function RemoteJobsPage() {
  const [list, feed] = await Promise.all([listings(), getSitemapFeed()]);
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
    ? feed.data.locations
        .filter((l) => isIndexableLanding(l.count))
        .map((l) => ({ href: placePath(l.slug), label: `Jobs in ${l.name}` }))
    : [];
  return (
    <LandingView
      path={REMOTE_PATH}
      heading={REMOTE_COPY.heading}
      subject="that can be done remotely"
      rows={list.data.data}
      hasMore={list.data.page.has_more}
      seeAllHref="/opportunities?work_mode=remote"
      others={others}
      othersLabel="Jobs by place"
    />
  );
}
