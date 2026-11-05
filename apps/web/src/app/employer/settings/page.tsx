import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Tag } from "@/components/ui";
import { getEmployerContext } from "@/lib/employer-context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings", robots: { index: false } };

const row =
  "flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-line py-3 first:border-t-0";

export default async function EmployerSettingsPage() {
  const context = await getEmployerContext();
  if (!context) redirect("/sign-in?next=%2Femployer%2Fsettings");
  if (context === "unreachable") redirect("/employer");
  const { user, organisations, active } = context;
  return (
    <div className="grid max-w-[760px] gap-6">
      <section aria-labelledby="set-account" className="rounded-card border border-border-panel p-4">
        <h2 id="set-account" className="m-0 text-title font-strong">
          Your account
        </h2>
        <dl className="m-0 mt-2">
          <div className={row}>
            <dt className="text-ctl text-muted">Name</dt>
            <dd className="m-0 text-base">{user.display_name}</dd>
          </div>
          <div className={row}>
            <dt className="text-ctl text-muted">Sign-in e-mail</dt>
            <dd className="m-0 text-base">{user.email}</dd>
          </div>
        </dl>
        <p className="mt-3 text-ctl">
          <a href="/account/personal" className="text-accent underline">
            Personal details
          </a>
          {" · "}
          <a href="/account/security" className="text-accent underline">
            Password and two-step verification
          </a>
          {" · "}
          <a href="/account/sessions" className="text-accent underline">
            Where you are signed in
          </a>
        </p>
      </section>
      <section aria-labelledby="set-orgs" className="rounded-card border border-border-panel p-4">
        <h2 id="set-orgs" className="m-0 text-title font-strong">
          Organisations you act for
        </h2>
        {organisations.length === 0 ? (
          <p className="mt-2 text-base text-muted">
            None yet.{" "}
            <Link href="/employer/claim" className="text-accent underline">
              Claim an organisation
            </Link>
            .
          </p>
        ) : (
          <ul className="m-0 mt-2 list-none p-0">
            {organisations.map((org) => (
              <li key={org.id} className={row}>
                <span className="text-base">
                  {org.name}
                  {org.id === active?.id ? (
                    <span className="text-small text-muted"> (working for this one)</span>
                  ) : null}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <Tag tone={org.verified ? "good" : "urgent"}>
                    {org.verified ? "Verified organisation" : "Verification withdrawn"}
                  </Tag>
                  <Tag>{org.role === "owner" ? "Owner" : "Recruiter"}</Tag>
                  {org.id !== active?.id ? (
                    <a
                      href={`/employer/switch?org=${org.id}&next=%2Femployer`}
                      className="text-ctl text-accent underline"
                    >
                      Work for this one
                    </a>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-small text-muted">
          Who can act for an organisation is decided by UPNEXT editors when a claim is approved. There is no
          team management here yet.
        </p>
      </section>
      <section aria-labelledby="set-mail" className="rounded-card border border-border-panel p-4">
        <h2 id="set-mail" className="m-0 text-title font-strong">
          E-mail notifications
        </h2>
        <p className="mt-2 text-base">
          When e-mail delivery is switched on, we e-mail the people who act for your organisation when an
          opportunity is submitted for review, published, sent back or rejected with the editor&apos;s reason,
          is about to close, and when it closes. Approval alone is not announced: you hear when it is
          published or returned.
        </p>
        <p className="mt-2 text-small text-muted">
          E-mail delivery has not been verified yet, so nothing is being sent. These messages are part of the
          review process and cannot be turned off.
        </p>
      </section>
    </div>
  );
}
