import { notFound } from "next/navigation";
import { OpportunityEditor } from "@/components/staff/editor";
import { PageHeader } from "@/components/staff/primitives";
import { can, getReference, requireStaff } from "@/lib/staff";

export const metadata = { title: "Create Opportunity" };

export default async function NewOpportunityPage() {
  const session = await requireStaff();
  if (!can(session, "opp.draft.create")) notFound();
  const reference = await getReference();
  if (!reference) {
    return (
      <PageHeader
        title="Create Opportunity"
        lead="The reference data could not be loaded. Reload the page."
      />
    );
  }
  return (
    <>
      <PageHeader
        title="Create Opportunity"
        lead="Fill in what the issuer published. Save as a draft at any time, or publish directly when everything is complete."
      />
      <OpportunityEditor reference={reference} permissions={session.permissions} />
    </>
  );
}
