import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionPanel } from "@/components/workspace/action-panel";
import { dateTimeText, StatusBadge } from "@/components/workspace/badges";
import { TeamNameForm } from "@/components/workspace/team-name-form";
import { humanise } from "@/lib/format";
import { can, requireStaff, staffJson } from "@/lib/staff";
import type { TeamMember } from "@/lib/team-types";

export const metadata: Metadata = { title: "Staff profile" };
type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ invited?: string; do?: string }> };

const card = "rounded-card border border-border-panel bg-surface p-4 shadow-subtle";
const h2 = "m-0 mb-3 text-title font-normal tracking-title";
const th =
  "border-t border-line bg-surface-pale px-[12px] py-[8px] text-left text-small font-normal text-muted";
const td = "border-t border-line px-[12px] py-[8px] align-top text-ctl [overflow-wrap:anywhere]";

const AREAS: Record<string, string> = {
  opp: "Listings",
  org: "Organisations",
  employer: "Employers",
  report: "Reports",
  user: "Staff",
  audit: "Audit",
  taxonomy: "Categories and places",
  settings: "Settings",
};
/** "opp.review.approve" as "Listings: review approve". */
const permissionLabel = (code: string): string => {
  const [area = "", ...rest] = code.split(".");
  return `${AREAS[area] ?? humanise(area)}: ${rest.join(" ").replace(/_/g, " ")}`;
};

const detailText = (details: Record<string, unknown> | null): string => {
  if (!details) return "";
  return Object.entries(details)
    .map(([k, v]) => `${humanise(k.replace(/_/g, " "))}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
    .join(" · ");
};

export default async function TeamMemberPage({ params, searchParams }: Props) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { invited, do: initial } = await searchParams;
  const session = await requireStaff(`/workspace/team/${id}`);
  if (!can(session, "user.status.change")) notFound();
  const result = await staffJson<TeamMember>(`team/${id}`);
  if (!result.ok) {
    if (result.status === 404 || result.status === 403) notFound();
    throw new Error("The staff profile could not be loaded.");
  }
  const m = result.data;
  const removed = m.status.code === "removed";
  const stats: [string, number][] = [
    ["Listings created", m.stats.created],
    ["Edited", m.stats.edited],
    ["Submitted", m.stats.submitted],
    ["Reviewed", m.stats.reviewed],
    ["Verified", m.stats.verified],
    ["Published", m.stats.published],
  ];
  const facts: [string, string][] = [
    ["Email", m.email],
    ["Role", m.role?.label ?? "-"],
    ["Account created", dateTimeText(m.joined)],
    ["Last login", m.last_login ? dateTimeText(m.last_login) : "Never"],
    ["Email verified", m.email_verified ? "Yes" : "No"],
    ["Two-step verification", m.two_step ? "Set up" : "Not set up yet"],
    ...(m.invited_by ? ([["Invited by", m.invited_by]] as [string, string][]) : []),
    ...(m.invitation_expires_at
      ? ([
          [
            m.status.code === "invitation_expired" ? "Invitation expired" : "Invitation expires",
            dateTimeText(m.invitation_expires_at),
          ],
        ] as [string, string][])
      : []),
  ];

  return (
    <>
      <p className="m-0 text-ctl">
        <Link href="/workspace/team" className="text-accent underline">
          ← Staff management
        </Link>
      </p>
      <div className="mt-3 mb-4 flex flex-wrap items-center gap-3">
        <h1 className="m-0 text-section font-light tracking-section [overflow-wrap:anywhere]">{m.name}</h1>
        <StatusBadge tone={m.status.tone}>{m.status.label}</StatusBadge>
        {m.is_you ? <span className="text-ctl text-muted">This is your account</span> : null}
      </div>

      {invited ? (
        <p
          role="status"
          className="m-0 mb-3 rounded-card border border-good/35 bg-good-bg p-3 text-ctl text-good"
        >
          Invitation sent. The link works once and expires in 3 days.
        </p>
      ) : null}
      {m.protected.last_administrator ? (
        <p
          role="note"
          className="m-0 mb-3 rounded-card border border-urgent/40 bg-urgent-bg p-3 text-ctl text-urgent"
        >
          This is the only active Administrator, so the role and account are protected. Make someone else an
          Administrator before changing them.
        </p>
      ) : null}
      {m.protected.self && !m.protected.last_administrator ? (
        <p role="note" className="m-0 mb-3 rounded-card border border-line bg-surface-pale p-3 text-ctl">
          You cannot change or remove your own access. Ask another Administrator.
        </p>
      ) : null}

      {m.actions.length ? (
        <section aria-labelledby="actions-title" className={`${card} mb-4`}>
          <h2 id="actions-title" className={h2}>
            What you can do now
          </h2>
          <ActionPanel
            endpoint={`staff/team/${m.id}/actions`}
            rowVersion={null}
            actions={m.actions}
            initial={initial}
            noActionsText="No actions are available for this account."
          />
        </section>
      ) : null}

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <section className={card} aria-labelledby="profile-title">
          <h2 id="profile-title" className={h2}>
            Profile
          </h2>
          <dl className="m-0">
            {facts.map(([label, value]) => (
              <div
                key={label}
                className="grid gap-1 border-t border-line py-2 sm:grid-cols-[170px_1fr] sm:gap-4"
              >
                <dt className="text-ctl text-muted">{label}</dt>
                <dd className="m-0 text-ctl [overflow-wrap:anywhere]">{value}</dd>
              </div>
            ))}
          </dl>
          {!removed ? (
            <div className="mt-3">
              <TeamNameForm id={m.id} name={m.name} />
            </div>
          ) : null}
        </section>

        <section className={card} aria-labelledby="perm-title">
          <h2 id="perm-title" className={h2}>
            Role and permissions
          </h2>
          <p className="m-0 mb-2 text-ctl">
            <span className="font-strong">{m.role?.label ?? "No role"}</span>
            {m.role_summary ? <span className="text-muted">: {m.role_summary}</span> : null}
          </p>
          {m.permissions.length ? (
            <ul className="m-0 grid list-none grid-cols-1 gap-x-4 gap-y-1 p-0 text-small sm:grid-cols-2">
              {m.permissions.map((p) => (
                <li key={p}>{permissionLabel(p)}</li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-ctl text-muted">No permissions: staff access has ended.</p>
          )}
          <p className="m-0 mt-3 text-small text-muted">
            Permissions come from the role. Review and verification always need someone other than the author.
          </p>
        </section>
      </div>

      <section className={`${card} mb-4`} aria-labelledby="work-title">
        <h2 id="work-title" className={h2}>
          Listing work
        </h2>
        <ul className="m-0 mb-3 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-6">
          {stats.map(([label, value]) => (
            <li key={label} className="rounded-card border border-line bg-surface-pale p-3">
              <p className="m-0 text-small text-muted">{label}</p>
              <p className="m-0 mt-1 text-[1.5rem] leading-none font-light tabular-nums">{value}</p>
            </li>
          ))}
        </ul>
        {m.recent_listings.length ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <caption className="sr-only">Recent listing work</caption>
              <thead>
                <tr>
                  <th scope="col" className={th}>
                    Listing
                  </th>
                  <th scope="col" className={th}>
                    What
                  </th>
                  <th scope="col" className={th}>
                    When
                  </th>
                </tr>
              </thead>
              <tbody>
                {m.recent_listings.map((r, i) => (
                  <tr key={`${r.id}-${i}`}>
                    <td className={td}>
                      <Link href={r.href} className="text-accent hover:underline">
                        {r.title}
                      </Link>
                    </td>
                    <td className={td}>{r.what}</td>
                    <td className={`${td} whitespace-nowrap tabular-nums`}>{dateTimeText(r.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="m-0 text-ctl text-muted">No listing work yet.</p>
        )}
      </section>

      <div className="mb-4 grid gap-4 lg:grid-cols-[5fr_7fr]">
        <section className={card} aria-labelledby="sessions-title">
          <h2 id="sessions-title" className={h2}>
            Active sessions
          </h2>
          {m.sessions.length ? (
            <ul className="m-0 grid list-none gap-2 p-0 text-ctl">
              {m.sessions.map((s) => (
                <li key={s.id} className="border-t border-line pt-2">
                  {s.device}
                  <span className="block text-small text-muted">Last seen {dateTimeText(s.last_seen)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-ctl text-muted">Not signed in anywhere.</p>
          )}
        </section>

        <section className={card} aria-labelledby="activity-title">
          <h2 id="activity-title" className={h2}>
            Recent activity
          </h2>
          {m.activity.data.length ? (
            <ol className="m-0 grid list-none gap-0 p-0">
              {m.activity.data.map((a) => (
                <li key={a.id} className="border-t border-line py-2 text-ctl">
                  <p className="m-0">
                    <span className="font-strong">{a.what}</span>
                    {a.target && a.target !== m.name ? <span> · {a.target}</span> : null}
                  </p>
                  <p className="m-0 text-small text-muted">
                    {a.actor === m.name ? "By this person" : `By ${a.actor}`} · {dateTimeText(a.at)}
                    {a.details ? <span className="block">{detailText(a.details)}</span> : null}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="m-0 text-ctl text-muted">No recorded activity yet.</p>
          )}
          {can(session, "audit.read_all") ? (
            <p className="m-0 mt-3 text-small">
              <Link href={`/workspace/records/audit?q=${m.id}`} className="text-accent underline">
                Open the full audit log for this person
              </Link>
            </p>
          ) : null}
        </section>
      </div>
    </>
  );
}
