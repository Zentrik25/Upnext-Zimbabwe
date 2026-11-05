import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthPage } from "@/components/account/auth-parts";
import { SignInTwoStepForm } from "@/components/account/sign-in-two-step-form";
import { explicitNext, landing } from "@/lib/safe-next";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Verification code", robots: { index: false } };

export default async function SignInTwoStepPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const next = explicitNext((await searchParams).next);
  const user = await getCurrentUser();
  if (user) redirect(landing(next, user.home_path));
  return (
    <AuthPage title="Two-step verification">
      <SignInTwoStepForm next={next} />
    </AuthPage>
  );
}
