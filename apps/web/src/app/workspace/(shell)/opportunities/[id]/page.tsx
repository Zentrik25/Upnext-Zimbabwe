import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionPanel } from "@/components/workspace/action-panel";
import { dateText, dateTimeText, StatusBadge } from "@/components/workspace/badges";
import { requireStaff, staffJson } from "@/lib/staff";
import { humanise } from "@/lib/format";
import type { DraftContent, ListingDetail, VersionView } from "@/lib/staff-types";

export const metadata: Metadata = { title: "Opportunity" };
type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ do?: string }> };

const card = "rounded-card border border-border-panel bg-surface p-4 shadow-subtle";
const h2 = "m-0 mb-3 text-title font-normal tracking-title";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-line py-2 sm:grid-cols-[200px_1fr] sm:gap-4">
      <dt className="text-ctl text-muted">{label}</dt>
      <dd className="m-0 text-ctl [overflow-wrap:anywhere] whitespace-pre-wrap">{children}</dd>
    </div>
  );
}

function money(m: DraftContent["salary"]): string | null {
  if (!m) return null;
  const range = [m.min, m.max].filter(Boolean).join(" to ");
  return `${m.currency ?? ""} ${range}${m.period ? ` ${m.period === "once" ? "(one-off)" : `per ${m.period}`}` : ""}`.trim();
}

function Revision({ title, version }: { title: string; version: VersionView | null }) {
  if (!version) return null;
  if (version.hidden)
    return (
      <section className={card} aria-labelledby={`rev-${title}`}>
        <h2 id={`rev-${title}`} className={h2}>
          {title}
        </h2>
        <p className="m-0 text-ctl text-muted">{version.message}</p>
      </section>
    );
  const c = version.content;
  return (
    <section className={card} aria-labelledby={`rev-${title}`}>
      <h2 id={`rev-${title}`} className={h2}>
        {title}{" "}
        <span className="text-ctl font-normal text-muted">
          (revision {version.version_no}, {version.state.replace("_", " ")})
        </span>
      </h2>
      <dl className="m-0">
        <Row label="Title">{c.title || "-"}</Row>
        <Row label="Organisation">{version.organisation.name}</Row>
        <Row label="Summary">{c.summary || "-"}</Row>
        <Row label="Description">{c.description_md || "-"}</Row>
        {c.requirements_md ? <Row label="Requirements">{c.requirements_md}</Row> : null}
        <Row label="Locations">
          {c.locations.map((l) => l.name + (l.is_primary ? " (primary)" : "")).join(", ") ||
            c.location_text ||
            "-"}
        </Row>
        <Row label="Arrangement and type">
          {[c.work_mode, c.employment_type, c.experience_level]
            .filter(Boolean)
            .map((v) => humanise(String(v)))
            .join(" · ") || "-"}
        </Row>
        {c.geographic_eligibility ? <Row label="Who may apply">{c.geographic_eligibility}</Row> : null}
        {money(c.salary) ? <Row label="Pay">{money(c.salary)}</Row> : null}
        {money(c.funding) ? <Row label="Funding">{money(c.funding)}</Row> : null}
        <Row label="Deadline">
          {c.deadline_at
            ? `${dateTimeText(c.deadline_at)}${c.deadline_is_date_only ? " (date only: end of day)" : ""}`
            : "Not stated"}
        </Row>
        <Row label="How to apply">{`${humanise(c.application_method)}: ${c.application_url || c.application_email || c.application_instructions || "-"}`}</Row>
        {c.reference_number ? <Row label="Reference">{c.reference_number}</Row> : null}
        {Object.keys(c.detail).length ? (
          <Row label="Category details">
            {Object.entries(c.detail)
              .map(([k, v]) => `${humanise(k)}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
              .join("\n")}
          </Row>
        ) : null}
        <Row label="Sources">
          {c.sources.length
            ? c.sources
                .map(
                  (s) =>
                    `${s.name} [${humanise(s.kind)}]${s.is_primary ? " primary" : ""}, checked ${s.observed_on}${s.url ? `, ${s.url}` : ""}`,
                )
                .join("\n")
            : "None yet"}
        </Row>
        <Row label="People">
          {[
            `Author: ${version.author}`,
            version.submitted_by
              ? `Submitted by ${version.submitted_by} on ${dateTimeText(version.submitted_at)}`
              : null,
            version.approved_by
              ? `Approved by ${version.approved_by} on ${dateTimeText(version.approved_at)}`
              : null,
          ]
            .filter(Boolean)
            .join("\n")}
        </Row>
        <Row label="Content fingerprint">{version.fingerprint ?? "Set at submission"}</Row>
      </dl>
    </section>
  );
}

export default async function OpportunityPage({ params, searchParams }: Props) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { do: initial } = await searchParams;
  await requireStaff(`/workspace/opportunities/${id}`);
  const result = await staffJson<ListingDetail>(`opportunities/${id}`);
  if (!result.ok) {
    if (result.status === 404) notFound();
    throw new Error("The opportunity could not be loaded.");
  }
  const o = result.data;
  const open = o.pending && !o.pending.hidden ? o.pending : o.live && !o.live.hidden ? o.live : null;
  return (
    <>
      <p className="m-0 text-ctl">
        <Link href="/workspace/opportunities" className="text-accent underline">
          ← Opportunities
        </Link>
      </p>
      <div className="mt-3 mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="m-0 mb-2 text-section font-light tracking-section [overflow-wrap:anywhere]">
            {o.title}
          </h1>
          <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-ctl text-muted">
            <StatusBadge tone={o.status_tone}>{o.status_label}</StatusBadge>
            <span>{o.category.name}</span>
            <span>{o.organisation ?? "-"}</span>
            <span>Closing: {dateText(o.closing)}</span>
            <span>{o.verification_label}</span>
          </p>
        </div>
        {o.public_path ? (
          <a href={o.public_path} target="_blank" rel="noopener" className="text-ctl text-accent underline">
            View on the public site<span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : null}
      </div>

      {o.warnings.map((w) => (
        <p
          key={w}
          role="note"
          className="m-0 mb-3 rounded-card border border-urgent/40 bg-urgent-bg p-3 text-ctl text-urgent"
        >
          {w}
        </p>
      ))}

      <section aria-labelledby="actions-title" className={`${card} mb-4`}>
        <h2 id="actions-title" className={h2}>
          What you can do now
        </h2>
        <ActionPanel
          id={o.id}
          rowVersion={o.row_version}
          actions={o.actions}
          initial={initial}
          defaults={{ version_no: open && !open.hidden ? open.version_no : "" }}
        />
      </section>

      <div className="grid gap-4">
        <Revision title="Revision being worked on" version={o.pending} />
        <Revision title="Live revision" version={o.live} />

        <section className={card} aria-labelledby="verif-title">
          <h2 id="verif-title" className={h2}>
            Verification records
          </h2>
          {o.verifications.length ? (
            <ul className="m-0 grid list-none gap-3 p-0">
              {o.verifications.map((v, i) => (
                <li key={i} className="border-t border-line pt-3 text-ctl">
                  <p className="m-0">
                    Revision {v.version_no}: {humanise(v.level)} by {humanise(v.method)}, outcome{" "}
                    {humanise(v.outcome)}.
                  </p>
                  <p className="m-0 mt-1 whitespace-pre-wrap text-muted">{v.evidence_note}</p>
                  <p className="m-0 mt-1 text-small text-muted">
                    {v.checked_by}, {dateTimeText(v.checked_at)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-ctl text-muted">
              No verification has been recorded. Source and verification are separate: a listing can have
              sources and still be unverified.
            </p>
          )}
        </section>

        <section className={card} aria-labelledby="history-title">
          <h2 id="history-title" className={h2}>
            History
          </h2>
          {o.history.length ? (
            <ol className="m-0 grid list-none gap-2 p-0">
              {o.history.map((h, i) => (
                <li
                  key={i}
                  className="grid gap-1 border-t border-line pt-2 text-ctl sm:grid-cols-[190px_1fr]"
                >
                  <span className="text-muted tabular-nums">{dateTimeText(h.at)}</span>
                  <span>
                    <strong className="font-normal">{h.what}</strong> by {h.actor}
                    {h.reason ? (
                      <span className="block whitespace-pre-wrap text-muted">{h.reason}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="m-0 text-ctl text-muted">No history to show.</p>
          )}
        </section>
      </div>
    </>
  );
}
