import Link from "next/link";
import { WithdrawClaim } from "@/components/employer/withdraw-claim";
import { ClaimTag } from "@/components/employer/parts";
import { EmptyState } from "@/components/ui";
import type { Claim } from "@/lib/employer-types";
import { formatDate } from "@/lib/format";

/** Claims on the dashboard: those waiting, the last ones not approved, and the invitation to claim when the
 *  account acts for no organisation yet. */
export function ClaimsSection({ claims, hasOrganisation }: { claims: Claim[]; hasOrganisation: boolean }) {
  const waiting = claims.filter((c) => c.status === "pending");
  const decided = claims.filter((c) => c.status === "rejected").slice(0, 3);
  return (
    <>
      {waiting.length > 0 ? (
        <section aria-labelledby="claims-title" className="mt-5" data-testid="claims">
          <h2 id="claims-title" className="border-b border-line pb-1 text-title font-strong">
            Claims waiting for review
          </h2>
          <ul className="m-0 mt-2 grid list-none gap-2 p-0">
            {waiting.map((claim) => (
              <li
                key={claim.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border border-border-panel p-3 text-base"
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
              <li key={claim.id} className="rounded-card border border-border-panel p-3 text-base">
                <strong>{claim.organisation_name}</strong> <ClaimTag status={claim.status} />
                {claim.decision_reason ? (
                  <p className="mt-1 text-small">Reason: {claim.decision_reason}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {!hasOrganisation && waiting.length === 0 ? (
        <div className="mt-6">
          <EmptyState as="h2" title="You do not act for an organisation yet">
            Claim your organisation to post jobs, internships and graduate programmes.{" "}
            <Link href="/employer/claim" className="text-accent underline">
              Claim an organisation
            </Link>
          </EmptyState>
        </div>
      ) : null}
    </>
  );
}
