import { notFound } from "next/navigation";
import { OpportunityEditor } from "@/components/staff/editor";
import { ListingAside } from "@/components/staff/listing-aside";
import { PageHeader, StatusBadge } from "@/components/staff/primitives";
import { first, getReference, requireStaff, staffGet } from "@/lib/staff";
import type { OpportunityDetail } from "@/lib/staff-types";

export const metadata = { title: "Opportunity" };

export default async function OpportunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const session = await requireStaff();
  const [result, reference] = await Promise.all([
    staffGet<OpportunityDetail>(`opportunities/${id}`),
    getReference(),
  ]);
  if (!result.ok || !reference) notFound();
  const detail = result.data;
  const editable = detail.actions.includes("edit");
  return (
    <>
      <PageHeader
        title={detail.content.title || "Untitled draft"}
        lead={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge status={detail.status} />
            {editable ? "Editing your draft." : "Read-only view of the current revision."}
          </span>
        }
      />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <OpportunityEditor
          key={`${detail.id}-${detail.version.id}`}
          reference={reference}
          permissions={session.permissions}
          initial={detail}
          initialOrganisation={{ ...detail.organisation }}
          autoPublish={first(query.publish) === "1" && detail.actions.includes("publish_direct")}
        />
        <ListingAside detail={detail} />
      </div>
    </>
  );
}
