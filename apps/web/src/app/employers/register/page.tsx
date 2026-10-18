import type { Metadata } from "next";
import { openGraphFor } from "@/lib/brand";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/account/register-form";
import { FormPage } from "@/components/account/parts";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Create an employer account",
  robots: { index: false },
  alternates: { canonical: "/employers/register" },
  openGraph: openGraphFor("/employers/register"),
};

export default async function EmployerRegisterPage() {
  if (await getCurrentUser()) redirect("/employer");
  return (
    <FormPage
      title="Create an employer account"
      intro="Use your work e-mail address. After you confirm it, sign in and claim your organisation. An editor verifies the organisation before you can post."
    >
      <RegisterForm />
      <p className="mt-4 text-small text-muted">
        Employer accounts are ordinary accounts. Your authority to post comes only from an approved claim.{" "}
        <Link href="/employers" className="text-accent underline">
          How it works
        </Link>
      </p>
    </FormPage>
  );
}
