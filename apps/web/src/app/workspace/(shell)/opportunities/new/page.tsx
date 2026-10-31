import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { JobEditor } from "@/components/workspace/job-editor";
import { listLocations, listSectors } from "@/lib/catalog";
import { can, currentTime, requireStaff, staffJson } from "@/lib/staff";
import type { StaffCategory } from "@/lib/staff-types";

export const metadata: Metadata = { title: "Create opportunity" };

/** Today's date in Harare (UTC+2 all year): the day a new source is checked. */
const harareToday = () => new Date(currentTime() + 2 * 3600 * 1000).toISOString().slice(0, 10);

export default async function NewOpportunityPage() {
  const session = await requireStaff("/workspace/opportunities/new");
  if (!can(session, "opp.draft.create")) redirect("/workspace/opportunities");
  const [categories, locations, sectors] = await Promise.all([
    staffJson<{ data: StaffCategory[] }>("categories"),
    listLocations(),
    listSectors(),
  ]);
  if (!categories.ok) throw new Error("Categories could not be loaded.");
  return (
    <>
      <p className="m-0 text-ctl">
        <Link href="/workspace/opportunities" className="text-accent underline">
          ← Opportunities
        </Link>
      </p>
      <h1 className="m-0 mt-3 mb-1 text-title font-light tracking-title">New opportunity</h1>
      <p className="m-0 mb-4 max-w-[60ch] text-base text-muted">
        Only what the source states. A draft is private to you until it is published or reviewed.
      </p>
      <JobEditor
        mode="new"
        categories={categories.data.data}
        locations={locations}
        sectors={sectors.map((s) => ({ id: s.id, name: s.name }))}
        canCreateOrganisation={can(session, "org.create")}
        today={harareToday()}
      />
    </>
  );
}
