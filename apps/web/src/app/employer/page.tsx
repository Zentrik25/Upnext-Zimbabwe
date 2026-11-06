import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClaimsSection } from "@/components/employer/claims-section";
import { ListingTable } from "@/components/employer/listing-table";
import { StatCards } from "@/components/employer/stat-cards";
import { ViewsPanel } from "@/components/employer/views-panel";
import { Container } from "@/components/layout";
import { ButtonLink, Callout, EmptyState } from "@/components/ui";
import { getEmployerContext } from "@/lib/employer-context";
import type { DashboardData, ListingPage } from "@/lib/employer-types";
import { authedJson } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };

export default async function EmployerDashboard() {
  const context = await getEmployerContext();
  if (!context) redirect("/sign-in?next=%2Femployer");
  if (context === "unreachable") {
    return (
      <Container className="py-10" role="alert">
        <EmptyState as="h1" title="The dashboard is unavailable">
          The service could not be reached. Try again shortly.
        </EmptyState>
      </Container>
    );
  }
  const { overview, active } = context;

  if (!active) {
    return (
      <div className="max-w-[860px]">
        <p className="m-0 text-base text-muted">
          Everything you post is reviewed by UPNEXT editors before it is public. Being a verified organisation
          does not make a listing verified.
        </p>
        {!overview.account_ready ? (
          <Callout className="mt-4" role="status">
            Confirm your e-mail address before you claim an organisation.
          </Callout>
        ) : null}
        <div className="mt-4">
          <ButtonLink href="/employer/claim">Claim an organisation</ButtonLink>
        </div>
        <ClaimsSection claims={overview.claims} hasOrganisation={false} />
      </div>
    );
  }

  const [dashboard, recent] = await Promise.all([
    authedJson<DashboardData>(`employer/organisations/${active.id}/dashboard?period=7d`),
    authedJson<ListingPage>(`employer/organisations/${active.id}/listings?page_size=5`),
  ]);

  return (
    <div className="grid gap-5 [&>*]:min-w-0">
      {!active.verified ? (
        <Callout role="status">
          The verification of {active.name} was withdrawn, so you cannot submit new listings or profile
          changes. Contact UPNEXT if you think this is a mistake.
        </Callout>
      ) : null}
      <StatCards counts={dashboard.ok ? dashboard.data.counts : active.counts} />
      {dashboard.ok ? (
        <ViewsPanel organisationId={active.id} initial={dashboard.data} />
      ) : (
        <EmptyState as="h2" title="The figures are unavailable">
          The views could not be loaded. Try again shortly.
        </EmptyState>
      )}
      <section aria-labelledby="recent-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="recent-title" className="m-0 text-[24px] font-strong tracking-title">
            Recent Opportunities
          </h2>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/employer/opportunities" className="text-ctl text-accent">
              View all <span aria-hidden="true">→</span>
            </Link>
            {active.verified ? (
              <ButtonLink href="/employer/listings/new">
                <span aria-hidden="true">+</span>&nbsp;Create Opportunity
              </ButtonLink>
            ) : null}
          </div>
        </div>
        <div className="mt-3">
          {recent.ok ? (
            <ListingTable
              rows={recent.data.data}
              empty="You have no opportunities yet. Create your first one to get started."
            />
          ) : (
            <EmptyState as="h2" title="Your opportunities are unavailable">
              The list could not be loaded. Try again shortly.
            </EmptyState>
          )}
        </div>
      </section>
      <ClaimsSection claims={overview.claims} hasOrganisation />
    </div>
  );
}
