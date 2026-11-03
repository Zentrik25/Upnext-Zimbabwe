import Link from "next/link";
import type { Cell, StatusTone } from "@/lib/staff-types";
import { dateTimeText, StatusBadge } from "./badges";

type Column = { key: string; label: string; kind?: "text" | "datetime" | "badge" };
type Row = { id: string; cells: Record<string, Cell> };

const th =
  "border-t border-line bg-surface-pale px-[14px] py-[10px] text-left text-small font-normal whitespace-nowrap text-muted";
const td = "border-t border-line px-[14px] py-[10px] align-top text-ctl text-ink [overflow-wrap:anywhere]";

function show(cell: Cell | undefined, kind: Column["kind"]) {
  if (cell === null || cell === undefined || cell === "") return "-";
  if (typeof cell === "object") return <StatusBadge tone={cell.tone as StatusTone}>{cell.text}</StatusBadge>;
  return kind === "datetime" ? dateTimeText(cell) : cell;
}

/**
 * A register as a table from 991px and as cards below it. The first column links to the record when `href`
 * is given; status cells are badges with the word shown, never colour alone.
 */
export function RecordTable({
  columns,
  rows,
  caption,
  href,
}: {
  columns: Column[];
  rows: Row[];
  caption: string;
  href?: (row: Row) => string;
}) {
  const first = columns[0];
  return (
    <>
      <div className="overflow-x-auto max-md:hidden">
        <table className="w-full border-collapse">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={th}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-row-hover">
                {columns.map((c, i) =>
                  i === 0 ? (
                    <th key={c.key} scope="row" className={`${td} text-left font-normal`}>
                      {href ? (
                        <Link href={href(row)} className="text-accent hover:underline">
                          {show(row.cells[c.key], c.kind)}
                        </Link>
                      ) : (
                        show(row.cells[c.key], c.kind)
                      )}
                    </th>
                  ) : (
                    <td
                      key={c.key}
                      className={`${td} ${c.kind === "datetime" ? "whitespace-nowrap tabular-nums" : ""}`}
                    >
                      {show(row.cells[c.key], c.kind)}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="m-0 list-none p-0 md:hidden" aria-label={caption}>
        {rows.map((row) => (
          <li key={row.id} className="border-t border-line px-[14px] py-3">
            <p className="m-0 text-base">
              {href && first ? (
                <Link href={href(row)} className="text-accent hover:underline">
                  {show(row.cells[first.key], first.kind)}
                </Link>
              ) : (
                first && show(row.cells[first.key], first.kind)
              )}
            </p>
            <dl className="m-0 mt-2 grid gap-1">
              {columns.slice(1).map((c) => (
                <div key={c.key} className="flex justify-between gap-3 text-small">
                  <dt className="text-muted">{c.label}</dt>
                  <dd className="m-0 text-right [overflow-wrap:anywhere]">
                    {show(row.cells[c.key], c.kind)}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
