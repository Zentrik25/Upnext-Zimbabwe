import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";
import { Container } from "@/components/layout";
import { SaveToggle } from "@/components/account/save-toggle";
import { JsonLd } from "@/components/seo/json-ld";
import { JobView } from "@/components/opportunities/job-view";
import { ListingEvents } from "@/components/opportunities/listing-events";
import { OpportunityRow } from "@/components/opportunities/parts";
import { EmptyState } from "@/components/ui";
import { SkeletonLine, SkeletonListingRows } from "@/components/ui/skeleton";
import { CATEGORY_SEO } from "@/lib/category-seo";
import { socialFor } from "@/lib/brand";
import { getOpportunity as fetchOpportunity, listOpportunities } from "@/lib/catalog";
import type { OpportunityDetail } from "@/lib/catalog-types";
import { absolute } from "@/lib/site";
import { breadcrumbFor, isOpen, jobPostingFor } from "@/lib/structured-data";
import { getCurrentUser, getSavedIds } from "@/lib/session";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

/** The metadata and the page of one render share one request for the listing. */
const getOpportunity = cache(fetchOpportunity);

/** A short plain description when the editor wrote none: the start of what the listing says, never invented. */
function plain(html: string, max = 160): string {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const result = await getOpportunity(slug);
  if (!result.ok || result.data === null) return { title: "Opportunity not found", robots: { index: false } };
  const listing = result.data;
  const seo = listing.seo;
  const title = seo?.title || `${listing.title} at ${listing.organisation.name}`;
  const description =
    seo?.description ||
    listing.summary ||
    plain(listing.description_html) ||
    `${listing.category.name} listing from ${listing.organisation.name}.`;
  return {
    title,
    description,
    alternates: { canonical: listing.canonical_path },
    ...socialFor(listing.canonical_path, {
      title: seo?.og_title || title,
      description: seo?.og_description || description,
    }),
    // Closed, withdrawn and past-deadline listings stay readable but are not promoted by search engines (OQ-20 default).
    robots: isOpen(listing) ? undefined : { index: false },
  };
}

export default async function OpportunityPage({ params }: Props) {
  const { slug } = await params;
  const result = await getOpportunity(slug);
  if (!result.ok) {
    return (
      <Container className="py-10" role="alert">
        <EmptyState as="h1" title="This opportunity is unavailable">
          {result.reason === "rate-limited"
            ? "Too many requests. Wait a minute and try again."
            : "The service could not be reached. Try again shortly."}
        </EmptyState>
      </Container>
    );
  }
  if (result.data === null) notFound();
  const listing = result.data;
  const pageUrl = absolute(`/opportunities/${listing.slug}`);
  const posting = jobPostingFor(listing, pageUrl);
  return (
    <>
      {posting ? <JsonLd data={posting} /> : null}
      {isOpen(listing) ? (
        <JsonLd
          data={breadcrumbFor([
            { name: "Opportunities", url: absolute("/opportunities") },
            ...(CATEGORY_SEO[listing.category.code]
              ? [
                  {
                    name: listing.category.name,
                    url: absolute(`/opportunities?category=${listing.category.code}`),
                  },
                ]
              : []),
            { name: listing.title, url: pageUrl },
          ])}
        />
      ) : null}
      <ListingEvents slug={listing.slug} open={listing.status === "published"} />
      <JobView
        listing={listing}
        personal={
          <Suspense fallback={listing.status === "published" ? <SaveSkeleton /> : null}>
            <ListingSave listing={listing} />
          </Suspense>
        }
        related={
          <Suspense fallback={<RelatedSkeleton />}>
            <Related listing={listing} />
          </Suspense>
        }
      />
    </>
  );
}

/**
 * The save control needs the visitor's session, which is a request of its own. Everything else on the page comes from
 * the one listing request that has already decided the status code, so the page is sent without waiting for the
 * session and this control follows in its own boundary. Until the session is known no save or sign-in prompt is drawn.
 */
async function ListingSave({ listing }: { listing: OpportunityDetail }) {
  const user = await getCurrentUser();
  const isSaved = user ? (await getSavedIds([listing.id])).has(listing.id) : false;
  if (listing.status !== "published" && !isSaved) return null;
  return (
    <SaveToggle
      opportunityId={listing.id}
      title={listing.title}
      initialSaved={isSaved}
      signedIn={Boolean(user)}
      returnTo={`/opportunities/${listing.slug}`}
      showLabel
    />
  );
}

/** Holds the save control's place (44px) and announces nothing: it is one small control, not a region. */
function SaveSkeleton() {
  return (
    <div aria-hidden="true" className="flex min-h-[44px] items-center">
      <SkeletonLine className="w-[120px] skeleton-pulse" />
    </div>
  );
}

/** Up to three other open listings in the category that have been checked against a source or the issuer. */
async function Related({ listing }: { listing: OpportunityDetail }) {
  const params = new URLSearchParams({ category: listing.category.code, limit: "8" });
  const result = await listOpportunities(params);
  if (!result.ok) return null;
  const rows = result.data.data
    .filter(
      (r) => r.slug !== listing.slug && r.status === "published" && r.verification.level !== "not_verified",
    )
    .slice(0, 3);
  if (!rows.length) return null;
  return (
    <section aria-labelledby="related-title" className="mt-8">
      <h2 id="related-title" className="border-b border-line pb-1 text-title font-strong">
        Related verified opportunities
      </h2>
      <div className="mt-1">
        {rows.map((row) => (
          <OpportunityRow key={row.id} row={row} />
        ))}
      </div>
    </section>
  );
}

function RelatedSkeleton() {
  return (
    <div aria-hidden="true" className="mt-8 skeleton-pulse">
      <SkeletonLine className="h-[22px] w-[240px]" />
      <SkeletonListingRows count={2} />
    </div>
  );
}
