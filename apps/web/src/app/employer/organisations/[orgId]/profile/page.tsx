import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ProfileForm } from "@/components/employer/profile-form";
import { EmployerHeading } from "@/components/employer/parts";
import { Container } from "@/components/layout";
import { Callout } from "@/components/ui";
import type { ProfileState } from "@/lib/employer-types";
import { authedJson, getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Company profile", robots: { index: false } };

type Props = { params: Promise<{ orgId: string }> };

export default async function ProfilePage({ params }: Props) {
  const { orgId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/employer/organisations/${orgId}/profile`)}`);
  const result = await authedJson<ProfileState>(
    `employer/organisations/${encodeURIComponent(orgId)}/profile`,
  );
  if (!result.ok) {
    if (result.status === 404) notFound();
    return (
      <Container className="py-10" role="alert">
        The profile could not be loaded. Try again shortly.
      </Container>
    );
  }
  const state = result.data;
  return (
    <Container className="pt-6 pb-[65px]">
      <p className="text-ctl">
        <Link href="/employer" className="text-accent underline">
          ← Employer dashboard
        </Link>
      </p>
      <div className="mt-3">
        <EmployerHeading title={`Company profile: ${state.organisation.name}`} />
      </div>
      <p className="mt-1 text-base text-muted">
        The profile is shown to the public only after an editor approves it, and only while the organisation
        is verified.
      </p>
      {state.live ? (
        <Callout className="mt-4" data-testid="profile-live">
          <p className="text-small text-muted">Public now</p>
          <p className="text-base font-strong">{state.live.tagline || state.organisation.name}</p>
          <p className="mt-1 whitespace-pre-line text-base">{state.live.about}</p>
          {state.slug ? (
            <p className="mt-2 text-base">
              <Link href={`/employers/${state.slug}`} className="text-accent underline">
                View the public page
              </Link>
            </p>
          ) : null}
        </Callout>
      ) : (
        <p className="mt-4 text-base">There is no public profile yet.</p>
      )}
      {state.last_rejected ? (
        <div role="status" className="mt-4 border border-urgent p-3 text-base" data-testid="profile-rejected">
          <strong>Your last change was not approved.</strong> Reason: {state.last_rejected.decision_reason}
        </div>
      ) : null}
      <div className="mt-5 max-w-[640px]">
        <ProfileForm organisationId={orgId} state={state} />
      </div>
    </Container>
  );
}
