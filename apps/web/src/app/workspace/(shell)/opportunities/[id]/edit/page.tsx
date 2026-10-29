import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DraftEditor } from "@/components/workspace/draft-editor";
import { EmptyState } from "@/components/ui";
import { listLocations, listSectors } from "@/lib/catalog";
import { requireStaff, staffJson } from "@/lib/staff";
import type { ListingDetail, StaffCategory } from "@/lib/staff-types";

export const metadata: Metadata = { title: "Edit draft" };
type Props = { params: Promise<{ id: string }> };

export default async function EditPage({ params }: Props) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  await requireStaff(`/workspace/opportunities/${id}/edit`);
  const [detail, categories, locations, sectors] = await Promise.all([
    staffJson<ListingDetail>(`opportunities/${id}`),
    staffJson<{ data: StaffCategory[] }>("categories"),
    listLocations(),
    listSectors(),
  ]);
  if (!detail.ok) {
    if (detail.status === 404) notFound();
    throw new Error("The draft could not be loaded.");
  }
  if (!categories.ok) throw new Error("Categories could not be loaded.");
  const listing = detail.data;
  if (!listing.can_edit) redirect(`/workspace/opportunities/${id}`);
  const category = categories.data.data.find((c) => c.code === listing.category.code);
  if (!category) notFound();
  return (
    <>
      <p className="m-0 text-ctl">
        <Link href={`/workspace/opportunities/${id}`} className="text-accent underline">
          ← Back to the listing
        </Link>
      </p>
      <h1 className="m-0 mt-3 mb-1 text-section font-light tracking-section">Edit draft</h1>
      <p className="m-0 mb-5 text-base text-muted">
        {listing.category.name}. Save as often as you like; submit for review from the listing page when it is
        ready.
      </p>
      <DraftEditor
        key={listing.row_version}
        listing={listing}
        category={category}
        locations={locations.map((l) => ({ id: l.id, name: l.name }))}
        sectors={sectors.map((s) => ({ id: s.id, name: s.name }))}
      />
      {!locations.length ? (
        <EmptyState as="h2" title="Locations could not be loaded">
          You can still save the draft without a primary location.
        </EmptyState>
      ) : null}
    </>
  );
}
