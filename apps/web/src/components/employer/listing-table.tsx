import Link from "next/link";
import { Tag } from "@/components/ui";
import type { TagTone } from "@/components/ui/tag";
import type { EmployerListingRow } from "@/lib/employer-types";
import { JOB_TYPES } from "@/lib/job-editor";
import { count, formatDate } from "@/lib/staff-format";
import { RowActions } from "./row-actions";

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  Object.values(JOB_TYPES)
    .flat()
    .map((option) => [option.value, option.label]),
);

/** The words and tone for a row's status. Colour never carries the meaning alone. */
export function rowStatus(row: EmployerListingRow): { label: string; tone: TagTone } {
  switch (row.status) {
    case "published":
      return row.deadline_at && new Date(row.deadline_at).getTime() < Date.now()
        ? { label: "Closing date passed", tone: "urgent" }
        : { label: "Active", tone: "good" };
    case "draft":
      return { label: "Draft", tone: "urgent" };
    case "in_review":
      return { label: "In review", tone: "accent" };
    case "approved":
      return { label: "Approved", tone: "accent" };
    case "rejected":
      return { label: "Changes requested", tone: "danger" };
    case "expired":
      return { label: "Expired", tone: "default" };
    case "withdrawn":
      return { label: "Withdrawn", tone: "default" };
    default:
      return { label: "Archived", tone: "default" };
  }
}

const th = "px-3 py-2.5 text-left text-ctl font-normal text-ink whitespace-nowrap";
const td = "px-3 py-3 align-middle text-ctl";

/**
 * The listings table. Views and apply clicks are all-time counts for the listing (clicks on Apply, never
 * applications); a listing that was never public shows a dash, not a zero that suggests it was tried.
 */
export function ListingTable({ rows, empty }: { rows: EmployerListingRow[]; empty: string }) {
  if (rows.length === 0)
    return (
      <p
        className="m-0 rounded-card border border-border-panel p-6 text-center text-base text-muted"
        data-testid="no-rows"
      >
        {empty}
      </p>
    );
  return (
    <div
      className="relative overflow-x-auto rounded-card border border-border-panel"
      data-testid="listing-table"
    >
      <table className="w-full min-w-[860px] border-collapse">
        <caption className="sr-only">Opportunities of your organisation</caption>
        <thead className="bg-surface-pale">
          <tr>
            <th scope="col" className={th}>
              Title
            </th>
            <th scope="col" className={th}>
              Type
            </th>
            <th scope="col" className={th}>
              Location
            </th>
            <th scope="col" className={th}>
              Status
            </th>
            <th scope="col" className={th}>
              Views
            </th>
            <th scope="col" className={th}>
              Apply clicks
            </th>
            <th scope="col" className={th}>
              Published
            </th>
            <th scope="col" className={`${th} text-right`}>
              <span className="sr-only">Actions</span>
              <span aria-hidden="true">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const status = rowStatus(row);
            const everPublic = row.published_at !== null;
            return (
              <tr key={row.id} className="border-t border-line" data-testid="employer-listing">
                <th scope="row" className={`${td} max-w-[300px] text-left font-normal`}>
                  <Link href={`/employer/listings/${row.id}`} className="text-ink hover:underline">
                    {row.title}
                  </Link>
                  {row.decision ? (
                    <span className="mt-0.5 block text-small text-danger" data-testid="decision">
                      Editor&apos;s note: {row.decision.reason}
                    </span>
                  ) : null}
                </th>
                <td className={td}>
                  {row.employment_type ? (
                    <Tag tone="accent">{TYPE_LABEL[row.employment_type] ?? row.employment_type}</Tag>
                  ) : (
                    <span className="text-muted">{row.category.name}</span>
                  )}
                </td>
                <td className={`${td} max-w-[200px]`}>
                  {row.location ?? <span className="text-muted">Not stated</span>}
                </td>
                <td className={td}>
                  <Tag tone={status.tone}>{status.label}</Tag>
                </td>
                <td className={`${td} tabular-nums`}>{everPublic ? count(row.views) : "—"}</td>
                <td className={`${td} tabular-nums`}>{everPublic ? count(row.apply_clicks) : "—"}</td>
                <td className={`${td} whitespace-nowrap`}>
                  {row.published_at ? formatDate(row.published_at) : "—"}
                </td>
                <td className={`${td} text-right`}>
                  <RowActions row={row} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
