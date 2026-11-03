import type { Metadata } from "next";
import { AcceptInvitationForm } from "@/components/account/accept-invitation-form";
import { AuthPage } from "@/components/account/auth-parts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Accept your invitation",
  robots: { index: false },
  referrer: "no-referrer",
};

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams).token;
  const token = (Array.isArray(raw) ? raw[0] : raw) || null;
  return (
    <AuthPage title="Accept your invitation">
      <AcceptInvitationForm token={token} />
    </AuthPage>
  );
}
