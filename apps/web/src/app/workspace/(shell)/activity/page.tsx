import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui";
import { dateTimeText } from "@/components/workspace/badges";
import { requireStaff, staffJson } from "@/lib/staff";
import type { ActivityRow, PageInfo } from "@/lib/staff-types";

export const metadata: Metadata = { title: "Activity log" };
type Props = { searchParams: Promise<{ page?: string }> };

const th =
  "border-t border-line bg-surface-pale px-[14px] py-[10px] text-left text-small font-normal whitespace-nowrap text-muted";
const td = "border-t border-line px-[14px] py-[10px] align-top text-ctl";

export default async function ActivityPage({ searchParams }: Props) {
  await requireStaff("/workspace/activity");
  const { page: raw } = await searchParams;
  const n = /^\d{1,4}$/.test(raw ?? "") ? raw : "1";
  const result = await staffJson<{ data: ActivityRow[]; page: PageInfo }>(`activity?page=${n}&page_size=50`);
  if (!result.ok) throw new Error("The activity log could not be loaded.");
  const { data, page } = result.data;
  return (
    <>
      <h1 className="m-0 mb-1 text-section font-light tracking-section">Activity log</h1>
      <p className="m-0 mb-4 text-base text-muted">
        Every change of state on the listings you can see: who did what, and when. Times are UTC.
      </p>
      <section
        aria-label="Activity"
        className="rounded-card border border-border-panel bg-surface shadow-subtle"
      >
        {data.length ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <caption className="sr-only">Listing activity, newest first</caption>
              <thead>
                <tr>
                  <th scope="col" className={th}>
                    When
                  </th>
                  <th scope="col" className={th}>
                    What happened
                  </th>
                  <th scope="col" className={th}>
                    Listing
                  </th>
                  <th scope="col" className={th}>
                    Who
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={`${row.listing_id}-${row.at}-${i}`} className="hover:bg-row-hover">
                    <td className={`${td} whitespace-nowrap tabular-nums`}>{dateTimeText(row.at)}</td>
                    <td className={td}>{row.what}</td>
                    <td className={td}>
                      <Link
                        href={`/workspace/opportunities/${row.listing_id}`}
                        className="text-accent hover:underline"
                      >
                        {row.listing}
                      </Link>
                    </td>
                    <td className={td}>{row.actor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-4">
            <EmptyState as="h2" title="No activity yet">
              Changes appear here as they happen.
            </EmptyState>
          </div>
        )}
        {page.pages > 1 ? (
          <nav
            aria-label="Pages"
            className="flex items-center gap-3 border-t border-line px-4 py-3 text-ctl text-muted"
          >
            {page.page > 1 ? (
              <Link href={`/workspace/activity?page=${page.page - 1}`} className="text-accent underline">
                Previous
              </Link>
            ) : null}
            <span aria-current="page">
              Page {page.page} of {page.pages}
            </span>
            {page.page < page.pages ? (
              <Link href={`/workspace/activity?page=${page.page + 1}`} className="text-accent underline">
                Next
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    </>
  );
}
