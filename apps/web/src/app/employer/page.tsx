import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { WithdrawClaim } from "@/components/employer/withdraw-claim";
import { ANALYTICS_NOTE, ClaimTag, EmployerHeading, StatusTag } from "@/components/employer/parts";
import { Container } from "@/components/layout";
import { ButtonLink, Callout, EmptyState, Panel, Tag } from "@/components/ui";
import type { EmployerListingRow, ListingStats, Overview } from "@/lib/employer-types";
import { formatDate } from "@/lib/format";
import { authedJson, getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Employer dashboard", robots: { index: false } };

type Listings = { data: EmployerListingRow[] };
type Stats = { data: ListingStats[] };

export default async function EmployerDashboard() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=%2Femployer");
  const overview = await authedJson<Overview>("employer/overview");
  if (!overview.ok) {
    return (
      <Container className="py-10" role="alert">
        <EmptyState as="h1" title="The dashboard is unavailable">
          The service could not be reached. Try again shortly.
        </EmptyState>
      </Container>
    );
  }
  const { claims, organisations } = overview.data;
  const perOrganisation = await Promise.all(
    organisations.map(async (org) => {
      const [listings, stats] = await Promise.all([
        authedJson<Listings>(`employer/organisations/${org.id}/listings`),
        authedJson<Stats>(`employer/organisations/${org.id}/analytics`),
      ]);
      return {
        org,
        rows: listings.ok ? listings.data.data : [],
        stats: new Map((stats.ok ? stats.data.data : []).map((s) => [s.opportunity_id, s])),
      };
    }),
  );
  const waiting = claims.filter((c) => c.status === "pending");
  const decided = claims.filter((c) => c.status === "rejected").slice(0, 3);

  return (
    <Container className="pt-6 pb-[65px]">
      <EmployerHeading title="Employer dashboard">
        <ButtonLink href="/employer/claim" variant="secondary">
          Claim an organisation
        </ButtonLink>
      </EmployerHeading>
      <p className="mt-1 text-base text-muted">
        Everything you post is reviewed by NextJob editors before it is public. Being a verified organisation
        does not make a listing verified.
      </p>

      {!overview.data.account_ready ? (
        <Callout className="mt-4" role="status">
          Confirm your e-mail address before you claim an organisation.
        </Callout>
      ) : null}

      {waiting.length > 0 ? (
        <section aria-labelledby="claims-title" className="mt-5" data-testid="claims">
          <h2 id="claims-title" className="border-b border-line pb-1 text-title font-strong">
            Claims waiting for review
          </h2>
          <ul className="m-0 mt-2 grid list-none gap-2 p-0">
            {waiting.map((claim) => (
              <li
                key={claim.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border border-border-panel p-3 text-base"
              >
                <strong>{claim.organisation_name}</strong>
                <ClaimTag status={claim.status} />
                <span className="text-small text-muted">
                  Sent {formatDate(claim.created_at, "Africa/Harare")}
                </span>
                <WithdrawClaim id={claim.id} />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-small text-muted">
            Editors check each claim by hand. There is no fixed time; you will see the result here.
          </p>
        </section>
      ) : null}

      {decided.length > 0 ? (
        <section aria-labelledby="decided-title" className="mt-5">
          <h2 id="decided-title" className="border-b border-line pb-1 text-title font-strong">
            Claims not approved
          </h2>
          <ul className="m-0 mt-2 grid list-none gap-2 p-0">
            {decided.map((claim) => (
              <li key={claim.id} className="border border-border-panel p-3 text-base">
                <strong>{claim.organisation_name}</strong> <ClaimTag status={claim.status} />
                {claim.decision_reason ? (
                  <p className="mt-1 text-small">Reason: {claim.decision_reason}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {organisations.length === 0 && waiting.length === 0 ? (
        <div className="mt-6">
          <EmptyState as="h2" title="You do not act for an organisation yet">
            Claim your organisation to post jobs, internships and graduate programmes.{" "}
            <Link href="/employer/claim" className="text-accent underline">
              Claim an organisation
            </Link>
          </EmptyState>
        </div>
      ) : null}

      {perOrganisation.map(({ org, rows, stats }) => (
        <section key={org.id} aria-labelledby={`org-${org.id}`} className="mt-6" data-testid="organisation">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line pb-1">
            <h2 id={`org-${org.id}`} className="text-title font-strong">
              {org.name}
            </h2>
            <Tag tone={org.verified ? "good" : "urgent"}>
              {org.verified ? "Verified organisation" : "Verification withdrawn"}
            </Tag>
            <Tag>{org.role === "owner" ? "Owner" : "Recruiter"}</Tag>
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            {org.verified ? (
              <ButtonLink href={`/employer/listings/new?org=${org.id}`}>Post a listing</ButtonLink>
            ) : null}
            <ButtonLink href={`/employer/organisations/${org.id}/profile`} variant="secondary">
              Company profile{org.profile_pending ? " (change waiting)" : ""}
            </ButtonLink>
            {org.profile_slug ? (
              <ButtonLink href={`/employers/${org.profile_slug}`} variant="secondary">
                View public profile
              </ButtonLink>
            ) : null}
          </div>
          {!org.verified ? (
            <p className="mt-3 text-base">
              The verification of this organisation was withdrawn, so you cannot submit new listings or
              profile changes. Contact NextJob if you think this is a mistake.
            </p>
          ) : null}

          <h3 className="mt-5 text-base font-strong">Listings</h3>
          {rows.length === 0 ? (
            <p className="mt-2 text-base text-muted">No listings yet.</p>
          ) : (
            <ul className="m-0 mt-2 grid list-none gap-2 p-0">
              {rows.map((row) => {
                const s = stats.get(row.id);
                return (
                  <li key={row.id} className="border border-border-panel p-3" data-testid="employer-listing">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Link
                        href={`/employer/listings/${row.id}`}
                        className="text-title font-strong text-accent underline"
                      >
                        {row.title}
                      </Link>
                      <StatusTag status={row.status} />
                      <span className="text-small text-muted">{row.category.name}</span>
                    </div>
                    {row.decision ? (
                      <p className="mt-2 text-base" data-testid="decision">
                        <strong>Editor&apos;s note:</strong> {row.decision.reason}
                      </p>
                    ) : null}
                    {row.status === "published" && s ? (
                      <dl className="m-0 mt-2 flex flex-wrap gap-x-6 gap-y-1 text-small" data-testid="stats">
                        <div>
                          <dt className="inline text-muted">Views, last 7 days: </dt>
                          <dd className="ml-0 inline">{s.last_7_days.views}</dd>
                        </div>
                        <div>
                          <dt className="inline text-muted">Apply clicks, last 7 days: </dt>
                          <dd className="ml-0 inline">{s.last_7_days.apply_clicks}</dd>
                        </div>
                        <div>
                          <dt className="inline text-muted">Last 30 days: </dt>
                          <dd className="ml-0 inline">
                            {s.last_30_days.views} views, {s.last_30_days.apply_clicks} apply clicks
                          </dd>
                        </div>
                        <div>
                          <dt className="inline text-muted">Saved by: </dt>
                          <dd className="ml-0 inline">{s.saves}</dd>
                        </div>
                      </dl>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          <Panel className="mt-3 w-full">
            <p className="text-small text-muted">{ANALYTICS_NOTE}</p>
          </Panel>
        </section>
      ))}
    </Container>
  );
}
