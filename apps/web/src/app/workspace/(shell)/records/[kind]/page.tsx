import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, EmptyState, Select, TextInput } from "@/components/ui";
import { RecordTable } from "@/components/workspace/record-table";
import { requireStaff, staffJson } from "@/lib/staff";
import type { RecordList } from "@/lib/staff-types";

export const metadata: Metadata = { title: "Records" };
type Props = {
  params: Promise<{ kind: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function RecordsPage({ params, searchParams }: Props) {
  const { kind } = await params;
  if (!/^[a-z-]{1,40}$/.test(kind)) notFound();
  await requireStaff(`/workspace/records/${kind}`);
  const raw = await searchParams;
  const result = await staffJson<RecordList>(
    `records/${kind}?${new URLSearchParams(Object.entries(raw).flatMap(([k, v]) => (first(v) ? [[k, first(v)] as [string, string]] : []))).toString()}`,
  );
  if (!result.ok) {
    if (result.status === 404) notFound();
    throw new Error("The register could not be loaded.");
  }
  const { resource, columns, filters, searchable, data, page } = result.data;
  const pageHref = (n: number) => {
    const next = new URLSearchParams(
      Object.entries(raw).flatMap(([k, v]) =>
        first(v) && k !== "page" ? [[k, first(v)] as [string, string]] : [],
      ),
    );
    next.set("page", String(n));
    return `/workspace/records/${kind}?${next.toString()}`;
  };
  return (
    <>
      <h1 className="m-0 mb-1 text-section font-light tracking-section">{resource.label}</h1>
      <p className="m-0 mb-4 max-w-[70ch] text-base text-muted">{resource.description}</p>
      {filters.length || searchable ? (
        <form
          method="get"
          role="search"
          aria-label={`Filter ${resource.label}`}
          className="mb-4 flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface-pale p-3"
        >
          {searchable ? (
            <div className="min-w-[220px] flex-1">
              <label htmlFor="r-q" className="sr-only">
                Search
              </label>
              <TextInput
                id="r-q"
                name="q"
                type="search"
                placeholder="Search"
                defaultValue={first(raw.q)}
                maxLength={80}
              />
            </div>
          ) : null}
          {filters.map((f) => (
            <div key={f.name} className="min-w-[180px]">
              <label htmlFor={`r-${f.name}`} className="sr-only">
                {f.label}
              </label>
              <Select id={`r-${f.name}`} name={f.name} defaultValue={first(raw[f.name])}>
                <option value="">{f.label}: any</option>
                {f.choices.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
          ))}
          <Button type="submit">Apply</Button>
        </form>
      ) : null}
      <section
        aria-label="Results"
        className="rounded-card border border-border-panel bg-surface shadow-subtle"
      >
        {data.length ? (
          <RecordTable
            columns={columns}
            rows={data}
            caption={resource.label}
            href={(row) => `/workspace/records/${kind}/${row.id}`}
          />
        ) : (
          <div className="p-4">
            <EmptyState as="h2" title="Nothing to show">
              There are no records here for these filters.
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
                <Link href={pageHref(page.page - 1)} rel="prev" className="text-accent underline">
                  Previous
                </Link>
              ) : null}
              <span aria-current="page">
                Page {page.page} of {page.pages}
              </span>
              {page.page < page.pages ? (
                <Link href={pageHref(page.page + 1)} rel="next" className="text-accent underline">
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
