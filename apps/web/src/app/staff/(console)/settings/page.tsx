import { notFound } from "next/navigation";
import { Card, Facts, PageHeader, SectionTitle } from "@/components/staff/primitives";
import { Tag } from "@/components/ui";
import { can, requireStaff, staffGet } from "@/lib/staff";
import type { StaffSettings } from "@/lib/staff-types";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await requireStaff();
  if (!can(session, "settings.manage")) notFound();
  const result = await staffGet<StaffSettings>("settings");
  if (!result.ok) {
    return <PageHeader title="Settings" lead="The settings could not be loaded." />;
  }
  const s = result.data;
  return (
    <>
      <PageHeader
        title="Settings"
        lead="How this installation is configured. These values come from the server's environment and are read-only here: changing them is a deployment decision, not an editorial one."
      />
      <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
        <Card>
          <SectionTitle>Security</SectionTitle>
          <Facts
            items={[
              {
                label: "Two-step verification",
                value: (
                  <Tag tone={s.security.staff_two_step_required ? "good" : "urgent"}>
                    {s.security.staff_two_step_required ? "Required for all staff" : "Not required"}
                  </Tag>
                ),
              },
              { label: "Idle sign-out", value: `${s.security.staff_idle_minutes} minutes` },
              { label: "Absolute session limit", value: `${s.security.staff_session_hours} hours` },
            ]}
          />
        </Card>
        <Card>
          <SectionTitle>E-mail</SectionTitle>
          <Facts
            items={[
              { label: "Provider", value: s.email.provider },
              {
                label: "Delivery verified",
                value: (
                  <Tag tone={s.email.delivery_verified ? "good" : "urgent"}>
                    {s.email.delivery_verified ? "Yes" : "No: alerts and change of e-mail stay off"}
                  </Tag>
                ),
              },
            ]}
          />
        </Card>
        <Card>
          <SectionTitle>Reference data</SectionTitle>
          <Facts
            items={[
              { label: "Categories", value: s.taxonomies.categories },
              { label: "Locations", value: s.taxonomies.locations },
              { label: "Sectors", value: s.taxonomies.sectors },
            ]}
          />
          {can(session, "taxonomy.manage") ? (
            <p className="mt-4 text-small text-muted">
              Locations, sectors and categories are maintained in the administrator tool at{" "}
              <a href="/django-admin/" className="text-accent underline">
                /django-admin/
              </a>
              , which stays available to administrators for reference data only.
            </p>
          ) : null}
        </Card>
        <Card>
          <SectionTitle>Content</SectionTitle>
          <Facts
            items={[
              { label: "Listings", value: s.totals.listings },
              { label: "Published", value: s.totals.published },
              { label: "Brand", value: `${s.brand.name} (${s.brand.short})` },
            ]}
          />
        </Card>
      </div>
    </>
  );
}
