import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import type { EmployerOrganisation, Overview } from "./employer-types";
import { authedJson, getCurrentUser, type CurrentUser } from "./session";

/** The cookie that remembers which organisation a member with several is working for (D-70). */
export const ACTIVE_ORG_COOKIE = "upnext_org";

export type EmployerContext = {
  user: CurrentUser;
  overview: Overview;
  organisations: EmployerOrganisation[];
  /** The organisation every employer page works for; null for an account with no membership. */
  active: EmployerOrganisation | null;
};

/**
 * The signed-in account, its organisations and the active one, for one render pass. The active organisation
 * is the remembered one only while the account is still a member of it (the list comes from the API, which
 * answers from the database), otherwise the first. The cookie is a preference, never proof: every API call
 * resolves the organisation through the caller's own memberships again.
 */
export const getEmployerContext = cache(async (): Promise<EmployerContext | "unreachable" | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const overview = await authedJson<Overview>("employer/overview");
  if (!overview.ok) return "unreachable";
  const organisations = overview.data.organisations;
  const remembered = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
  const active = organisations.find((o) => o.id === remembered) ?? organisations[0] ?? null;
  return { user, overview: overview.data, organisations, active };
});
