import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  DeletionPanel,
  EmailChangePanel,
  PasswordPanel,
  ProfilePanel,
  SessionsPanel,
} from "@/components/account/account-panels";
import { SignOutButton } from "@/components/account/sign-out-button";
import { Container } from "@/components/layout";
import { getCurrentUser, getSessions } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your account", robots: { index: false } };

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=%2Faccount");
  const sessions = await getSessions();
  const staff = user.roles.length > 0;
  return (
    <Container className="pt-6 pb-[65px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[28px] font-strong leading-[1.15] tracking-section sm:text-section">
          Your account
        </h1>
        <SignOutButton />
      </div>
      {staff ? (
        <p className="mt-2 text-base text-muted">
          You also have staff access.{" "}
          <a href="/workspace" className="text-accent underline">
            Open the staff workspace
          </a>
        </p>
      ) : null}
      <div className="mt-4 grid max-w-[640px] gap-4">
        <ProfilePanel displayName={user.display_name} email={user.email} />
        {user.email_change_available ? <EmailChangePanel currentEmail={user.email} /> : null}
        <PasswordPanel />
        <SessionsPanel sessions={sessions} />
        <DeletionPanel
          requestedAt={user.deletion_requested_at}
          scheduledFor={user.deletion_scheduled_for}
          staff={staff}
        />
      </div>
    </Container>
  );
}
