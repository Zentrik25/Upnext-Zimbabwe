import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { StatusBadge } from "@/components/workspace/badges";
import { SeoRetry } from "@/components/workspace/seo-retry";
import { formatDate, humanise } from "@/lib/format";
import { can, requireStaff, staffJson } from "@/lib/staff";
import type { SeoIssue, SeoNotification, SeoOverview } from "@/lib/staff-types";

export const metadata: Metadata = { title: "SEO monitoring" };
const card = "rounded-card border border-border-panel bg-surface p-4 shadow-subtle";
const h2 = "m-0 mb-3 text-title font-normal tracking-title";
const th = "py-1 pr-3 text-left font-normal text-muted";
const STATUSES = ["dead", "failed", "pending", "sent", "superseded"] as const;

/** Plain-language names of the structured-data checks (`apps/api/indexing/monitoring.py`). */
const ISSUE_TEXT: Record<SeoIssue["code"], string> = {
  no_place: "No town, city or “Zimbabwe” stated: the page carries no JobPosting",
  remote_without_country: "Remote with no “Zimbabwe” location: the page carries no JobPosting",
  no_description: "No description: Google requires one",
  no_deadline: "No closing date (validThrough recommended)",
  no_employment_type: "No employment type (recommended)",
  no_salary: "No pay stated (baseSalary recommended; never estimate it)",
};

const MODE_TEXT: Record<SeoOverview["mode"], string> = {
  off: "Off: nothing is queued or sent.",
  record: "Record: notifications are queued for inspection; nothing is sent to Google.",
  live: "Live: queued notifications are sent to Google by the worker every 5 minutes, within the daily quota.",
};

type Props = { searchParams: Promise<{ status?: string }> };

function when(iso: string | null): string {
  return iso ? formatDate(iso, "Africa/Harare", true) : "never";
}

export default async function SeoPage({ searchParams }: Props) {
  const session = await requireStaff("/workspace/seo");
  if (!can(session, "settings.manage")) redirect("/workspace");
  const { status: raw } = await searchParams;
  const status = STATUSES.find((s) => s === raw);
  const [overview, recent] = await Promise.all([
    staffJson<SeoOverview>("seo"),
    staffJson<{ data: SeoNotification[] }>(`seo/notifications${status ? `?status=${status}` : ""}`),
  ]);
  if (!overview.ok || !recent.ok) throw new Error("SEO monitoring could not be loaded.");
  const d = overview.data;
  const n = d.notifications;
  return (
    <>
      <h1 className="m-0 mb-1 text-section font-light tracking-section">SEO monitoring</h1>
      <p className="m-0 mb-4 max-w-[75ch] text-base text-muted">
        What UPNEXT has asked Google to crawl and how Google answered the request. A sent notification means
        Google received it, <strong className="font-normal">not</strong> that the page is indexed or ranked:
        check indexing in Google Search Console.
      </p>

      <section className={`${card} mb-4`} aria-labelledby="mode-title">
        <h2 id="mode-title" className={h2}>
          Indexing API{" "}
          <StatusBadge tone={d.mode === "live" ? "success" : d.mode === "record" ? "info" : "neutral"}>
            {humanise(d.mode)}
          </StatusBadge>
        </h2>
        <p className="m-0 mb-3 text-ctl">{MODE_TEXT[d.mode]}</p>
        <dl className="m-0 grid grid-cols-2 gap-3 text-ctl sm:grid-cols-4">
          {(
            [
              ["Waiting", n.waiting],
              ["Sent (accepted by Google)", n.sent],
              ["Failed, retrying", n.failed],
              ["Dead (needs a person)", n.dead],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="text-small text-muted">{label}</dt>
              <dd className="m-0 text-title tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <ul className="m-0 mt-3 grid list-none gap-1 p-0 text-ctl">
          <li>Last accepted submission: {when(n.last_sent_at)}.</li>
          <li>
            Quota used today (Pacific day): <span className="tabular-nums">{d.quota.used_today}</span> of{" "}
            {d.quota.limit}.
          </li>
          <li>
            Last sending run:{" "}
            {d.last_run ? (
              <>
                {when(d.last_run.finished_at)}{" "}
                <StatusBadge tone={d.last_run.status === "ok" ? "success" : "danger"}>
                  {d.last_run.status === "ok" ? "OK" : "Failed"}
                </StatusBadge>
                {d.last_run.detail ? ` ${d.last_run.detail}` : ""}
              </>
            ) : (
              "none yet"
            )}
            .
          </li>
          <li>
            Oldest waiting:{" "}
            {n.oldest_waiting_seconds === null
              ? "none"
              : `${Math.round(n.oldest_waiting_seconds / 60)} minutes`}
            .
          </li>
        </ul>
        {n.dead > 0 ? (
          <div className="mt-3">
            <SeoRetry label="Retry all dead notifications" />
          </div>
        ) : null}
      </section>

      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <section className={card} aria-labelledby="listings-title">
          <h2 id="listings-title" className={h2}>
            Job listings and the sitemap
          </h2>
          <ul className="m-0 grid list-none gap-2 p-0 text-ctl">
            <li>
              Open job, internship and graduate listings:{" "}
              <span className="tabular-nums">{d.listings.open_jobs}</span>.
            </li>
            <li>
              With valid JobPosting markup (Google for Jobs eligible):{" "}
              <span className="tabular-nums">{d.listings.eligible_for_job_posting}</span>.
            </li>
            <li>
              Job listings in the sitemap: <span className="tabular-nums">{d.listings.jobs_in_sitemap}</span>{" "}
              (all listings: {d.listings.listings_in_sitemap}).
            </li>
          </ul>
        </section>
        <section className={card} aria-labelledby="gsc-title">
          <h2 id="gsc-title" className={h2}>
            Search Console{" "}
            <StatusBadge tone="neutral">
              {d.search_console.connected ? "Connected" : "Not connected"}
            </StatusBadge>
          </h2>
          <p className="m-0 text-ctl">
            Impressions, clicks and indexed pages are not available here: no Search Console API connection
            exists. Read them in Google Search Console (Performance, Pages and Job postings reports).
          </p>
        </section>
      </div>

      <section className={`${card} mb-4`} aria-labelledby="sd-title">
        <h2 id="sd-title" className={h2}>
          Structured data{" "}
          <StatusBadge tone={d.structured_data.errors ? "danger" : "success"}>
            {d.structured_data.errors} {d.structured_data.errors === 1 ? "error" : "errors"}
          </StatusBadge>{" "}
          <StatusBadge tone={d.structured_data.warnings ? "warning" : "neutral"}>
            {d.structured_data.warnings} {d.structured_data.warnings === 1 ? "warning" : "warnings"}
          </StatusBadge>
        </h2>
        <p className="m-0 mb-3 text-small text-muted">
          Open job listings only. Add a missing fact only when the issuer stated it; never invent a place, pay
          or date.
        </p>
        {d.structured_data.listings.length ? (
          <table className="w-full border-collapse text-ctl">
            <caption className="sr-only">Listings with structured-data errors or warnings</caption>
            <thead>
              <tr>
                <th scope="col" className={th}>
                  Listing
                </th>
                <th scope="col" className={th}>
                  Findings
                </th>
              </tr>
            </thead>
            <tbody>
              {d.structured_data.listings.map((row) => (
                <tr key={row.opportunity_id} className="border-t border-line align-top">
                  <th scope="row" className="py-1 pr-3 text-left font-normal">
                    <Link href={`/workspace/opportunities/${row.opportunity_id}`} className="text-accent">
                      {row.title}
                    </Link>
                  </th>
                  <td className="py-1">
                    <ul className="m-0 grid list-none gap-1 p-0">
                      {row.issues.map((issue) => (
                        <li key={issue.code}>
                          <StatusBadge tone={issue.level === "error" ? "danger" : "warning"}>
                            {issue.level === "error" ? "Error" : "Warning"}
                          </StatusBadge>{" "}
                          {ISSUE_TEXT[issue.code]}
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="m-0 text-ctl">No findings.</p>
        )}
      </section>

      <section className={card} aria-labelledby="queue-title">
        <h2 id="queue-title" className={h2}>
          Latest notifications
        </h2>
        <nav aria-label="Filter notifications" className="mb-3 flex flex-wrap gap-2 text-small">
          <Link href="/workspace/seo" aria-current={status ? undefined : "page"} className="text-accent">
            All
          </Link>
          {STATUSES.map((s) => (
            <Link
              key={s}
              href={`/workspace/seo?status=${s}`}
              aria-current={status === s ? "page" : undefined}
              className="text-accent"
            >
              {humanise(s)}
            </Link>
          ))}
        </nav>
        {recent.data.data.length ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-ctl">
              <caption className="sr-only">Latest Indexing API notifications</caption>
              <thead>
                <tr>
                  <th scope="col" className={th}>
                    Address
                  </th>
                  <th scope="col" className={th}>
                    Request
                  </th>
                  <th scope="col" className={th}>
                    Status
                  </th>
                  <th scope="col" className={th}>
                    Queued
                  </th>
                  <th scope="col" className={th}>
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {recent.data.data.map((row) => (
                  <tr key={row.id} className="border-t border-line align-top">
                    <td className="max-w-[28ch] break-all py-1 pr-3">{new URL(row.url).pathname}</td>
                    <td className="py-1 pr-3">
                      {row.action === "URL_UPDATED" ? "Updated" : "Removed"} ({row.transition})
                    </td>
                    <td className="py-1 pr-3">
                      <StatusBadge
                        tone={
                          row.status === "sent"
                            ? "success"
                            : row.status === "dead"
                              ? "danger"
                              : row.status === "failed"
                                ? "warning"
                                : "neutral"
                        }
                      >
                        {humanise(row.status)}
                      </StatusBadge>
                      {row.last_error ? (
                        <span className="block text-small text-muted">{row.last_error}</span>
                      ) : null}
                      {row.attempts ? (
                        <span className="block text-small text-muted">Attempts: {row.attempts}</span>
                      ) : null}
                    </td>
                    <td className="py-1 pr-3">{when(row.created_at)}</td>
                    <td className="py-1">
                      {row.status === "dead" || row.status === "failed" ? <SeoRetry id={row.id} /> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="m-0 text-ctl">No notifications{status ? ` with status ${humanise(status)}` : ""}.</p>
        )}
      </section>
    </>
  );
}
