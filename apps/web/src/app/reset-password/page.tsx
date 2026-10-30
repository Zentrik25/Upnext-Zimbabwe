import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/account/reset-password-form";
import { AuthPage } from "@/components/account/auth-parts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false },
  referrer: "no-referrer",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams).token;
  const token = (Array.isArray(raw) ? raw[0] : raw) || null;
  return (
    <AuthPage title="Choose a new password">
      <ResetPasswordForm token={token} />
    </AuthPage>
  );
}
