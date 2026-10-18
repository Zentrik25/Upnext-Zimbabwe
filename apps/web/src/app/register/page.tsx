import type { Metadata } from "next";
import { openGraphFor } from "@/lib/brand";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/account/register-form";
import { FormPage } from "@/components/account/parts";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Create account",
  robots: { index: false },
  alternates: { canonical: "/register" },
  openGraph: openGraphFor("/register"),
};

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/account");
  return (
    <FormPage
      title="Create your account"
      intro="An account lets you save opportunities and come back to them. Browsing never needs one."
    >
      <RegisterForm />
    </FormPage>
  );
}
