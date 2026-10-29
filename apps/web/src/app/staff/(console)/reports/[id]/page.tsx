import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportActions } from "@/components/staff/report-actions";
import { Card, Facts, PageHeader } from "@/components/staff/primitives";
import { can, requireStaff, staffGet } from "@/lib/staff";
import { formatDateTime, words } from "@/lib/staff-format";
import type { ReportDetail } from "@/lib/staff-types";

export const metadata = { title: "Report" };

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireStaff();
  if (!can(session, "report.read")) notFound();
  const result = await staffGet<ReportDetail>(`reports/${id}`);
  if (!result.ok) notFound();
  const report = result.data;
  return (
    <>
      <PageHeader
        title={`Report ${report.reference}`}
        lead={
          <Link href="/staff/reports" className="text-accent underline">
            All reports
          </Link>
        }
      />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid gap-4">
          <Card>
            <h2 className="mb-3 text-lead tracking-title">What was reported</h2>
            <Facts
              items={[
                { label: "Reason", value: report.reason_label },
                { label: "Status", value: words(report.status) },
                { label: "Received", value: formatDateTime(report.created_at) },
                { label: "Listing", value: report.opportunity.title || "Listing" },
                { label: "Details", value: <span className="whitespace-pre-wrap">{report.details}</span> },
                ...(report.evidence_url
                  ? [
                      {
                        label: "Evidence link",
                        value: <span className="break-all">{report.evidence_url}</span>,
                      },
                    ]
                  : []),
                ...(report.contact_email ? [{ label: "Reporter contact", value: report.contact_email }] : []),
              ]}
            />
            <p className="mt-4 text-ctl">
              <Link href={`/staff/opportunities/${report.opportunity.id}`} className="text-accent underline">
                Open the listing
              </Link>
              {report.opportunity.slug ? (
                <>
                  {" · "}
                  <a href={`/opportunities/${report.opportunity.slug}`} className="text-accent underline">
                    View public page
                  </a>
                </>
              ) : null}
            </p>
          </Card>
          <Card>
            <h2 className="mb-3 text-lead tracking-title">Handling</h2>
            <ReportActions
              report={report}
              can={{
                triage: can(session, "report.triage"),
                resolve: can(session, "report.resolve"),
                escalated: can(session, "report.resolve_escalated"),
              }}
            />
          </Card>
        </div>
        <Card>
          <h2 className="mb-3 text-lead tracking-title">History</h2>
          <ol className="grid gap-3 text-ctl">
            {report.events.map((e, i) => (
              <li key={i} className="border-l-2 border-line pl-3">
                <p>
                  {e.label} <span className="text-muted">by {e.actor}</span>
                </p>
                <p className="tnum text-small text-muted">{formatDateTime(e.at)}</p>
                {e.note ? <p className="mt-0.5 whitespace-pre-wrap text-small text-muted">{e.note}</p> : null}
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  );
}
