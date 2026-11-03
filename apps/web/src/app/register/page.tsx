import type { Metadata } from "next";
import { openGraphFor } from "@/lib/brand";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/account/register-form";
import { AuthPage } from "@/components/account/auth-parts";
import { getAuthProviders, getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Create account",
  robots: { index: false },
  alternates: { canonical: "/register" },
  openGraph: openGraphFor("/register"),
};

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/account");
  const providers = await getAuthProviders();
  return (
    <AuthPage title="Create your account">
      <RegisterForm googleEnabled={providers.google} />
    </AuthPage>
  );
}
