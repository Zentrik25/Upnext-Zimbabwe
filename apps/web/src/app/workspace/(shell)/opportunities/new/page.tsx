import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NewDraftForm } from "@/components/workspace/new-draft-form";
import { can, requireStaff, staffJson } from "@/lib/staff";
import type { StaffCategory } from "@/lib/staff-types";

export const metadata: Metadata = { title: "Create opportunity" };

export default async function NewOpportunityPage() {
  const session = await requireStaff("/workspace/opportunities/new");
  if (!can(session, "opp.draft.create")) redirect("/workspace/opportunities");
  const categories = await staffJson<{ data: StaffCategory[] }>("categories");
  if (!categories.ok) throw new Error("Categories could not be loaded.");
  return (
    <>
      <p className="m-0 text-ctl">
        <Link href="/workspace/opportunities" className="text-accent underline">
          ← Opportunities
        </Link>
      </p>
      <h1 className="m-0 mt-3 mb-2 text-section font-light tracking-section">Create opportunity</h1>
      <p className="m-0 mb-5 max-w-[60ch] text-base text-muted">
        Choose the category and the issuing organisation, then add the details and the sources. A draft is
        private to you until you submit it, and a different person reviews it before it is public.
      </p>
      <NewDraftForm categories={categories.data.data} />
    </>
  );
}
