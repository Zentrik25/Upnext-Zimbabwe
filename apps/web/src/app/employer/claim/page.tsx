import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClaimForm } from "@/components/employer/claim-form";
import { FormPage } from "@/components/account/parts";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Claim an organisation", robots: { index: false } };

export default async function ClaimPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=%2Femployer%2Fclaim");
  return (
    <FormPage
      title="Claim an organisation"
      intro="Tell us who you are and how we can confirm it. An editor checks each claim by hand before you can post. Claiming costs nothing."
    >
      <ClaimForm />
    </FormPage>
  );
}
