import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { authedJson } from "./session";
import type { StaffReference, StaffSession } from "./staff-types";

/** The staff session, or a redirect to the staff sign-in page. Memoised for one render pass. */
export const requireStaff = cache(async (): Promise<StaffSession> => {
  const result = await authedJson<StaffSession>("staff/session");
  if (!result.ok) redirect("/staff/sign-in");
  const session = result.data;
  if (session.mfa.required && !session.mfa.verified) redirect("/staff/sign-in");
  return session;
});

export function can(session: StaffSession, permission: string): boolean {
  return session.permissions.includes(permission);
}

/** GET a staff API document. A 401/403 means the session ended: go back to sign-in. */
export async function staffGet<T>(
  path: string,
): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  const result = await authedJson<T>(`staff/${path}`);
  if (!result.ok && (result.status === 401 || result.status === 403)) {
    // 403 for a missing permission is also possible; the pages check permissions first, so this is the session.
    if (result.status === 401) redirect("/staff/sign-in");
  }
  return result;
}

export const getReference = cache(async () => {
  const result = await staffGet<StaffReference>("reference");
  return result.ok ? result.data : null;
});

/** Query string from a Next searchParams object, keeping only the named keys. */
export function qs(params: Record<string, string | string[] | undefined>, keys: string[]): string {
  const out = new URLSearchParams();
  for (const key of keys) {
    const value = params[key];
    const single = Array.isArray(value) ? value[0] : value;
    if (single) out.set(key, single);
  }
  return out.toString();
}

export function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}
