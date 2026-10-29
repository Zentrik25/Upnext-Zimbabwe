import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { authedJson, getCurrentUser } from "./session";
import type { StaffSession } from "./staff-types";

/** Server-side GET of a staff API document (forwards the browser's session cookie). */
export function staffJson<T>(path: string) {
  return authedJson<T>(`staff/${path}`);
}

const session = cache(() => authedJson<StaffSession>("staff/session"));

/**
 * The signed-in, two-step-verified staff member, or a redirect: visitors go to sign-in, seekers and employers
 * to the home page, staff who have not passed the second step to the two-step page. The API re-checks every
 * request; this only picks the right page.
 */
export async function requireStaff(next: string): Promise<StaffSession> {
  const result = await session();
  if (!result.ok) {
    if (result.status === 0 || result.status === 401 || result.status === 403) {
      const user = await getCurrentUser();
      if (!user) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
      if (result.status !== 0) redirect("/");
    }
    throw new Error("The staff service could not be reached.");
  }
  if (result.data.two_step.required && !result.data.two_step.verified) {
    redirect(`/workspace/two-step?next=${encodeURIComponent(next)}`);
  }
  return result.data;
}

/** The session for the two-step page itself (staff only, verified or not). */
export async function requireStaffAccount(): Promise<StaffSession> {
  const result = await session();
  if (!result.ok) {
    const user = await getCurrentUser();
    if (!user) redirect("/sign-in?next=%2Fworkspace");
    if (result.status !== 0) redirect("/");
    throw new Error("The staff service could not be reached.");
  }
  return result.data;
}

export function can(session: StaffSession, code: string): boolean {
  return session.permissions?.includes(code) ?? false;
}

/** The current time in milliseconds, read on the server for relative times ("2 hours ago"). */
export const currentTime = () => Date.now();
