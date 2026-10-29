import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyNote, PageHeader, Pagination } from "@/components/staff/primitives";
import { Tag, type TagTone } from "@/components/ui";
import { can, first, requireStaff, staffGet } from "@/lib/staff";
import { formatDateTime, words } from "@/lib/staff-format";
import type { Paged, ReportRow } from "@/lib/staff-types";

export const metadata = { title: "Reports" };

const FILTERS = [
  ["open", "Open"],
  ["escalated", "Escalated"],
  ["closed", "Closed"],
] as const;
const TONE: Record<string, TagTone> = {
  open: "urgent",
  investigating: "accent",
  escalated: "danger",
  resolved: "good",
  dismissed: "default",
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const session = await requireStaff();
  if (!can(session, "report.read")) notFound();
  const status = first(params.status) || "open";
  const result = await staffGet<Paged<ReportRow>>(
    `reports?status=${status}&page=${first(params.page) || "1"}`,
  );
  return (
    <>
      <PageHeader
        title="Reports"
        lead="Concerns the public raised about live listings. A report never changes a listing by itself: a person with the right permission acts on it through the editorial workflow."
      />
      <nav aria-label="Report status" className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map(([value, label]) => (
          <Link
            key={value}
            href={`/staff/reports?status=${value}`}
            aria-current={status === value ? "page" : undefined}
            className={`inline-flex min-h-control items-center rounded-control border px-3 text-ctl ${status === value ? "border-border-strong bg-match-bg text-secondary-text" : "border-line text-muted hover:text-ink"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {!result.ok ? (
        <EmptyNote>The reports could not be loaded.</EmptyNote>
      ) : result.data.data.length === 0 ? (
        <EmptyNote>No {status} reports.</EmptyNote>
      ) : (
        <>
          <div className="relative overflow-x-auto rounded-card border border-border-panel bg-(--staff-card) shadow-subtle">
            <table className="w-full min-w-[760px] border-collapse text-ctl">
              <caption className="sr-only">Reports</caption>
              <thead className="border-b border-line bg-(--staff-canvas)">
                <tr>
                  {["Reference", "Listing", "Reason", "Status", "Received"].map((h) => (
                    <th key={h} scope="col" className="px-3 py-2 text-left text-small font-medium text-muted">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {result.data.data.map((r) => (
                  <tr key={r.id} className="hover:bg-row-hover">
                    <td className="px-3 py-3">
                      <Link href={`/staff/reports/${r.id}`} className="font-mono text-accent underline">
                        {r.reference}
                      </Link>
                      {r.duplicate_count ? (
                        <span className="block text-small text-muted">+{r.duplicate_count} repeats</span>
                      ) : null}
                    </td>
                    <td className="max-w-[280px] truncate px-3 py-3">{r.opportunity.title || "Listing"}</td>
                    <td className="px-3 py-3">{r.reason_label}</td>
                    <td className="px-3 py-3">
                      <Tag tone={TONE[r.status] ?? "default"}>{words(r.status)}</Tag>
                    </td>
                    <td className="tnum px-3 py-3 text-muted">{formatDateTime(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={result.data.page}
            noun="reports"
            hrefFor={(p) => `/staff/reports?status=${status}&page=${p}`}
          />
        </>
      )}
    </>
  );
}
