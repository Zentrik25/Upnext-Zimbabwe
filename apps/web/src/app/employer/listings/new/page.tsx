import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OpportunityForm } from "@/components/employer/opportunity-form";
import { Callout } from "@/components/ui";
import { listLocations, listSectors } from "@/lib/catalog";
import { getEmployerContext } from "@/lib/employer-context";
import { authedJson } from "@/lib/session";
import type { StaffCategory } from "@/lib/staff-types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Create Opportunity", robots: { index: false } };

export default async function NewListingPage() {
  const context = await getEmployerContext();
  if (!context) redirect("/sign-in?next=%2Femployer%2Flistings%2Fnew");
  // The organisation is the one the member is working for, taken from their own memberships (never from the URL).
  if (context === "unreachable" || !context.active) redirect("/employer");
  const { active } = context;
  if (!active.verified)
    return (
      <Callout role="status">
        The verification of {active.name} was withdrawn, so you cannot create new opportunities. Contact
        UPNEXT if you think this is a mistake.
      </Callout>
    );
  const [categories, locations, sectors] = await Promise.all([
    authedJson<{ data: StaffCategory[] }>("employer/categories"),
    listLocations(),
    listSectors(),
  ]);
  if (!categories.ok) throw new Error("Categories could not be loaded.");
  return (
    <OpportunityForm
      organisation={{ id: active.id, name: active.name }}
      categories={categories.data.data}
      locations={locations}
      sectors={sectors.map((s) => ({ id: s.id, name: s.name }))}
    />
  );
}
