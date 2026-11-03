import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EmailChangePanel, ProfilePanel } from "@/components/account/account-panels";
import { AccountSection } from "@/components/account/settings-parts";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Personal information", robots: { index: false } };

export default async function PersonalPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=%2Faccount%2Fpersonal");
  return (
    <AccountSection title="Personal information" description="Your name and e-mail address.">
      <ProfilePanel displayName={user.display_name} email={user.email} />
      {user.email_change_available ? <EmailChangePanel currentEmail={user.email} /> : null}
    </AccountSection>
  );
}
