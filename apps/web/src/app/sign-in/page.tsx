import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/account/sign-in-form";
import { AuthPage } from "@/components/account/auth-parts";
import { safeNext } from "@/lib/safe-next";
import { getAuthProviders, getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const next = safeNext(query.next);
  if (await getCurrentUser()) redirect(next);
  const providers = await getAuthProviders();
  return (
    <AuthPage
      title="Welcome back"
      intro="Sign in to your account to save opportunities and come back to them."
    >
      <SignInForm next={next} googleEnabled={providers.google} googleFailed={query.error === "google"} />
    </AuthPage>
  );
}
