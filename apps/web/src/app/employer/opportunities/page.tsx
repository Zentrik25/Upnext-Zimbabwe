import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ListingTable } from "@/components/employer/listing-table";
import { ButtonLink, EmptyState } from "@/components/ui";
import { getEmployerContext } from "@/lib/employer-context";
import type { ListingPage } from "@/lib/employer-types";
import { authedJson } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Opportunities", robots: { index: false } };

const FILTERS = [
  ["all", "All"],
  ["active", "Active"],
  ["draft", "Drafts"],
  ["review", "In review"],
  ["changes", "Changes requested"],
  ["expired", "Expired"],
  ["withdrawn", "Withdrawn"],
] as const;
const VALID = new Set<string>(FILTERS.map(([value]) => value));
const SIZE = 10;

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

export default async function OpportunitiesPage({ searchParams }: Props) {
  const query = await searchParams;
  const context = await getEmployerContext();
  if (!context) redirect("/sign-in?next=%2Femployer%2Fopportunities");
  if (context === "unreachable" || !context.active) redirect("/employer");
  const { active } = context;
  const status = VALID.has(one(query.status)) ? one(query.status) : "all";
  const q = one(query.q).trim().slice(0, 80);
  const page = Math.max(1, Number.parseInt(one(query.page), 10) || 1);
  const params = new URLSearchParams({ status, page: String(page), page_size: String(SIZE) });
  if (q) params.set("q", q);
  const result = await authedJson<ListingPage>(`employer/organisations/${active.id}/listings?${params}`);

  const link = (over: Record<string, string>) => {
    const next = new URLSearchParams();
    if (status !== "all") next.set("status", status);
    if (q) next.set("q", q);
    for (const [key, value] of Object.entries(over)) {
      if (value && !(key === "status" && value === "all") && !(key === "page" && value === "1"))
        next.set(key, value);
      else next.delete(key);
    }
    const text = next.toString();
    return `/employer/opportunities${text ? `?${text}` : ""}`;
  };

  return (
    <div className="grid gap-4 [&>*]:min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form method="get" role="search" className="flex flex-wrap items-center gap-2">
          {status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
          <label htmlFor="q" className="sr-only">
            Search your opportunities by title
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            maxLength={80}
            placeholder="Search by title"
            className="min-h-[40px] w-[min(280px,70vw)] rounded-control border border-control-border bg-surface px-3 text-ctl text-ink"
          />
          <button
            type="submit"
            className="inline-flex min-h-[40px] cursor-pointer items-center rounded-control border border-control-border bg-surface px-4 text-ctl text-ink hover:bg-row-hover"
          >
            Search
          </button>
        </form>
        {active.verified ? (
          <ButtonLink href="/employer/listings/new">
            <span aria-hidden="true">+</span>&nbsp;Create Opportunity
          </ButtonLink>
        ) : null}
      </div>
      <nav aria-label="Filter by status">
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {FILTERS.map(([value, label]) => (
            <li key={value}>
              <Link
                href={link({ status: value, page: "1" })}
                aria-current={status === value ? "page" : undefined}
                className={`inline-flex min-h-[36px] items-center rounded-control border px-3 text-ctl ${
                  status === value
                    ? "border-accent-solid bg-accent-solid text-on-accent"
                    : "border-control-border bg-surface text-ink hover:bg-row-hover"
                }`}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {result.ok ? (
        <>
          <p className="m-0 text-ctl text-muted" role="status">
            {result.data.page.total === 0
              ? "No opportunities match."
              : `${result.data.page.total} ${result.data.page.total === 1 ? "opportunity" : "opportunities"}${q ? ` matching “${q}”` : ""}.`}
          </p>
          <ListingTable
            rows={result.data.data}
            empty={
              q || status !== "all"
                ? "Nothing matches this search and filter."
                : "You have no opportunities yet. Create your first one to get started."
            }
          />
          {result.data.page.pages > 1 ? (
            <nav aria-label="Pages" className="flex items-center justify-between gap-3">
              {page > 1 ? (
                <Link href={link({ page: String(page - 1) })} rel="prev" className="text-ctl text-accent">
                  ← Previous
                </Link>
              ) : (
                <span />
              )}
              <span className="text-ctl text-muted">
                Page {result.data.page.page} of {result.data.page.pages}
              </span>
              {page < result.data.page.pages ? (
                <Link href={link({ page: String(page + 1) })} rel="next" className="text-ctl text-accent">
                  Next →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      ) : (
        <EmptyState as="h2" title="Your opportunities are unavailable">
          The list could not be loaded. Try again shortly.
        </EmptyState>
      )}
    </div>
  );
}
