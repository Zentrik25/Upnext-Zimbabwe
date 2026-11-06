import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ViewsPanel } from "@/components/employer/views-panel";
import { EmptyState } from "@/components/ui";
import { getEmployerContext } from "@/lib/employer-context";
import type { DashboardData, ListingPage } from "@/lib/employer-types";
import { count, formatDate } from "@/lib/staff-format";
import { authedJson } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Analytics", robots: { index: false } };

export default async function EmployerAnalyticsPage() {
  const context = await getEmployerContext();
  if (!context) redirect("/sign-in?next=%2Femployer%2Fanalytics");
  if (context === "unreachable" || !context.active) redirect("/employer");
  const { active } = context;
  const [dashboard, listings] = await Promise.all([
    authedJson<DashboardData>(`employer/organisations/${active.id}/dashboard?period=30d`),
    authedJson<ListingPage>(
      `employer/organisations/${active.id}/listings?status=all&page_size=50&period=all`,
    ),
  ]);
  if (!dashboard.ok)
    return (
      <EmptyState as="h2" title="Analytics are unavailable">
        The figures could not be loaded. Try again shortly.
      </EmptyState>
    );
  const everPublic = listings.ok ? listings.data.data.filter((row) => row.published_at !== null) : [];
  return (
    <div className="grid gap-5 [&>*]:min-w-0">
      <ViewsPanel organisationId={active.id} initial={dashboard.data} />
      <section aria-labelledby="per-listing">
        <h2 id="per-listing" className="m-0 text-title font-strong tracking-title">
          Views per opportunity (all time)
        </h2>
        {everPublic.length === 0 ? (
          <p className="mt-2 text-base text-muted">None of your opportunities has been published yet.</p>
        ) : (
          <div className="relative mt-2 overflow-x-auto rounded-card border border-border-panel">
            <table className="w-full min-w-[560px] border-collapse text-ctl">
              <caption className="sr-only">Views and apply clicks for each published opportunity</caption>
              <thead className="bg-surface-pale">
                <tr>
                  <th scope="col" className="px-3 py-2.5 text-left font-normal">
                    Opportunity
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-left font-normal">
                    Views
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-left font-normal">
                    Apply clicks
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-left font-normal">
                    Published
                  </th>
                </tr>
              </thead>
              <tbody>
                {everPublic.map((row) => (
                  <tr key={row.id} className="border-t border-line">
                    <th scope="row" className="px-3 py-3 text-left font-normal">
                      <Link href={`/employer/listings/${row.id}`} className="text-ink hover:underline">
                        {row.title}
                      </Link>
                    </th>
                    <td className="px-3 py-3 tabular-nums">{count(row.views)}</td>
                    <td className="px-3 py-3 tabular-nums">{count(row.apply_clicks)}</td>
                    <td className="px-3 py-3">{formatDate(row.published_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-small text-muted">
          Apply clicks are clicks on the Apply button or link. UPNEXT applications happen on your own website,
          by e-mail or by your instructions, so UPNEXT cannot tell you how many applications you received.
        </p>
      </section>
    </div>
  );
}
