import Link from "next/link";
import type { ListingRow } from "@/lib/staff-types";
import { dateText, dateTimeText, StatusBadge } from "./badges";
import { count } from "@/lib/staff-format";
import { RowMenu } from "./row-menu";
import { VerifyToggle } from "./verify-toggle";

export type TableKind = "default" | "queue";

const th =
  "border-t border-line bg-surface-pale px-[14px] py-[10px] text-left text-small font-normal whitespace-nowrap text-muted";
const td = "border-t border-line px-[14px] py-[10px] align-middle text-ctl text-ink";

/**
 * Listings as a table from 991px and as cards below it (no sideways scrolling of the page). The `queue` kind
 * shows who submitted a revision and when, for the review and ready-to-publish queues.
 */
export function ListingTable({
  rows,
  kind = "default",
  caption,
}: {
  rows: ListingRow[];
  kind?: TableKind;
  caption: string;
}) {
  // The Views column is drawn only when the server sent the figure (it does not for people without analytics).
  const showViews = kind === "default" && rows.some((r) => r.views !== undefined && r.views !== null);
  return (
    <>
      <div className="max-md:hidden">
        <table className="w-full border-collapse">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              <th scope="col" className={th}>
                Title
              </th>
              <th scope="col" className={th}>
                Organisation
              </th>
              {kind === "queue" ? (
                <>
                  <th scope="col" className={th}>
                    Submitted by
                  </th>
                  <th scope="col" className={th}>
                    Submitted
                  </th>
                  <th scope="col" className={th}>
                    Verification
                  </th>
                </>
              ) : (
                <>
                  <th scope="col" className={th}>
                    Location
                  </th>
                  <th scope="col" className={th}>
                    Type
                  </th>
                  <th scope="col" className={th}>
                    Closing date
                  </th>
                  {showViews ? (
                    <th scope="col" className={`${th} text-right`}>
                      Views
                    </th>
                  ) : null}
                  <th scope="col" className={th}>
                    Verification
                  </th>
                </>
              )}
              <th scope="col" className={th}>
                Status
              </th>
              <th scope="col" className={th}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-row-hover">
                <th scope="row" className={`${td} max-w-[320px] text-left font-normal`}>
                  <Link
                    href={`/workspace/opportunities/${r.id}`}
                    className="font-normal text-accent hover:underline"
                  >
                    {r.title}
                  </Link>
                </th>
                <td className={td}>{r.organisation ?? "-"}</td>
                {kind === "queue" ? (
                  <>
                    <td className={td}>{r.submitted_by ?? "-"}</td>
                    <td className={`${td} whitespace-nowrap`}>{dateTimeText(r.submitted_at)}</td>
                    <td className={td}>
                      <VerifyToggle id={r.id} verified={r.verified} canVerify={r.can_verify} compact />
                    </td>
                  </>
                ) : (
                  <>
                    <td className={td}>{r.location}</td>
                    <td className={td}>{r.category.name}</td>
                    <td className={`${td} whitespace-nowrap tabular-nums`}>{dateText(r.closing)}</td>
                    {showViews ? (
                      <td className={`${td} text-right tabular-nums`} data-testid="views-cell">
                        {count(r.views)}
                      </td>
                    ) : null}
                    <td className={td}>
                      <VerifyToggle id={r.id} verified={r.verified} canVerify={r.can_verify} compact />
                    </td>
                  </>
                )}
                <td className={td}>
                  <StatusBadge tone={r.status_tone}>{r.status_label}</StatusBadge>
                </td>
                <td className={`${td} w-px text-right whitespace-nowrap`}>
                  <RowMenu id={r.id} title={r.title} actions={r.actions} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="m-0 list-none p-0 md:hidden" aria-label={caption}>
        {rows.map((r) => (
          <li key={r.id} className="relative border-t border-line px-[14px] py-3">
            <div className="absolute top-[6px] right-[6px]">
              <RowMenu id={r.id} title={r.title} actions={r.actions} />
            </div>
            <Link
              href={`/workspace/opportunities/${r.id}`}
              className="block pr-11 text-base text-accent hover:underline"
            >
              {r.title}
            </Link>
            <p className="m-0 mt-1 text-small text-muted">
              {r.organisation ?? "-"} · {r.location} · {r.category.name}
            </p>
            <p className="m-0 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-muted">
              <StatusBadge tone={r.status_tone}>{r.status_label}</StatusBadge>
              <span>Closing: {dateText(r.closing)}</span>
              {showViews ? <span>Views: {count(r.views)}</span> : null}
            </p>
            <p className="m-0 mt-2">
              <VerifyToggle id={r.id} verified={r.verified} canVerify={r.can_verify} compact />
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
