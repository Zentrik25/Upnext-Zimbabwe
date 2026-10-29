import { EmptyNote, PageHeader, Pagination } from "@/components/staff/primitives";
import { ListFilters } from "@/components/staff/list-filters";
import { OpportunityTable, type SortKey } from "@/components/staff/opportunity-table";
import { ButtonLink } from "@/components/ui";
import { can, first, getReference, requireStaff, staffGet } from "@/lib/staff";
import type { OpportunityRow, Paged } from "@/lib/staff-types";

export const metadata = { title: "Opportunities" };

const TITLES: Record<string, [string, string]> = {
  all: ["All Opportunities", "Every listing you can see, newest changes first."],
  drafts: ["Drafts", "Revisions still being written, or sent back by a reviewer."],
  mine: ["My drafts", "Drafts and rejected revisions you wrote."],
  review: ["In review", "Revisions waiting for an independent reviewer."],
  ready: [
    "Approved, ready to publish",
    "Approved by another person; the author or any publisher may publish.",
  ],
  employer: ["Employer submissions", "Listings written by verified employers, awaiting moderation."],
  published: ["Published", "Live on the public site."],
  expired: ["Expired", "Closing date passed or marked expired; still reachable by address."],
  withdrawn: ["Withdrawn", "Removed from search by staff or the employer."],
  archived: ["Archived", "Closed records kept for the audit trail."],
};
const KEYS = ["view", "q", "category", "status", "organisation", "sort", "dir", "page"];

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const session = await requireStaff();
  const view = first(params.view) || "all";
  const sort = (first(params.sort) || "updated") as SortKey;
  const dir =
    first(params.dir) === "asc"
      ? "asc"
      : first(params.dir) === "desc"
        ? "desc"
        : sort === "updated" || sort === "closing"
          ? "desc"
          : "asc";
  const query = new URLSearchParams();
  for (const key of KEYS) {
    const value = first(params[key]);
    if (value) query.set(key, value);
  }
  const [result, reference] = await Promise.all([
    staffGet<Paged<OpportunityRow>>(`opportunities?${query.toString()}`),
    getReference(),
  ]);
  const [title, lead] = TITLES[view] ?? TITLES.all!;

  const hrefFor = (overrides: Record<string, string>) => {
    const next = new URLSearchParams(query);
    for (const [key, value] of Object.entries(overrides)) next.set(key, value);
    return `/staff/opportunities?${next.toString()}`;
  };

  return (
    <>
      <PageHeader
        title={title}
        lead={lead}
        actions={
          can(session, "opp.draft.create") ? (
            <ButtonLink href="/staff/opportunities/new">Create Opportunity</ButtonLink>
          ) : null
        }
      />
      <ListFilters
        action="/staff/opportunities"
        hidden={{
          ...(view !== "all" ? { view } : {}),
          ...(first(params.sort) ? { sort: first(params.sort) } : {}),
          ...(first(params.dir) ? { dir: first(params.dir) } : {}),
        }}
        q={first(params.q)}
        category={first(params.category)}
        status={first(params.status)}
        categories={reference?.categories ?? []}
        showStatus={view === "all"}
      />
      {!result.ok ? (
        <EmptyNote>
          {result.status === 400
            ? "Those filters are not valid. Clear them and try again."
            : "The list could not be loaded. Reload the page."}
        </EmptyNote>
      ) : result.data.data.length === 0 ? (
        <EmptyNote>
          Nothing matches.{" "}
          {query.toString() ? "Try clearing the filters." : "Create the first opportunity to get started."}
        </EmptyNote>
      ) : (
        <>
          <OpportunityTable
            rows={result.data.data}
            sort={sort}
            dir={dir}
            caption={`${title}: ${result.data.page.total} opportunities`}
            hrefFor={(key, direction) => hrefFor({ sort: key, dir: direction, page: "1" })}
          />
          <Pagination
            page={result.data.page}
            noun="opportunities"
            hrefFor={(page) => hrefFor({ page: String(page) })}
          />
        </>
      )}
    </>
  );
}
