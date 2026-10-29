import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TwoStepForm } from "@/components/workspace/two-step-form";
import { authedJson } from "@/lib/session";
import { requireStaffAccount } from "@/lib/staff";

export const metadata: Metadata = { title: "Two-step verification" };

type Props = { searchParams: Promise<{ next?: string }> };

/** Staff only: enrol or verify the second step. Without it the staff API answers "two_step_required". */
export default async function TwoStepPage({ searchParams }: Props) {
  const { next } = await searchParams;
  const target = next && /^\/workspace(\/[a-z0-9/-]*)?$/.test(next) ? next : "/workspace";
  const session = await requireStaffAccount();
  if (!session.two_step.required || session.two_step.verified) redirect(target);
  const state = await authedJson<{ enrolling: boolean; secret?: string; uri?: string }>("staff/two-step");
  if (!state.ok) throw new Error("The staff service could not be reached.");
  return (
    <main id="main" className="mx-auto w-full max-w-[480px] px-6 py-12">
      <TwoStepForm
        enrolling={state.data.enrolling}
        secret={state.data.secret}
        uri={state.data.uri}
        next={target}
      />
    </main>
  );
}
