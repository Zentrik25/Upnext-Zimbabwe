import { notFound } from "next/navigation";
import { EmptyNote, PageHeader, Pagination } from "@/components/staff/primitives";
import { Button, Select, Tag, TextInput, type TagTone } from "@/components/ui";
import { can, first, requireStaff, staffGet } from "@/lib/staff";
import { formatDateTime } from "@/lib/staff-format";
import type { AuditRow, Paged } from "@/lib/staff-types";

export const metadata = { title: "Audit Logs" };

const TONE: Record<string, TagTone> = { info: "default", privileged: "accent", security: "danger" };

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const session = await requireStaff();
  if (!can(session, "audit.read_all")) notFound();
  const query = new URLSearchParams();
  for (const key of ["action", "severity", "object_type", "object", "actor", "page"]) {
    if (first(params[key])) query.set(key, first(params[key]));
  }
  const result = await staffGet<Paged<AuditRow>>(`audit?${query.toString()}`);
  const hrefFor = (page: number) =>
    `/staff/audit?${new URLSearchParams({ ...Object.fromEntries(query), page: String(page) }).toString()}`;
  return (
    <>
      <PageHeader
        title="Audit Logs"
        lead="Append-only record of editorial, security and administrative events. Rows are never changed or deleted; passwords, tokens and e-mail addresses are never stored here."
      />
      <form
        action="/staff/audit"
        method="get"
        role="search"
        aria-label="Filter the audit log"
        className="mb-4 grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1"
      >
        <div className="grid gap-[5px]">
          <label htmlFor="a-action" className="text-ctl font-medium text-check-text">
            Action starts with
          </label>
          <TextInput
            id="a-action"
            name="action"
            defaultValue={first(params.action)}
            placeholder="opportunity."
            maxLength={64}
          />
        </div>
        <div className="grid gap-[5px]">
          <label htmlFor="a-sev" className="text-ctl font-medium text-check-text">
            Severity
          </label>
          <Select id="a-sev" name="severity" defaultValue={first(params.severity)}>
            <option value="">Any</option>
            <option value="info">Info</option>
            <option value="privileged">Privileged</option>
            <option value="security">Security</option>
          </Select>
        </div>
        <div className="grid gap-[5px]">
          <label htmlFor="a-type" className="text-ctl font-medium text-check-text">
            Object type
          </label>
          <TextInput
            id="a-type"
            name="object_type"
            defaultValue={first(params.object_type)}
            placeholder="opportunity"
            maxLength={48}
          />
        </div>
        <Button type="submit">Apply</Button>
      </form>
      {!result.ok ? (
        <EmptyNote>The audit log could not be loaded.</EmptyNote>
      ) : result.data.data.length === 0 ? (
        <EmptyNote>No event matches.</EmptyNote>
      ) : (
        <>
          <div className="relative overflow-x-auto rounded-card border border-border-panel bg-(--staff-card) shadow-subtle">
            <table className="w-full min-w-[900px] border-collapse text-ctl">
              <caption className="sr-only">Audit events, newest first</caption>
              <thead className="border-b border-line bg-(--staff-canvas)">
                <tr>
                  {["When", "Action", "Severity", "Actor", "Object", "Details"].map((h) => (
                    <th key={h} scope="col" className="px-3 py-2 text-left text-small font-medium text-muted">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {result.data.data.map((row) => (
                  <tr key={row.id} className="align-top hover:bg-row-hover">
                    <td className="tnum whitespace-nowrap px-3 py-3 text-muted">{formatDateTime(row.at)}</td>
                    <td className="px-3 py-3 font-mono text-small">{row.action}</td>
                    <td className="px-3 py-3">
                      <Tag tone={TONE[row.severity] ?? "default"}>{row.severity}</Tag>
                    </td>
                    <td className="px-3 py-3">
                      {row.actor ?? (row.actor_type === "system" ? "System" : "Anonymous")}
                    </td>
                    <td className="px-3 py-3">
                      {row.object_type}
                      {row.object_id ? (
                        <span
                          className="block max-w-[140px] truncate font-mono text-small text-muted"
                          title={row.object_id}
                        >
                          {row.object_id}
                        </span>
                      ) : null}
                    </td>
                    <td className="max-w-[320px] px-3 py-3">
                      {row.changes ? (
                        <details>
                          <summary className="cursor-pointer text-small text-accent">Show</summary>
                          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words font-mono text-small text-muted">
                            {JSON.stringify(row.changes, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={result.data.page} noun="events" hrefFor={hrefFor} />
        </>
      )}
    </>
  );
}
