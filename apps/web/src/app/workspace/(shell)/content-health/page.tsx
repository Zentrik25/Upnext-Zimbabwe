import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StatusBadge } from "@/components/workspace/badges";
import { can, requireStaff, staffJson } from "@/lib/staff";
import type { ContentHealth } from "@/lib/staff-types";
import { humanise } from "@/lib/format";

export const metadata: Metadata = { title: "Content health" };
const card = "rounded-card border border-border-panel bg-surface p-4 shadow-subtle";
const h2 = "m-0 mb-3 text-title font-normal tracking-title";

export default async function ContentHealthPage() {
  const session = await requireStaff("/workspace/content-health");
  if (!can(session, "opp.review.approve")) redirect("/workspace");
  const result = await staffJson<ContentHealth>("content-health");
  if (!result.ok) throw new Error("Content health could not be loaded.");
  const d = result.data;
  const t = d.target;
  return (
    <>
      <h1 className="m-0 mb-1 text-section font-light tracking-section">Content health</h1>
      <p className="m-0 mb-4 max-w-[70ch] text-base text-muted">
        Progress towards the launch content target and the freshness of what is live. Read only.
      </p>
      <section className={`${card} mb-4`} aria-labelledby="target-title">
        <h2 id="target-title" className={h2}>
          Launch target{" "}
          <StatusBadge tone={t.met ? "success" : "warning"}>
            {t.met ? "Target met" : "Target not met"}
          </StatusBadge>
        </h2>
        <ul className="m-0 grid list-none gap-2 p-0 text-ctl">
          <li>
            Live, open and source-checked listings:{" "}
            <strong className="font-normal tabular-nums">{t.listings.current_source_checked}</strong> of{" "}
            {t.listings.goal} (live and open: {t.listings.current_live}).
          </li>
          <li>
            Distinct issuers: <strong className="font-normal tabular-nums">{t.issuers.have}</strong> of{" "}
            {t.issuers.goal}.
          </li>
          <li>
            Categories covered: <strong className="font-normal tabular-nums">{t.categories.covered}</strong>{" "}
            of {t.categories.goal}
            {t.categories.missing.length ? ` (missing: ${t.categories.missing.join(", ")})` : ""}.
          </li>
        </ul>
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        <section className={card} aria-labelledby="cat-title">
          <h2 id="cat-title" className={h2}>
            Live and open listings per category
          </h2>
          <table className="w-full border-collapse text-ctl">
            <caption className="sr-only">Live and open listings per category</caption>
            <thead>
              <tr>
                <th scope="col" className="py-1 text-left font-normal text-muted">
                  Category
                </th>
                <th scope="col" className="py-1 text-right font-normal text-muted">
                  Live
                </th>
              </tr>
            </thead>
            <tbody>
              {d.live_per_category.map((c) => (
                <tr key={c.code} className="border-t border-line">
                  <th scope="row" className="py-1 text-left font-normal">
                    {humanise(c.code.replace(/-/g, " "))}
                  </th>
                  <td className="py-1 text-right tabular-nums">{c.live}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className={card} aria-labelledby="fresh-title">
          <h2 id="fresh-title" className={h2}>
            Queues and freshness
          </h2>
          <ul className="m-0 grid list-none gap-2 p-0 text-ctl">
            <li>
              In the pipeline:{" "}
              {d.pipeline.length
                ? d.pipeline.map((p) => `${humanise(p.status)} ${p.count}`).join(", ")
                : "nothing"}
              .
            </li>
            <li>
              Oldest revision waiting for review:{" "}
              {d.oldest_waiting_review_hours === null ? "none" : `${d.oldest_waiting_review_hours} hours`}.
            </li>
            <li>Closing within 7 days: {d.closing_within_7_days}.</li>
            <li>Unknown deadline for over 30 days: {d.unknown_deadline_over_30_days}.</li>
            <li>Live but not verified: {d.live_not_verified}.</li>
            <li>
              Separation-of-duties check:{" "}
              {d.sod_violations.length ? (
                <StatusBadge tone="danger">{d.sod_violations.length} violations</StatusBadge>
              ) : (
                <StatusBadge tone="success">No violations</StatusBadge>
              )}
            </li>
          </ul>
        </section>
      </div>
    </>
  );
}
