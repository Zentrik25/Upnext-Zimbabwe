import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, EmptyState, TextInput } from "@/components/ui";
import { RecordTable } from "@/components/workspace/record-table";
import { requireStaff, staffJson } from "@/lib/staff";
import type { CatalogList } from "@/lib/staff-types";

export const metadata: Metadata = { title: "Reference data" };
type Props = { params: Promise<{ kind: string }>; searchParams: Promise<{ q?: string; page?: string }> };

export default async function ManagePage({ params, searchParams }: Props) {
  const { kind } = await params;
  if (!/^[a-z-]{1,40}$/.test(kind)) notFound();
  await requireStaff(`/workspace/manage/${kind}`);
  const { q = "", page: p } = await searchParams;
  const query = new URLSearchParams();
  if (q) query.set("q", q);
  if (p && /^\d{1,4}$/.test(p)) query.set("page", p);
  const result = await staffJson<CatalogList>(`catalog/${kind}?${query.toString()}`);
  if (!result.ok) {
    if (result.status === 404) notFound();
    throw new Error("The list could not be loaded.");
  }
  const { kind: k, columns, data, page, can_add: canAdd } = result.data;
  const pageHref = (n: number) =>
    `/workspace/manage/${kind}?${new URLSearchParams({ ...(q ? { q } : {}), page: String(n) }).toString()}`;
  return (
    <>
      <div className="mb-1 flex flex-wrap items-end justify-between gap-3">
        <h1 className="m-0 text-section font-light tracking-section">{k.label}</h1>
        {canAdd ? (
          <Link
            href={`/workspace/manage/${kind}/new`}
            className="inline-flex min-h-[40px] items-center rounded-control bg-accent-solid px-4 py-2 text-ctl text-on-accent hover:bg-accent-solid-hover"
          >
            Add
          </Link>
        ) : null}
      </div>
      <p className="m-0 mb-4 max-w-[70ch] text-base text-muted">{k.description}</p>
      <form
        method="get"
        role="search"
        aria-label={`Search ${k.label}`}
        className="mb-4 flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface-pale p-3"
      >
        <div className="min-w-[220px] flex-1">
          <label htmlFor="m-q" className="sr-only">
            Search
          </label>
          <TextInput
            id="m-q"
            name="q"
            type="search"
            placeholder="Search by name"
            defaultValue={q}
            maxLength={80}
          />
        </div>
        <Button type="submit">Search</Button>
      </form>
      <section
        aria-label="Results"
        className="rounded-card border border-border-panel bg-surface shadow-subtle"
      >
        {data.length ? (
          <RecordTable
            columns={columns}
            rows={data}
            caption={k.label}
            href={(row) => `/workspace/manage/${kind}/${row.id}`}
          />
        ) : (
          <div className="p-4">
            <EmptyState as="h2" title="Nothing to show">
              No records match.
            </EmptyState>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-ctl text-muted">
          <span>
            {page.total} {page.total === 1 ? "record" : "records"}
          </span>
          {page.pages > 1 ? (
            <nav aria-label="Pages" className="flex items-center gap-3">
              {page.page > 1 ? (
                <Link href={pageHref(page.page - 1)} className="text-accent underline">
                  Previous
                </Link>
              ) : null}
              <span aria-current="page">
                Page {page.page} of {page.pages}
              </span>
              {page.page < page.pages ? (
                <Link href={pageHref(page.page + 1)} className="text-accent underline">
                  Next
                </Link>
              ) : null}
            </nav>
          ) : null}
        </div>
      </section>
    </>
  );
}
