import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/account/sign-in-form";
import { AuthPage } from "@/components/account/auth-parts";
import { GoogleButton, OrDivider } from "@/components/account/google-button";
import { CreateAccountPrompt, GoogleFailedNotice, SignInOptions } from "@/components/account/sign-in-parts";
import { explicitNext, landing } from "@/lib/safe-next";
import { getAuthProviders, getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const next = explicitNext(query.next);
  const user = await getCurrentUser();
  if (user) redirect(landing(next, user.home_path)); // already signed in: straight to the right dashboard
  const providers = await getAuthProviders();
  return (
    <AuthPage title="Sign in to your account">
      <SignInForm
        next={next}
        notice={query.error === "google" ? <GoogleFailedNotice /> : undefined}
        options={<SignInOptions />}
        social={
          <>
            <OrDivider label="Or sign in with" />
            <GoogleButton enabled={providers.google} next={next} />
            <CreateAccountPrompt />
          </>
        }
      />
    </AuthPage>
  );
}
