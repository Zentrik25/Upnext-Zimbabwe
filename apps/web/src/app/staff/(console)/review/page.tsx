import Link from "next/link";
import { EmptyNote, PageHeader, SectionTitle } from "@/components/staff/primitives";
import { OpportunityTable } from "@/components/staff/opportunity-table";
import { requireStaff, staffGet } from "@/lib/staff";
import type { OpportunityRow, Paged } from "@/lib/staff-types";
import { notFound } from "next/navigation";
import { can } from "@/lib/staff";

export const metadata = { title: "Editorial Review Queue" };

export default async function ReviewQueuePage() {
  const session = await requireStaff();
  if (!can(session, "opp.review.approve")) notFound();
  const [review, ready] = await Promise.all([
    staffGet<Paged<OpportunityRow>>("opportunities?view=review&sort=updated&dir=asc&page_size=50"),
    staffGet<Paged<OpportunityRow>>("opportunities?view=ready&sort=updated&dir=asc&page_size=50"),
  ]);
  const hrefFor = () => "/staff/review";
  // A reviewer never sees "Approve" on work they wrote or submitted: the service decides, the list only mirrors it.
  const mineExcluded = (rows: OpportunityRow[]) => rows;
  return (
    <>
      <PageHeader
        title="Editorial Review Queue"
        lead="Revisions waiting for an independent decision. You cannot approve, reject or verify work you wrote or submitted; those rows open read-only."
      />
      <section aria-labelledby="in-review" className="mb-8">
        <SectionTitle id="in-review">Awaiting review</SectionTitle>
        {review.ok && review.data.data.length ? (
          <OpportunityTable
            rows={mineExcluded(review.data.data)}
            sort="updated"
            dir="asc"
            hrefFor={hrefFor}
            caption="Revisions awaiting review"
          />
        ) : (
          <EmptyNote>
            {review.ok ? "Nothing is waiting for review." : "The queue could not be loaded."}
          </EmptyNote>
        )}
      </section>
      <section aria-labelledby="ready">
        <SectionTitle id="ready">Approved, ready to publish</SectionTitle>
        {ready.ok && ready.data.data.length ? (
          <OpportunityTable
            rows={ready.data.data}
            sort="updated"
            dir="asc"
            hrefFor={hrefFor}
            caption="Approved revisions ready to publish"
          />
        ) : (
          <EmptyNote>
            {ready.ok ? "No approved revision is waiting to be published." : "The list could not be loaded."}
          </EmptyNote>
        )}
      </section>
      <p className="mt-6 text-small text-muted">
        Looking for everything?{" "}
        <Link href="/staff/opportunities" className="text-accent underline">
          All Opportunities
        </Link>
      </p>
    </>
  );
}
