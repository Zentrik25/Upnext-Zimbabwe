import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClaimForm } from "@/components/employer/claim-form";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Claim an organisation", robots: { index: false } };

export default async function ClaimPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=%2Femployer%2Fclaim");
  return (
    <div className="max-w-[640px]">
      <p className="m-0 mb-4 text-base text-muted">
        Tell us who you are and how we can confirm it. An editor checks each claim by hand before you can
        post.
      </p>
      <ClaimForm />
    </div>
  );
}
