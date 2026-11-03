import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ListingActions } from "@/components/employer/listing-actions";
import { ListingForm } from "@/components/employer/listing-form";
import { EmployerHeading, StatusTag } from "@/components/employer/parts";
import { Container } from "@/components/layout";
import { Callout } from "@/components/ui";
import { listLocations } from "@/lib/catalog";
import type { EmployerListingDetail } from "@/lib/employer-types";
import { authedJson, getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your listing", robots: { index: false } };

type Props = { params: Promise<{ id: string }> };

const WHAT_NEXT: Record<string, string> = {
  in_review: "Waiting for an editor. You cannot change this version while it is in review.",
  approved: "An editor approved this version. It will be published shortly.",
  published:
    "Public. To change it, start an amendment; the public keeps seeing this version until the change is approved.",
  expired: "Closed. It stays readable so shared links keep working.",
  withdrawn: "Withdrawn. It stays readable so shared links keep working.",
};

export default async function EmployerListingPage({ params }: Props) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/employer/listings/${id}`)}`);
  const result = await authedJson<EmployerListingDetail>(`employer/listings/${encodeURIComponent(id)}`);
  if (!result.ok) {
    if (result.status === 404) notFound();
    return (
      <Container className="py-10" role="alert">
        The listing could not be loaded. Try again shortly.
      </Container>
    );
  }
  const listing = result.data;
  const editable = listing.next_actions.includes("edit");
  const locations = editable ? await listLocations() : [];
  return (
    <Container className="pt-6 pb-[65px]">
      <p className="text-ctl">
        <Link href="/employer" className="text-accent underline">
          ← Employer dashboard
        </Link>
      </p>
      <div className="mt-3">
        <EmployerHeading title={listing.content.title || "Untitled draft"}>
          <StatusTag status={listing.status} />
        </EmployerHeading>
      </div>
      <p className="mt-1 text-base text-muted">
        {listing.organisation.name} · {listing.category.name} · version {listing.version_no}
      </p>
      {listing.decision ? (
        <div role="status" className="mt-4 border border-urgent p-3 text-base" data-testid="decision">
          <strong>An editor sent this back.</strong> Reason: {listing.decision.reason}
        </div>
      ) : null}
      {!editable ? (
        <Callout className="mt-4" data-testid="listing-readonly">
          <p className="text-base">{WHAT_NEXT[listing.status] ?? WHAT_NEXT[listing.version_state] ?? ""}</p>
          {listing.public_path && listing.status === "published" ? (
            <p className="mt-2 text-base">
              <Link href={listing.public_path} className="text-accent underline">
                View the public listing
              </Link>
            </p>
          ) : null}
        </Callout>
      ) : null}
      <div className="mt-4">
        <ListingActions listing={listing} />
      </div>
      {editable ? (
        <div className="mt-5 max-w-[640px]">
          <ListingForm
            organisationId={listing.organisation.id}
            locations={locations.map((l) => ({ id: l.id, name: l.name }))}
            listing={listing}
          />
        </div>
      ) : (
        <dl className="mt-5 grid max-w-[720px] gap-2 text-base">
          <div>
            <dt className="text-small text-muted">Summary</dt>
            <dd className="ml-0">{listing.content.summary}</dd>
          </div>
          <div>
            <dt className="text-small text-muted">Description</dt>
            <dd className="ml-0 whitespace-pre-line">{listing.content.description_md}</dd>
          </div>
        </dl>
      )}
    </Container>
  );
}
