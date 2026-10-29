import Link from "next/link";
import { notFound } from "next/navigation";
import { OrganisationForm } from "@/components/staff/org-forms";
import { Card, Facts, PageHeader } from "@/components/staff/primitives";
import { Tag } from "@/components/ui";
import { can, requireStaff, staffGet } from "@/lib/staff";
import { formatDate, words } from "@/lib/staff-format";
import type { OrganisationRow } from "@/lib/staff-types";

export const metadata = { title: "Organisation" };

export default async function OrganisationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireStaff();
  const result = await staffGet<OrganisationRow>(`organisations/${id}`);
  if (!result.ok) notFound();
  const org = result.data;
  return (
    <>
      <PageHeader
        title={org.name}
        lead={
          <Link href="/staff/organisations" className="text-accent underline">
            All organisations
          </Link>
        }
      />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <h2 className="mb-4 text-lead tracking-title">Details</h2>
          <OrganisationForm organisation={org} canEdit={can(session, "org.edit")} />
        </Card>
        <Card>
          <h2 className="mb-3 text-lead tracking-title">Verification</h2>
          <p className="mb-3">
            <Tag tone={org.verified ? "good" : "default"}>
              {org.verified ? "Verified employer" : "Entered by staff"}
            </Tag>
          </p>
          <Facts
            items={[
              ...(org.verification
                ? [
                    { label: "Method", value: words(org.verification.method) },
                    { label: "Verified", value: formatDate(org.verification.verified_at) },
                  ]
                : [
                    {
                      label: "Status",
                      value: "Not verified. Only an approved employer claim verifies an organisation.",
                    },
                  ]),
              { label: "Listings", value: org.listings },
              { label: "Added", value: formatDate(org.created_at) },
            ]}
          />
          <p className="mt-4 text-ctl">
            <Link href={`/staff/opportunities?organisation=${org.id}`} className="text-accent underline">
              Opportunities from this organisation
            </Link>
          </p>
        </Card>
      </div>
    </>
  );
}
