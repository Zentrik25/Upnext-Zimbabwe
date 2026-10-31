import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DeletionPanel } from "@/components/account/account-panels";
import { AccountSection } from "@/components/account/settings-parts";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Delete your account", robots: { index: false } };

export default async function DeletePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=%2Faccount%2Fdelete");
  return (
    <AccountSection
      title="Delete your account"
      description="This removes your account, saved listings and sign-in records."
    >
      <DeletionPanel
        requestedAt={user.deletion_requested_at}
        scheduledFor={user.deletion_scheduled_for}
        staff={user.roles.length > 0}
      />
    </AccountSection>
  );
}
