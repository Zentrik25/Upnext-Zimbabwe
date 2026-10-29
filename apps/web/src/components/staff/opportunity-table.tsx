import Link from "next/link";
import { Tag } from "@/components/ui";
import { formatClosing } from "@/lib/staff-format";
import type { OpportunityRow } from "@/lib/staff-types";
import { ActionButton } from "./actions";
import { StatusBadge } from "./primitives";

export type SortKey = "title" | "organisation" | "category" | "status" | "closing" | "author" | "updated";

function SortHeader({
  label,
  sort,
  active,
  dir,
  hrefFor,
}: {
  label: string;
  sort: SortKey;
  active: boolean;
  dir: "asc" | "desc";
  hrefFor: (sort: SortKey, dir: "asc" | "desc") => string;
}) {
  const next = active && dir === "asc" ? "desc" : "asc";
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
      className="whitespace-nowrap px-3 py-2 text-left text-small font-medium text-muted"
    >
      <Link href={hrefFor(sort, next)} className="inline-flex min-h-[24px] items-center gap-1 hover:text-ink">
        {label}
        <span aria-hidden="true" className="text-micro">
          {active ? (dir === "asc" ? "▲" : "▼") : ""}
        </span>
        <span className="sr-only">, sort {next === "asc" ? "ascending" : "descending"}</span>
      </Link>
    </th>
  );
}

/** The compact opportunities table: every column the editorial desk scans, with permission-driven actions. */
export function OpportunityTable({
  rows,
  sort,
  dir,
  hrefFor,
  caption,
}: {
  rows: OpportunityRow[];
  sort: string;
  dir: "asc" | "desc";
  hrefFor: (sort: SortKey, dir: "asc" | "desc") => string;
  caption: string;
}) {
  const header = (label: string, key: SortKey) => (
    <SortHeader label={label} sort={key} active={sort === key} dir={dir} hrefFor={hrefFor} />
  );
  return (
    <div className="relative overflow-x-auto rounded-card border border-border-panel bg-(--staff-card) shadow-subtle">
      <table className="w-full min-w-[900px] border-collapse text-ctl">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-line bg-(--staff-canvas)">
          <tr>
            {header("Opportunity", "title")}
            {header("Organisation", "organisation")}
            {header("Category", "category")}
            <th
              scope="col"
              className="whitespace-nowrap px-3 py-2 text-left text-small font-medium text-muted"
            >
              Location
            </th>
            {header("Status", "status")}
            {header("Closing", "closing")}
            {header("Author", "author")}
            <th
              scope="col"
              className="whitespace-nowrap px-3 py-2 text-right text-small font-medium text-muted"
            >
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => {
            const quick = row.actions.filter((a) =>
              ["publish_direct", "publish", "approve", "withdraw"].includes(a),
            );
            const primary = quick.includes("publish_direct")
              ? ["publish_direct"]
              : quick.includes("publish")
                ? ["publish"]
                : quick.includes("approve")
                  ? []
                  : quick.includes("withdraw")
                    ? ["withdraw"]
                    : [];
            return (
              <tr key={row.id} className="align-top hover:bg-row-hover">
                <td className="min-w-[180px] max-w-[240px] px-3 py-3">
                  <Link
                    href={`/staff/opportunities/${row.id}`}
                    className="font-medium text-ink underline decoration-line underline-offset-2 hover:decoration-accent"
                  >
                    {row.title}
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {row.employer_owned ? <Tag tone="accent">Employer submission</Tag> : null}
                    {row.direct_publication ? <Tag>Direct publication</Tag> : null}
                  </div>
                </td>
                <td className="max-w-[130px] px-3 py-3">
                  <span className="block truncate" title={row.organisation.name}>
                    {row.organisation.name}
                  </span>
                  <span className="text-small text-muted">
                    {row.organisation.verified ? "Verified employer" : "Entered by staff"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-3">{row.category.name}</td>
                <td className="max-w-[90px] px-3 py-3 text-muted">
                  <span className="block truncate" title={row.location ?? ""}>
                    {row.location ?? "-"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-3">
                  <StatusBadge status={row.status} />
                </td>
                <td className="tnum whitespace-nowrap px-3 py-3">{formatClosing(row.closing)}</td>
                <td className="max-w-[110px] px-3 py-3">{row.author.name}</td>
                <td className="whitespace-nowrap px-3 py-3">
                  <div className="flex flex-nowrap items-center justify-end gap-1.5">
                    <Link
                      href={`/staff/opportunities/${row.id}`}
                      className="inline-flex min-h-[32px] items-center rounded-control border border-border-strong px-2.5 text-small text-secondary-text hover:bg-accent/5"
                    >
                      {row.actions.includes("edit") ? "Edit" : "Open"}
                    </Link>
                    {primary.map((action) => (
                      <ActionButton
                        key={action}
                        opportunityId={row.id}
                        rowVersion={row.row_version}
                        action={action}
                        compact
                      />
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
