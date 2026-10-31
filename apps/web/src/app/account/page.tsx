import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar, SettingsRow } from "@/components/account/settings-parts";
import { SignOutButton } from "@/components/account/sign-out-button";
import { Container } from "@/components/layout";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Account settings", robots: { index: false } };

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=%2Faccount");
  const staff = user.roles.length > 0;
  return (
    <Container className="pt-6 pb-[65px]">
      <h1 className="text-section font-strong tracking-section">Account settings</h1>
      <p className="mt-1 text-base text-muted">Manage your profile, security and account preferences.</p>
      {staff ? (
        <p className="mt-2 text-base text-muted">
          You also have staff access.{" "}
          <a href="/workspace" className="text-accent underline">
            Open the staff workspace
          </a>
        </p>
      ) : null}
      <div className="mt-4 grid max-w-[640px] gap-3 [&>*]:min-w-0">
        <section
          aria-label="Your profile"
          className="flex items-center gap-3 rounded-card border border-border-panel bg-surface p-3 shadow-subtle"
        >
          <Avatar name={user.display_name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-title font-strong">{user.display_name}</p>
            <p className="truncate text-base text-muted">{user.email}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-small text-accent">
              <span aria-hidden="true" className="h-2 w-2 rounded-micro bg-accent-solid" />
              {user.status === "active" ? "Active account" : user.status}
            </p>
          </div>
          <Link
            href="/account/personal"
            className="inline-flex min-h-control items-center rounded-control border border-border-strong px-3 text-ctl font-medium text-secondary-text hover:bg-accent/5"
          >
            Edit<span className="sr-only"> profile</span>
          </Link>
        </section>
        <nav aria-label="Account settings" className="grid gap-3">
          <SettingsRow
            href="/account/personal"
            icon="user"
            title="Personal information"
            description="Name, e-mail address and profile details"
          />
          <SettingsRow
            href="/account/security"
            icon="lock"
            title="Password & security"
            description="Change your password and turn on two-step verification"
          />
          <SettingsRow
            href="/account/sessions"
            icon="device"
            title="Devices & sessions"
            description="See where you are signed in and manage active sessions"
          />
          <SettingsRow
            href="/alerts"
            icon="bell"
            title="Notifications"
            description="Job alerts by e-mail, daily or weekly"
          />
          <SettingsRow
            href="/account/delete"
            icon="trash"
            title="Delete your account"
            description="Permanently delete your account and your data"
            danger
          />
        </nav>
        <div>
          <SignOutButton />
        </div>
      </div>
    </Container>
  );
}
