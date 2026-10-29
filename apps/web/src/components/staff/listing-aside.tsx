import { Card, Facts, StatusBadge } from "./primitives";
import { Tag } from "@/components/ui";
import { formatDateTime, words } from "@/lib/staff-format";
import type { OpportunityDetail } from "@/lib/staff-types";

/** Read-only context beside the editor: where the listing stands, who did what, and the history. */
export function ListingAside({ detail }: { detail: OpportunityDetail }) {
  const v = detail.version;
  return (
    <aside aria-label="Listing status and history" className="grid content-start gap-4">
      <Card>
        <h2 className="mb-3 text-lead tracking-title">Status</h2>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <StatusBadge status={detail.status} />
          {detail.employer_owned ? <Tag tone="accent">Employer submission</Tag> : null}
          {v.direct_publication ? <Tag>Direct publication</Tag> : null}
        </div>
        <Facts
          items={[
            { label: "Revision", value: `v${v.number} (${words(v.state)})` },
            { label: "Author", value: v.author?.name ?? "-" },
            ...(v.submitted_by ? [{ label: "Submitted by", value: v.submitted_by.name }] : []),
            ...(v.approved_by
              ? [
                  {
                    label: v.direct_publication ? "Self-approved by" : "Approved by",
                    value: v.approved_by.name,
                  },
                ]
              : []),
            ...(v.published_by ? [{ label: "Published by", value: v.published_by.name }] : []),
            {
              label: "Organisation",
              value: `${detail.organisation.name} (${detail.organisation.verified ? "verified employer" : "entered by staff"})`,
            },
          ]}
        />
        {detail.public_path ? (
          <p className="mt-4 text-ctl">
            <a href={detail.public_path} className="text-accent underline">
              View on the public site
            </a>
          </p>
        ) : null}
      </Card>

      {detail.decisions.length ? (
        <Card>
          <h2 className="mb-3 text-lead tracking-title">Reviews</h2>
          <ul className="grid gap-3 text-ctl">
            {detail.decisions.map((d, i) => (
              <li key={i}>
                <p>
                  <strong className="font-medium">{words(d.decision)}</strong> by {d.decided_by?.name} ·
                  revision {d.version_no}
                </p>
                <p className="tnum text-small text-muted">{formatDateTime(d.decided_at)}</p>
                {d.reason ? <p className="mt-1 text-muted">{d.reason}</p> : null}
                {d.checklist && (d.checklist as Record<string, unknown>).direct_publication ? (
                  <p className="mt-1 text-small text-muted">
                    Recorded as a direct, self-approved publication.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <h2 className="mb-3 text-lead tracking-title">History</h2>
        {detail.history.length === 0 ? (
          <p className="text-ctl text-muted">No history yet.</p>
        ) : (
          <ol className="grid gap-3 text-ctl">
            {detail.history.map((e, i) => (
              <li key={i} className="border-l-2 border-line pl-3">
                <p>
                  {e.label} <span className="text-muted">by {e.actor?.name ?? "System"}</span>
                </p>
                <p className="tnum text-small text-muted">{formatDateTime(e.at)}</p>
                {e.reason ? <p className="mt-0.5 text-small text-muted">{e.reason}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </aside>
  );
}
