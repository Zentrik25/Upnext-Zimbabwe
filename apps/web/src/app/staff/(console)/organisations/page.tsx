import Link from "next/link";
import { OrganisationForm } from "@/components/staff/org-forms";
import { Card, EmptyNote, PageHeader, Pagination, SectionTitle } from "@/components/staff/primitives";
import { Button, Select, TextInput, Tag } from "@/components/ui";
import { can, first, requireStaff, staffGet } from "@/lib/staff";
import { formatDate } from "@/lib/staff-format";
import type { OrganisationRow, Paged } from "@/lib/staff-types";

export const metadata = { title: "Organisations" };

export default async function OrganisationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const session = await requireStaff();
  const query = new URLSearchParams();
  for (const key of ["q", "origin", "page"]) if (first(params[key])) query.set(key, first(params[key]));
  const result = await staffGet<Paged<OrganisationRow>>(`organisations?${query.toString()}`);
  const hrefFor = (page: number) => {
    const next = new URLSearchParams(query);
    next.set("page", String(page));
    return `/staff/organisations?${next.toString()}`;
  };
  return (
    <>
      <PageHeader
        title="Organisations"
        lead="Issuers of opportunities. “Verified employer” means staff approved an employer claim for it; an organisation typed in by staff is never verified."
      />
      <form
        action="/staff/organisations"
        method="get"
        role="search"
        aria-label="Filter organisations"
        className="mb-4 grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] items-end gap-3 max-md:grid-cols-1"
      >
        <div className="grid gap-[5px]">
          <label htmlFor="o-q" className="text-ctl font-medium text-check-text">
            Search
          </label>
          <TextInput id="o-q" name="q" defaultValue={first(params.q)} maxLength={100} />
        </div>
        <div className="grid gap-[5px]">
          <label htmlFor="o-origin" className="text-ctl font-medium text-check-text">
            Origin
          </label>
          <Select id="o-origin" name="origin" defaultValue={first(params.origin)}>
            <option value="">All</option>
            <option value="verified_employer">Verified employers</option>
            <option value="entered_by_staff">Entered by staff</option>
          </Select>
        </div>
        <Button type="submit">Apply</Button>
      </form>

      {!result.ok ? (
        <EmptyNote>The organisations could not be loaded.</EmptyNote>
      ) : result.data.data.length === 0 ? (
        <EmptyNote>No organisation matches.</EmptyNote>
      ) : (
        <>
          <div className="relative overflow-x-auto rounded-card border border-border-panel bg-(--staff-card) shadow-subtle">
            <table className="w-full min-w-[720px] border-collapse text-ctl">
              <caption className="sr-only">Organisations</caption>
              <thead className="border-b border-line bg-(--staff-canvas)">
                <tr>
                  {["Name", "Origin", "Listings", "Added"].map((h) => (
                    <th key={h} scope="col" className="px-3 py-2 text-left text-small font-medium text-muted">
                      {h}
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2 text-right text-small font-medium text-muted">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {result.data.data.map((org) => (
                  <tr key={org.id} className="hover:bg-row-hover">
                    <td className="px-3 py-3">
                      <Link
                        href={`/staff/organisations/${org.id}`}
                        className="font-medium text-ink underline decoration-line underline-offset-2 hover:decoration-accent"
                      >
                        {org.name}
                      </Link>
                      {org.website_url ? (
                        <span className="block max-w-[320px] truncate text-small text-muted">
                          {org.website_url}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <Tag tone={org.verified ? "good" : "default"}>
                        {org.verified ? "Verified employer" : "Entered by staff"}
                      </Tag>
                    </td>
                    <td className="tnum px-3 py-3">{org.listings}</td>
                    <td className="tnum px-3 py-3 text-muted">{formatDate(org.created_at)}</td>
                    <td className="px-3 py-3 text-right">
                      <Link
                        href={`/staff/organisations/${org.id}`}
                        className="inline-flex min-h-[32px] items-center rounded-control border border-border-strong px-2.5 text-small text-secondary-text hover:bg-accent/5"
                      >
                        {can(session, "org.edit") ? "Edit" : "Open"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={result.data.page} noun="organisations" hrefFor={hrefFor} />
        </>
      )}

      {can(session, "org.create") ? (
        <section aria-labelledby="new-org" className="mt-8">
          <SectionTitle id="new-org">Add an organisation</SectionTitle>
          <Card>
            <OrganisationForm />
            <p className="mt-3 text-small text-muted">
              A duplicate name is refused unless you confirm; added organisations carry the “Entered by staff”
              label until an employer claim is approved.
            </p>
          </Card>
        </section>
      ) : null}
    </>
  );
}
