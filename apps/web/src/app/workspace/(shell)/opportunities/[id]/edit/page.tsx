import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { JobEditor } from "@/components/workspace/job-editor";
import { listLocations, listSectors } from "@/lib/catalog";
import { can, currentTime, requireStaff, staffJson } from "@/lib/staff";
import type { ListingDetail, StaffCategory } from "@/lib/staff-types";

export const metadata: Metadata = { title: "Edit draft" };
type Props = { params: Promise<{ id: string }> };

const harareToday = () => new Date(currentTime() + 2 * 3600 * 1000).toISOString().slice(0, 10);

export default async function EditPage({ params }: Props) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const session = await requireStaff(`/workspace/opportunities/${id}/edit`);
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
  if (!categories.data.data.some((c) => c.code === listing.category.code)) notFound();
  return (
    <>
      <p className="m-0 text-ctl">
        <Link href={`/workspace/opportunities/${id}`} className="text-accent underline">
          ← Back to the listing
        </Link>
      </p>
      <h1 className="m-0 mt-3 mb-1 text-title font-light tracking-title">Edit draft</h1>
      <p className="m-0 mb-4 max-w-[60ch] text-base text-muted">
        Changes save as you go. Publish or submit when it is ready.
      </p>
      <JobEditor
        key={listing.id}
        mode="edit"
        categories={categories.data.data}
        listing={listing}
        locations={locations}
        sectors={sectors.map((s) => ({ id: s.id, name: s.name }))}
        canCreateOrganisation={can(session, "org.create")}
        today={harareToday()}
      />
    </>
  );
}
