import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JobView } from "@/components/opportunities/job-view";
import type { OpportunityDetail } from "@/lib/catalog-types";
import { requireStaff, staffJson } from "@/lib/staff";
import type { ListingDetail } from "@/lib/staff-types";

export const metadata: Metadata = { title: "Preview", robots: { index: false } };
type Props = { params: Promise<{ id: string }> };

/** The draft as the public will read it: the same page component, fed by the staff-only preview endpoint. */
export default async function PreviewPage({ params }: Props) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  await requireStaff(`/workspace/opportunities/${id}/preview`);
  const [preview, listing] = await Promise.all([
    staffJson<OpportunityDetail>(`opportunities/${id}/preview`),
    staffJson<ListingDetail>(`opportunities/${id}`),
  ]);
  if (!preview.ok) {
    if (preview.status === 404) notFound();
    throw new Error("The preview could not be loaded.");
  }
  const canEdit = listing.ok && listing.data.can_edit;
  return (
    <>
      <div
        role="status"
        data-testid="preview-banner"
        className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-card border border-border-notice bg-surface-notice px-3 py-2 text-ctl"
      >
        <span>
          <strong>Preview.</strong> Only staff can see this. It shows the page as it will read once published;
          saving, sharing and reporting are switched off.
        </span>
        <span className="flex gap-3">
          {canEdit ? (
            <Link href={`/workspace/opportunities/${id}/edit`} className="text-accent underline">
              Back to the editor
            </Link>
          ) : null}
          <Link href={`/workspace/opportunities/${id}`} className="text-accent underline">
            Listing and history
          </Link>
        </span>
      </div>
      <JobView listing={preview.data} preview />
    </>
  );
}
