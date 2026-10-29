import { redirect } from "next/navigation";
import { StaffSignIn } from "@/components/staff/sign-in";
import { authedJson } from "@/lib/session";
import type { StaffSession } from "@/lib/staff-types";

/** Only same-origin /staff paths are followed after sign-in. */
function safeNext(value: string | undefined): string {
  return value && /^\/staff(\/[A-Za-z0-9\-_/.?=&%]*)?$/.test(value) && !value.startsWith("//")
    ? value
    : "/staff";
}

export default async function StaffSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const target = safeNext(next);
  const session = await authedJson<StaffSession>("staff/session");
  if (session.ok && (!session.data.mfa.required || session.data.mfa.verified)) redirect(target);
  return <StaffSignIn next={target} />;
}
