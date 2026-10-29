import Link from "next/link";
import { Card, EmptyNote, PageHeader, SectionTitle, StatCard } from "@/components/staff/primitives";
import { ButtonLink } from "@/components/ui";
import { can, requireStaff, staffGet } from "@/lib/staff";
import { formatDateTime } from "@/lib/staff-format";
import type { Overview } from "@/lib/staff-types";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await requireStaff();
  const result = await staffGet<Overview>("overview");
  const first = session.user.display_name.split(" ")[0];
  if (!result.ok) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <EmptyNote>
          The overview could not be loaded. Reload the page; if it persists, contact an administrator.
        </EmptyNote>
      </>
    );
  }
  const { counts, activity } = result.data;
  const num = (key: string) => counts[key] ?? 0;
  return (
    <>
      <PageHeader
        title={`Welcome, ${first}`}
        lead="Live figures from the editorial workflow. Every count links to the list behind it."
        actions={
          can(session, "opp.draft.create") ? (
            <ButtonLink href="/staff/opportunities/new">Create Opportunity</ButtonLink>
          ) : null
        }
      />

      <section aria-labelledby="pipeline" className="mb-8">
        <SectionTitle id="pipeline">Opportunities</SectionTitle>
        <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
          <StatCard label="Published" value={num("published")} href="/staff/opportunities?view=published" />
          <StatCard
            label="Closing within 7 days"
            value={num("closing_soon")}
            href="/staff/opportunities?view=published&sort=closing&dir=asc"
          />
          <StatCard
            label="Drafts"
            value={num("drafts")}
            href="/staff/opportunities?view=drafts"
            hint={`${num("my_drafts")} yours`}
          />
          <StatCard label="Expired" value={num("expired")} href="/staff/opportunities?view=expired" />
        </div>
      </section>

      <section aria-labelledby="work" className="mb-8">
        <SectionTitle id="work">Needs attention</SectionTitle>
        <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
          {can(session, "opp.review.approve") ? (
            <StatCard label="Awaiting your review" value={num("awaiting_my_review")} href="/staff/review" />
          ) : null}
          <StatCard
            label="Approved, ready to publish"
            value={num("approved")}
            href="/staff/opportunities?view=ready"
          />
          {can(session, "employer.review") || can(session, "opp.review.approve") ? (
            <StatCard
              label="Employer submissions"
              value={num("employer_pending")}
              href="/staff/submissions"
              hint={
                counts.pending_claims != null ? `${counts.pending_claims} organisation claims` : undefined
              }
            />
          ) : null}
          {can(session, "report.read") ? (
            <StatCard label="Open reports" value={counts.open_reports ?? 0} href="/staff/reports" />
          ) : null}
        </div>
      </section>

      <section aria-labelledby="activity">
        <SectionTitle id="activity">Recent activity</SectionTitle>
        <Card className="p-0">
          {activity.length === 0 ? (
            <div className="p-5">
              <EmptyNote>No editorial activity yet.</EmptyNote>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {activity.map((item, index) => (
                <li
                  key={`${item.opportunity_id}-${index}`}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3 text-ctl max-sm:px-4"
                >
                  <span className="min-w-0">
                    <Link
                      href={`/staff/opportunities/${item.opportunity_id}`}
                      className="text-accent underline"
                    >
                      {item.title}
                    </Link>
                    <span className="text-muted">
                      {" "}
                      - {item.label} by {item.actor}
                    </span>
                  </span>
                  <span className="tnum text-small text-muted">{formatDateTime(item.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </>
  );
}
