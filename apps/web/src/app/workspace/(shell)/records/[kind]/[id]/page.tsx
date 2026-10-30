import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionPanel } from "@/components/workspace/action-panel";
import { StatusBadge } from "@/components/workspace/badges";
import { requireStaff, staffJson } from "@/lib/staff";
import type { RecordDetail } from "@/lib/staff-types";

export const metadata: Metadata = { title: "Record" };
type Props = { params: Promise<{ kind: string; id: string }>; searchParams: Promise<{ do?: string }> };

const card = "rounded-card border border-border-panel bg-surface p-4 shadow-subtle";
const th =
  "border-t border-line bg-surface-pale px-[14px] py-[10px] text-left text-small font-normal text-muted";
const td =
  "border-t border-line px-[14px] py-[10px] align-top text-ctl [overflow-wrap:anywhere] whitespace-pre-wrap";

export default async function RecordPage({ params, searchParams }: Props) {
  const { kind, id } = await params;
  if (!/^[a-z-]{1,40}$/.test(kind) || !/^[0-9a-zA-Z-]{1,40}$/.test(id)) notFound();
  const { do: initial } = await searchParams;
  await requireStaff(`/workspace/records/${kind}/${id}`);
  const result = await staffJson<RecordDetail>(`records/${kind}/${id}`);
  if (!result.ok) {
    if (result.status === 404) notFound();
    throw new Error("The record could not be loaded.");
  }
  const r = result.data;
  return (
    <>
      <p className="m-0 text-ctl">
        <Link href={`/workspace/records/${kind}`} className="text-accent underline">
          ← {r.resource.label}
        </Link>
      </p>
      <div className="mt-3 mb-4 flex flex-wrap items-center gap-3">
        <h1 className="m-0 text-section font-light tracking-section [overflow-wrap:anywhere]">{r.title}</h1>
        {r.status ? <StatusBadge tone={r.status.tone}>{r.status.label}</StatusBadge> : null}
      </div>
      {r.notice ? (
        <p
          role="note"
          className="m-0 mb-3 rounded-card border border-urgent/40 bg-urgent-bg p-3 text-ctl text-urgent"
        >
          {r.notice}
        </p>
      ) : null}
      {r.actions.length ? (
        <section aria-labelledby="actions-title" className={`${card} mb-4`}>
          <h2 id="actions-title" className="m-0 mb-3 text-title font-normal tracking-title">
            What you can do now
          </h2>
          <ActionPanel
            endpoint={`staff/records/${kind}/${r.id}/actions`}
            rowVersion={r.row_version}
            actions={r.actions}
            initial={initial}
            noActionsText="No actions are available to you here right now."
          />
        </section>
      ) : null}
      <section className={`${card} mb-4`} aria-labelledby="facts-title">
        <h2 id="facts-title" className="m-0 mb-3 text-title font-normal tracking-title">
          Details
        </h2>
        <dl className="m-0">
          {r.facts.map((f) => (
            <div
              key={f.label}
              className="grid gap-1 border-t border-line py-2 sm:grid-cols-[220px_1fr] sm:gap-4"
            >
              <dt className="text-ctl text-muted">{f.label}</dt>
              <dd className="m-0 text-ctl [overflow-wrap:anywhere] whitespace-pre-wrap">{f.value}</dd>
            </div>
          ))}
        </dl>
      </section>
      {r.sections.map((s) => (
        <section key={s.title} className={`${card} mb-4`} aria-label={s.title}>
          <h2 className="m-0 mb-3 text-title font-normal tracking-title">{s.title}</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <caption className="sr-only">{s.title}</caption>
              <thead>
                <tr>
                  {s.headers.map((h) => (
                    <th key={h} scope="col" className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.rows.map((row, i) => (
                  <tr key={i}>
                    {row.cells.map((c, j) => (
                      <td key={j} className={td}>
                        {j === 0 && row.href ? (
                          <Link href={row.href} className="text-accent hover:underline">
                            {c}
                          </Link>
                        ) : (
                          c
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}
