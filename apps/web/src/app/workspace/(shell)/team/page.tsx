import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, ButtonLink, EmptyState, Select, TextInput } from "@/components/ui";
import { dateTimeText, StatusBadge } from "@/components/workspace/badges";
import { can, requireStaff, staffJson } from "@/lib/staff";
import type { TeamList, TeamRow } from "@/lib/team-types";

export const metadata: Metadata = { title: "Staff management" };
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const th =
  "border-t border-line bg-surface-pale px-[12px] py-[8px] text-left text-small font-normal whitespace-nowrap text-muted";
const td = "border-t border-line px-[12px] py-[8px] align-middle text-ctl text-ink [overflow-wrap:anywhere]";

const SORTABLE: [string, string][] = [
  ["name", "Name"],
  ["email", "Email"],
  ["last_login", "Last login"],
  ["joined", "Date joined"],
];

export default async function TeamPage({ searchParams }: Props) {
  const session = await requireStaff("/workspace/team");
  if (!can(session, "user.status.change")) notFound();
  const raw = await searchParams;
  const params = new URLSearchParams(
    Object.entries(raw).flatMap(([k, v]) => (first(v) ? [[k, first(v)] as [string, string]] : [])),
  );
  const result = await staffJson<TeamList>(`team?${params.toString()}`);
  if (!result.ok) {
    if (result.status === 403 || result.status === 404) notFound();
    throw new Error("The staff list could not be loaded.");
  }
  const { summary, data, page, roles } = result.data;
  const href = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    return `/workspace/team?${next.toString()}`;
  };
  const sort = first(raw.sort) || "name";
  const sortHref = (key: string) => href({ sort: sort === key ? `-${key}` : key, page: "" });
  const sortState = (key: string): "ascending" | "descending" | "none" =>
    sort === key ? "ascending" : sort === `-${key}` ? "descending" : "none";

  const cards: { label: string; value: number; note?: string }[] = [
    { label: "Total staff", value: summary.total },
    { label: "Active", value: summary.active },
    { label: "Suspended", value: summary.suspended },
    {
      label: "Pending invitations",
      value: summary.pending,
      note: summary.expired ? `${summary.expired} expired` : undefined,
    },
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="m-0 mb-1 text-section font-light tracking-section">Staff management</h1>
          <p className="m-0 max-w-[70ch] text-base text-muted">
            Invite staff, give them a role, suspend or remove access. Every change is recorded in the audit
            log.
          </p>
        </div>
        <ButtonLink href="/workspace/team/new">Invite staff</ButtonLink>
      </div>

      <ul aria-label="Staff summary" className="m-0 mb-4 grid list-none grid-cols-2 gap-3 p-0 lg:grid-cols-4">
        {cards.map((c) => (
          <li key={c.label} className="rounded-card border border-border-panel bg-surface p-3 shadow-subtle">
            <p className="m-0 text-small text-muted">{c.label}</p>
            <p className="m-0 mt-1 text-[1.75rem] leading-none font-light tabular-nums">{c.value}</p>
            {c.note ? <p className="m-0 mt-1 text-small text-muted">{c.note}</p> : null}
          </li>
        ))}
      </ul>

      <form
        method="get"
        role="search"
        aria-label="Filter staff"
        className="mb-4 flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface-pale p-3"
      >
        <div className="min-w-[220px] flex-1">
          <label htmlFor="t-q" className="sr-only">
            Search by name or email
          </label>
          <TextInput
            id="t-q"
            name="q"
            type="search"
            placeholder="Search by name or email"
            defaultValue={first(raw.q)}
            maxLength={80}
          />
        </div>
        <div className="min-w-[160px]">
          <label htmlFor="t-role" className="sr-only">
            Role
          </label>
          <Select id="t-role" name="role" defaultValue={first(raw.role)}>
            <option value="">Role: any</option>
            {roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-[160px]">
          <label htmlFor="t-status" className="sr-only">
            Status
          </label>
          <Select id="t-status" name="status" defaultValue={first(raw.status)}>
            <option value="">Status: any</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="pending">Pending invitation</option>
            <option value="removed">Removed</option>
          </Select>
        </div>
        {sort !== "name" ? <input type="hidden" name="sort" value={sort} /> : null}
        <Button type="submit">Apply</Button>
        {params.size ? (
          <Link href="/workspace/team" className="py-2 text-ctl text-accent underline">
            Clear
          </Link>
        ) : null}
      </form>

      <section
        aria-label="Staff"
        className="rounded-card border border-border-panel bg-surface shadow-subtle"
      >
        {data.length ? (
          <>
            <div className="overflow-x-auto max-md:hidden">
              <table className="w-full border-collapse">
                <caption className="sr-only">Staff accounts</caption>
                <thead>
                  <tr>
                    {SORTABLE.slice(0, 2).map(([key, label]) => (
                      <th key={key} scope="col" aria-sort={sortState(key)} className={th}>
                        <Link href={sortHref(key)} className="text-muted hover:text-ink">
                          {label}
                          {sortState(key) === "ascending"
                            ? " ↑"
                            : sortState(key) === "descending"
                              ? " ↓"
                              : ""}
                        </Link>
                      </th>
                    ))}
                    <th scope="col" className={th}>
                      Role
                    </th>
                    <th scope="col" className={th}>
                      Status
                    </th>
                    {SORTABLE.slice(2).map(([key, label]) => (
                      <th key={key} scope="col" aria-sort={sortState(key)} className={th}>
                        <Link href={sortHref(key)} className="text-muted hover:text-ink">
                          {label}
                          {sortState(key) === "ascending"
                            ? " ↑"
                            : sortState(key) === "descending"
                              ? " ↓"
                              : ""}
                        </Link>
                      </th>
                    ))}
                    <th scope="col" className={th}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => (
                    <tr key={row.id} className="hover:bg-row-hover">
                      <th scope="row" className={`${td} text-left font-normal`}>
                        <Link href={`/workspace/team/${row.id}`} className="text-accent hover:underline">
                          {row.name}
                        </Link>
                        {row.is_you ? <span className="text-small text-muted"> (you)</span> : null}
                      </th>
                      <td className={td}>{row.email}</td>
                      <td className={td}>{row.role?.label ?? "-"}</td>
                      <td className={td}>
                        <StatusBadge tone={row.status.tone}>{row.status.label}</StatusBadge>
                      </td>
                      <td className={`${td} whitespace-nowrap tabular-nums`}>
                        {row.last_login ? dateTimeText(row.last_login) : "Never"}
                      </td>
                      <td className={`${td} whitespace-nowrap tabular-nums`}>{dateTimeText(row.joined)}</td>
                      <td className={td}>
                        <Link
                          href={`/workspace/team/${row.id}`}
                          className="text-accent hover:underline"
                          aria-label={`Manage ${row.name}`}
                        >
                          Manage
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="m-0 list-none p-0 md:hidden" aria-label="Staff accounts">
              {data.map((row) => (
                <MobileRow key={row.id} row={row} />
              ))}
            </ul>
          </>
        ) : (
          <div className="p-4">
            <EmptyState as="h2" title="No staff match">
              {params.size
                ? "No one matches these filters. Clear them to see everyone."
                : "There are no staff accounts yet."}
            </EmptyState>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-ctl text-muted">
          <span>
            {page.total} {page.total === 1 ? "person" : "people"}
          </span>
          {page.pages > 1 ? (
            <nav aria-label="Pages" className="flex items-center gap-3">
              {page.page > 1 ? (
                <Link
                  href={href({ page: String(page.page - 1) })}
                  rel="prev"
                  className="text-accent underline"
                >
                  Previous
                </Link>
              ) : null}
              <span aria-current="page">
                Page {page.page} of {page.pages}
              </span>
              {page.page < page.pages ? (
                <Link
                  href={href({ page: String(page.page + 1) })}
                  rel="next"
                  className="text-accent underline"
                >
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

function MobileRow({ row }: { row: TeamRow }) {
  return (
    <li className="border-t border-line px-[14px] py-3">
      <div className="flex items-start justify-between gap-2">
        <p className="m-0 text-base">
          <Link href={`/workspace/team/${row.id}`} className="text-accent hover:underline">
            {row.name}
          </Link>
          {row.is_you ? <span className="text-small text-muted"> (you)</span> : null}
        </p>
        <StatusBadge tone={row.status.tone}>{row.status.label}</StatusBadge>
      </div>
      <p className="m-0 mt-1 text-small [overflow-wrap:anywhere] text-muted">{row.email}</p>
      <dl className="m-0 mt-2 grid gap-1">
        {[
          ["Role", row.role?.label ?? "-"],
          ["Last login", row.last_login ? dateTimeText(row.last_login) : "Never"],
          ["Joined", dateTimeText(row.joined)],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 text-small">
            <dt className="text-muted">{label}</dt>
            <dd className="m-0 text-right">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="m-0 mt-2 text-small">
        <Link href={`/workspace/team/${row.id}`} className="text-accent underline">
          Manage {row.name}
        </Link>
      </p>
    </li>
  );
}
