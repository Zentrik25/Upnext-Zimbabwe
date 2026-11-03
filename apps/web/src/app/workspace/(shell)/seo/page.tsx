import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StatusBadge } from "@/components/workspace/badges";
import { can, requireStaff, staffJson } from "@/lib/staff";
import { formatDateTime } from "@/lib/staff-format";
import type { SeoMetrics, SeoReport, SeoSubmission } from "@/lib/staff-types";

export const metadata: Metadata = { title: "SEO and indexing" };
const card = "rounded-card border border-border-panel bg-surface p-4 shadow-subtle";
const h2 = "m-0 mb-3 text-title font-normal tracking-title";
const th = "py-1 pr-3 text-left font-normal text-muted";
const td = "py-1 pr-3 align-top";

const pct = (ctr: number) => `${(ctr * 100).toFixed(1)}%`;
const num = (n: number) => n.toLocaleString("en-GB");
const STATUS_TONE = {
  sent: "success",
  pending: "neutral",
  retry: "warning",
  dead: "danger",
  skipped: "muted",
} as const;
const STATUS_LABEL: Record<SeoSubmission["status"], string> = {
  sent: "Accepted by Google",
  pending: "Queued",
  retry: "Will retry",
  dead: "Failed",
  skipped: "Not sent",
};

/** Four different things, kept apart on purpose: a queued notification, Google accepting it, Google reporting a page
 *  as indexed, and search impressions and clicks. Nothing on this page turns one into another. */
export default async function SeoPage() {
  const session = await requireStaff("/workspace/seo");
  if (!can(session, "settings.manage")) redirect("/workspace");
  const result = await staffJson<SeoReport>("seo");
  if (!result.ok) throw new Error("The SEO report could not be loaded.");
  const { submissions: sub, search_console: sc, definitions } = result.data;
  return (
    <>
      <h1 className="m-0 mb-1 text-section font-light tracking-section">SEO and indexing</h1>
      <p className="m-0 mb-4 max-w-[70ch] text-base text-muted">
        Read only. Nothing here sends anything to Google; submissions are switched on by configuration after
        the owner approves them.
      </p>
      <section className={`${card} mb-4`} aria-labelledby="defs-title">
        <h2 id="defs-title" className={h2}>
          What the numbers mean
        </h2>
        <dl className="m-0 grid gap-2 text-ctl">
          {(
            [
              ["Queued", definitions.queued],
              ["Accepted by Google", definitions.accepted],
              ["Indexed", definitions.indexed],
              ["Impressions", definitions.impressions],
              ["Clicks", definitions.clicks],
            ] as const
          ).map(([term, text]) => (
            <div key={term}>
              <dt className="inline font-normal text-ink">{term}: </dt>
              <dd className="ml-0 inline text-muted">{text}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={`${card} mb-4`} aria-labelledby="idx-title">
        <h2 id="idx-title" className={h2}>
          Indexing API submissions{" "}
          <StatusBadge tone={sub.enabled ? "success" : "neutral"}>
            {sub.enabled ? "Submissions on" : "Submissions off"}
          </StatusBadge>
        </h2>
        <ul className="m-0 mb-3 grid list-none gap-1 p-0 text-ctl">
          <li>
            Service account key:{" "}
            {sub.credentials === "ok" ? (
              <>
                configured for <strong className="font-normal">{sub.service_account}</strong>
              </>
            ) : sub.credentials === "missing" ? (
              "not configured"
            ) : (
              <StatusBadge tone="danger">configured but unusable</StatusBadge>
            )}
            .
          </li>
          <li>
            Accepted in the last 24 hours:{" "}
            <strong className="font-normal tabular-nums">
              {sub.sent_last_24h} of {sub.daily_limit}
            </strong>{" "}
            (our own daily limit).
          </li>
          <li>
            Queue:{" "}
            {Object.entries(sub.counts)
              .map(([k, v]) => `${STATUS_LABEL[k as SeoSubmission["status"]] ?? k} ${v}`)
              .join(", ")}
            {sub.oldest_open_at ? `. Oldest waiting since ${formatDateTime(sub.oldest_open_at)}` : ""}.
          </li>
          {!sub.enabled ? (
            <li className="text-muted">
              While submissions are off, notifications are recorded and wait; stale ones are dropped, never
              sent late.
            </li>
          ) : null}
        </ul>
        {sub.recent.length === 0 ? (
          <p className="m-0 text-ctl text-muted">No notification has been recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-ctl">
              <caption className="sr-only">Most recent Indexing API notifications</caption>
              <thead>
                <tr>
                  <th scope="col" className={th}>
                    Queued
                  </th>
                  <th scope="col" className={th}>
                    Page
                  </th>
                  <th scope="col" className={th}>
                    Notification
                  </th>
                  <th scope="col" className={th}>
                    Result
                  </th>
                  <th scope="col" className={th}>
                    Detail
                  </th>
                </tr>
              </thead>
              <tbody>
                {sub.recent.map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className={`${td} whitespace-nowrap`}>{formatDateTime(r.created_at)}</td>
                    <td className={`${td} break-all`}>{r.url.replace(/^https?:\/\/[^/]+/, "")}</td>
                    <td className={td}>
                      {r.kind === "URL_UPDATED" ? "Updated" : "Removed"} ({r.trigger})
                    </td>
                    <td className={td}>
                      <StatusBadge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusBadge>
                      {r.sent_at ? (
                        <span className="ml-2 text-muted">{formatDateTime(r.sent_at)}</span>
                      ) : null}
                      {r.next_attempt_at && r.status === "retry" ? (
                        <span className="ml-2 text-muted">next {formatDateTime(r.next_attempt_at)}</span>
                      ) : null}
                    </td>
                    <td className={`${td} text-muted`}>
                      {[
                        r.http_status ? `HTTP ${r.http_status}` : null,
                        r.attempts ? `${r.attempts} tries` : null,
                        r.detail,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={card} aria-labelledby="sc-title">
        <h2 id="sc-title" className={h2}>
          Search Console{" "}
          <StatusBadge tone={sc.state === "ready" ? "success" : sc.state === "error" ? "danger" : "warning"}>
            {sc.state === "ready" ? "Connected" : sc.state === "error" ? "Google refused" : "Setup required"}
          </StatusBadge>
        </h2>
        {sc.state !== "ready" ? (
          <>
            <p className="m-0 mb-2 text-ctl">{sc.reason} No figures are shown until Google returns them.</p>
            <ol className="m-0 grid gap-1 pl-5 text-ctl">
              {sc.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="m-0 mt-3 text-small text-muted">
              Full instructions: docs/engineering/SEARCH_CONSOLE_GUIDE.md, section 7.
            </p>
          </>
        ) : (
          <>
            <p className="m-0 mb-3 text-ctl text-muted">
              {sc.site}, {sc.period.start} to {sc.period.end}. {sc.note}
            </p>
            <Totals totals={sc.totals} />
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Ranked title="Top search queries" keyLabel="Query" rows={sc.queries} />
              <Ranked title="Top landing pages" keyLabel="Page" rows={sc.pages} strip />
            </div>
            <h3 className="mt-5 mb-2 text-ctl font-normal">Sitemaps Google knows about</h3>
            {sc.sitemaps.length === 0 ? (
              <p className="m-0 text-ctl text-muted">
                No sitemap has been submitted for this property. Submit sitemap.xml in Search Console.
              </p>
            ) : (
              <table className="w-full border-collapse text-ctl">
                <caption className="sr-only">Sitemaps reported by Search Console</caption>
                <thead>
                  <tr>
                    <th scope="col" className={th}>
                      Sitemap
                    </th>
                    <th scope="col" className={th}>
                      Last read by Google
                    </th>
                    <th scope="col" className={th}>
                      Errors
                    </th>
                    <th scope="col" className={th}>
                      Warnings
                    </th>
                    <th scope="col" className={th}>
                      Addresses submitted
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sc.sitemaps.map((m) => (
                    <tr key={m.path ?? "?"} className="border-t border-line">
                      <td className={`${td} break-all`}>{m.path}</td>
                      <td className={td}>{m.pending ? "Pending" : formatDateTime(m.last_downloaded)}</td>
                      <td className={td}>{m.errors}</td>
                      <td className={td}>{m.warnings}</td>
                      <td className={td}>
                        {Object.entries(m.submitted)
                          .map(([k, v]) => `${k} ${v}`)
                          .join(", ") || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <h3 className="mt-5 mb-1 text-ctl font-normal">
              What Google reports for recently announced pages
            </h3>
            <p className="m-0 mb-2 text-small text-muted">
              A sample of at most five addresses, read from Google&apos;s URL Inspection. This, not the table
              of submissions above, is where indexing is reported. It also lists JobPosting problems Google
              found.
            </p>
            {sc.inspections.length === 0 ? (
              <p className="m-0 text-ctl text-muted">No announced page to inspect yet.</p>
            ) : (
              <ul className="m-0 grid list-none gap-3 p-0 text-ctl">
                {sc.inspections.map((i) => (
                  <li key={i.url}>
                    <span className="break-all">{i.url.replace(/^https?:\/\/[^/]+/, "")}</span>
                    <br />
                    {i.error ? (
                      <span className="text-muted">Could not be inspected ({i.error}).</span>
                    ) : (
                      <>
                        <StatusBadge tone={i.verdict === "PASS" ? "success" : "warning"}>
                          {i.verdict === "PASS" ? "Indexed" : "Not indexed"}
                        </StatusBadge>{" "}
                        <span className="text-muted">
                          {i.coverage ?? "no coverage state"}
                          {i.last_crawl ? ` · last crawled ${formatDateTime(i.last_crawl)}` : ""}
                        </span>
                        {i.rich_results_issues && i.rich_results_issues.length > 0 ? (
                          <ul className="m-0 mt-1 list-disc pl-5 text-danger">
                            {i.rich_results_issues.map((issue) => (
                              <li key={issue}>{issue}</li>
                            ))}
                          </ul>
                        ) : null}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </>
  );
}

function Totals({ totals }: { totals: SeoMetrics }) {
  const items: [string, string][] = [
    ["Impressions", num(totals.impressions)],
    ["Clicks", num(totals.clicks)],
    ["Average CTR", pct(totals.ctr)],
    ["Average position", totals.position ? totals.position.toFixed(1) : "-"],
  ];
  return (
    <dl className="m-0 grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-card border border-line p-3">
          <dt className="text-small text-muted">{label}</dt>
          <dd className="m-0 text-section tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Ranked({
  title,
  keyLabel,
  rows,
  strip = false,
}: {
  title: string;
  keyLabel: string;
  rows: ({ key: string } & SeoMetrics)[];
  strip?: boolean;
}) {
  return (
    <div>
      <h3 className="m-0 mb-2 text-ctl font-normal">{title}</h3>
      {rows.length === 0 ? (
        <p className="m-0 text-ctl text-muted">Google has no data for this period yet.</p>
      ) : (
        <table className="w-full border-collapse text-ctl">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              <th scope="col" className={th}>
                {keyLabel}
              </th>
              <th scope="col" className={`${th} text-right`}>
                Clicks
              </th>
              <th scope="col" className={`${th} text-right`}>
                Impr.
              </th>
              <th scope="col" className={`${th} text-right`}>
                Pos.
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-line">
                <th scope="row" className={`${td} break-all text-left font-normal`}>
                  {strip ? r.key.replace(/^https?:\/\/[^/]+/, "") || "/" : r.key}
                </th>
                <td className={`${td} text-right tabular-nums`}>{num(r.clicks)}</td>
                <td className={`${td} text-right tabular-nums`}>{num(r.impressions)}</td>
                <td className={`${td} text-right tabular-nums`}>{r.position.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
