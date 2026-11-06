import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { JobView } from "@/components/opportunities/job-view";
import type { OpportunityDetail } from "@/lib/catalog-types";
import { getEmployerContext } from "@/lib/employer-context";
import { authedJson } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Preview", robots: { index: false } };
type Props = { params: Promise<{ id: string }> };

/** The revision as the public will read it: the public page component fed by the member-only preview endpoint. */
export default async function EmployerPreviewPage({ params }: Props) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const context = await getEmployerContext();
  if (!context) redirect(`/sign-in?next=${encodeURIComponent(`/employer/listings/${id}/preview`)}`);
  const preview = await authedJson<OpportunityDetail>(`employer/listings/${id}/preview`);
  if (!preview.ok) {
    if (preview.status === 404) notFound();
    throw new Error("The preview could not be loaded.");
  }
  return (
    <>
      <div
        role="status"
        data-testid="preview-banner"
        className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-card border border-border-notice bg-surface-notice px-3 py-2 text-ctl"
      >
        <span>
          <strong>Preview.</strong> Only you and the members of your organisation can see this. It shows the
          page as it will read once an editor publishes it; saving, sharing and reporting are switched off.
        </span>
        <Link href={`/employer/listings/${id}`} className="text-accent underline">
          Back to the listing
        </Link>
      </div>
      <JobView listing={preview.data} preview />
    </>
  );
}
