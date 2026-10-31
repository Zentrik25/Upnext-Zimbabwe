import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SessionsPanel } from "@/components/account/account-panels";
import { AccountSection } from "@/components/account/settings-parts";
import { getCurrentUser, getSessions } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Devices & sessions", robots: { index: false } };

export default async function SessionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=%2Faccount%2Fsessions");
  const sessions = await getSessions();
  return (
    <AccountSection title="Devices & sessions" description="The browsers where you are signed in.">
      <SessionsPanel sessions={sessions} />
    </AccountSection>
  );
}
