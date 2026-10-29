import { notFound } from "next/navigation";
import { ClaimDecision } from "@/components/staff/claim-decision";
import { OpportunityTable } from "@/components/staff/opportunity-table";
import { Card, EmptyNote, Facts, PageHeader, SectionTitle } from "@/components/staff/primitives";
import { can, requireStaff, staffGet } from "@/lib/staff";
import { formatDate } from "@/lib/staff-format";
import type { ClaimRow, OpportunityRow, Paged } from "@/lib/staff-types";

export const metadata = { title: "Employer Submissions" };

export default async function SubmissionsPage() {
  const session = await requireStaff();
  const mayClaims = can(session, "employer.review");
  if (!mayClaims && !can(session, "opp.review.approve")) notFound();
  const [listings, claims] = await Promise.all([
    staffGet<Paged<OpportunityRow>>("opportunities?view=employer&sort=updated&dir=asc&page_size=50"),
    mayClaims ? staffGet<Paged<ClaimRow>>("claims?status=pending") : Promise.resolve(null),
  ]);
  return (
    <>
      <PageHeader
        title="Employer Submissions"
        lead="Listings written by verified employers, and organisation claims waiting for a decision. Employer listings are never published directly: an independent reviewer approves the exact revision."
      />
      <section aria-labelledby="listings" className="mb-8">
        <SectionTitle id="listings">Listings awaiting moderation</SectionTitle>
        {listings.ok && listings.data.data.length ? (
          <OpportunityTable
            rows={listings.data.data}
            sort="updated"
            dir="asc"
            hrefFor={() => "/staff/submissions"}
            caption="Employer listings awaiting moderation"
          />
        ) : (
          <EmptyNote>
            {listings.ok ? "No employer listing is waiting." : "The list could not be loaded."}
          </EmptyNote>
        )}
      </section>
      {claims ? (
        <section aria-labelledby="claims">
          <SectionTitle id="claims">Organisation claims</SectionTitle>
          {claims.ok && claims.data.data.length ? (
            <div className="grid gap-4">
              {claims.data.data.map((claim) => (
                <Card key={claim.id}>
                  <h3 className="mb-3 text-lead tracking-title">{claim.organisation_name}</h3>
                  <Facts
                    items={[
                      { label: "Claimant", value: `${claim.claimant.name} (${claim.role_title})` },
                      { label: "Submitted", value: formatDate(claim.created_at) },
                      { label: "Website", value: claim.website_url ?? "-" },
                      { label: "Registration number", value: claim.registration_number ?? "-" },
                      { label: "Evidence", value: claim.evidence_note },
                      {
                        label: "Existing organisation",
                        value: claim.organisation_id
                          ? claim.already_verified
                            ? "Linked, already verified"
                            : "Linked, not yet verified"
                          : "None linked: a new record is created on approval",
                      },
                    ]}
                  />
                  <ClaimDecision claim={claim} />
                </Card>
              ))}
            </div>
          ) : (
            <EmptyNote>
              {claims.ok ? "No organisation claim is waiting." : "The claims could not be loaded."}
            </EmptyNote>
          )}
        </section>
      ) : null}
    </>
  );
}
