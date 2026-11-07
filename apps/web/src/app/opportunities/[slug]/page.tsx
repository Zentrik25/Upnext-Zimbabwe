import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cache, Suspense } from "react";
import { SaveToggle } from "@/components/account/save-toggle";
import { JsonLd } from "@/components/seo/json-ld";
import { AdSlot } from "@/components/ads/ad-slot";
import { JobView } from "@/components/opportunities/job-view";
import { ListingEvents } from "@/components/opportunities/listing-events";
import { RelatedCard } from "@/components/opportunities/job-parts";
import { Icon } from "@/components/ui/icons";
import { SkeletonLine, SkeletonListingRows } from "@/components/ui/skeleton";
import { CATEGORY_SEO } from "@/lib/category-seo";
import { shareImage, socialFor } from "@/lib/brand";
import { getOpportunity as fetchOpportunity, listOpportunities } from "@/lib/catalog";
import type { OpportunityDetail } from "@/lib/catalog-types";
import { absolute } from "@/lib/site";
import { breadcrumbFor, isOpen, jobPostingFor } from "@/lib/structured-data";
import { getCurrentUser, getSavedIds } from "@/lib/session";
import { unavailable } from "@/lib/unavailable";

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
  // A fault is a server error, never "noindex": see lib/unavailable.ts. A missing listing is a 404 (the page decides).
  if (!result.ok) unavailable(result.reason);
  if (result.data === null) return { title: "Opportunity not found", robots: { index: false } };
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
      // The listing's own sharing picture (or its featured one) as an absolute https address; otherwise the
      // standard UPNEXT image. An employer's logo is never invented.
      image: shareImage(listing.image),
    }),
    // Closed, withdrawn and past-deadline listings stay readable but are not promoted by search engines (OQ-20 default).
    robots: isOpen(listing) ? undefined : { index: false },
  };
}

export default async function OpportunityPage({ params }: Props) {
  const { slug } = await params;
  const result = await getOpportunity(slug);
  if (!result.ok) unavailable(result.reason);
  if (result.data === null) notFound();
  const listing = result.data;
  // The API finds a listing case-insensitively; any other spelling of the address moves to the one canonical one.
  if (slug !== listing.slug) permanentRedirect(`/opportunities/${listing.slug}`);
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
        ad={listing.status === "published" ? <AdSlot placement="job-detail" /> : null}
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
      icon
    />
  );
}

/** Holds the save control's place (a 48px square) and announces nothing: it is one small control, not a region. */
function SaveSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="min-h-[48px] w-12 shrink-0 self-stretch rounded-control border border-line bg-surface-pale skeleton-pulse"
    />
  );
}

/** Up to three other published listings in the category, as compact cards. Real listings only. */
async function Related({ listing }: { listing: OpportunityDetail }) {
  const params = new URLSearchParams({ category: listing.category.code, limit: "8" });
  const result = await listOpportunities(params);
  if (!result.ok) return null;
  const rows = result.data.data
    .filter((r) => r.slug !== listing.slug && r.status === "published")
    .slice(0, 3);
  if (!rows.length) return null;
  return (
    <section aria-labelledby="related-title" className="mt-6 md:mt-0">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 id="related-title" className="m-0 text-title font-strong text-ink">
          Related opportunities
        </h2>
        <Link
          href={`/opportunities?category=${listing.category.code}`}
          className="inline-flex items-center gap-1 text-ctl font-medium text-accent"
        >
          View all
          <Icon name="arrowRight" className="h-4 w-4" />
        </Link>
      </div>
      <ul className="m-0 grid list-none gap-2 p-0">
        {rows.map((row) => (
          <RelatedCard key={row.id} row={row} />
        ))}
      </ul>
    </section>
  );
}

function RelatedSkeleton() {
  return (
    <div aria-hidden="true" className="mt-8 skeleton-pulse md:mt-0">
      <SkeletonLine className="h-[22px] w-[240px]" />
      <SkeletonListingRows count={2} />
    </div>
  );
}
