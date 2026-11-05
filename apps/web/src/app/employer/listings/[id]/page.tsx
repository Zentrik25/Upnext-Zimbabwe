import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ListingActions } from "@/components/employer/listing-actions";
import { OpportunityForm } from "@/components/employer/opportunity-form";
import { StatusTag } from "@/components/employer/parts";
import { Callout } from "@/components/ui";
import { listLocations, listSectors } from "@/lib/catalog";
import { getEmployerContext } from "@/lib/employer-context";
import type { EmployerListingDetail } from "@/lib/employer-types";
import { authedJson } from "@/lib/session";
import type { StaffCategory } from "@/lib/staff-types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Opportunity", robots: { index: false } };

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
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const context = await getEmployerContext();
  if (!context) redirect(`/sign-in?next=${encodeURIComponent(`/employer/listings/${id}`)}`);
  const result = await authedJson<EmployerListingDetail>(`employer/listings/${encodeURIComponent(id)}`);
  if (!result.ok) {
    if (result.status === 404) notFound(); // someone else's listing is indistinguishable from a missing one
    return (
      <div role="alert" className="py-10">
        The listing could not be loaded. Try again shortly.
      </div>
    );
  }
  const listing = result.data;
  const editable = listing.next_actions.includes("edit");
  const [categories, locations, sectors] = editable
    ? await Promise.all([
        authedJson<{ data: StaffCategory[] }>("employer/categories"),
        listLocations(),
        listSectors(),
      ])
    : [null, [], []];
  return (
    <div className="grid gap-4 [&>*]:min-w-0">
      <p className="m-0 text-ctl">
        <Link href="/employer/opportunities" className="text-accent underline">
          ← Opportunities
        </Link>
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="m-0 text-title font-strong tracking-title">
          {listing.content.title || "Untitled draft"}
        </h2>
        <StatusTag status={listing.status} />
        <Link href={`/employer/listings/${listing.id}/preview`} className="text-ctl text-accent underline">
          Preview
        </Link>
      </div>
      <p className="m-0 -mt-2 text-base text-muted">
        {listing.organisation.name} · {listing.category.name} · version {listing.version_no}
      </p>
      {listing.decision ? (
        <div role="status" className="border border-urgent p-3 text-base" data-testid="decision">
          <strong>An editor sent this back.</strong> Reason: {listing.decision.reason}
        </div>
      ) : null}
      {!editable ? (
        <Callout data-testid="listing-readonly">
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
      <ListingActions listing={listing} />
      {editable && categories?.ok ? (
        <OpportunityForm
          organisation={listing.organisation}
          categories={categories.data.data}
          locations={locations}
          sectors={sectors.map((s) => ({ id: s.id, name: s.name }))}
          listing={listing}
        />
      ) : (
        <dl className="m-0 grid max-w-[720px] gap-2 text-base">
          <div>
            <dt className="text-small text-muted">Overview</dt>
            <dd className="ml-0">{listing.content.summary || "Not stated"}</dd>
          </div>
          <div>
            <dt className="text-small text-muted">Key responsibilities</dt>
            <dd className="ml-0 whitespace-pre-line">{listing.content.description_md}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
