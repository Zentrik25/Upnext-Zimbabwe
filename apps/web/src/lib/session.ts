import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import type { OpportunitySummary } from "./catalog-types";
import type { ForYouFeed, JobAlert, SeekerProfile } from "./seeker-types";

export type CurrentUser = {
  id: string;
  email: string;
  email_verified: boolean;
  display_name: string;
  status: string;
  roles: string[];
  created_at: string;
  deletion_requested_at: string | null;
  deletion_scheduled_for: string | null;
  email_change_available?: boolean;
};

export type SavedItem = {
  opportunity_id: string;
  saved_at: string;
  availability: "open" | "expired" | "withdrawn" | "unavailable";
  opportunity: OpportunitySummary | null;
};
export type SessionInfo = {
  id: string;
  created_at: string;
  last_seen_at: string;
  user_agent_summary: string | null;
  current: boolean;
};

const base = () => process.env.API_INTERNAL_URL ?? "http://localhost:8000";

/** Authenticated server-side GET: forwards the browser's cookies. `null` means unreachable or not allowed. */
async function authedGet(path: string): Promise<Response | null> {
  const cookie = (await cookies()).toString();
  if (!cookie) return null;
  try {
    return await fetch(`${base()}/api/v1/${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
      headers: { Accept: "application/json", Cookie: cookie },
    });
  } catch {
    return null;
  }
}

/** Authenticated server-side GET of a JSON document (employer portal pages). `status` 0 means unreachable. */
export async function authedJson<T>(
  path: string,
): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  const response = await authedGet(path);
  if (!response) return { ok: false, status: 0 };
  if (!response.ok) return { ok: false, status: response.status };
  try {
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, status: 502 };
  }
}

/** The signed-in user, or null for visitors. Memoised for one render pass. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const response = await authedGet("me");
  if (!response || !response.ok) return null;
  try {
    return (await response.json()) as CurrentUser;
  } catch {
    return null;
  }
});

export async function getSaved(
  params: URLSearchParams,
): Promise<{ ok: true; data: SavedItem[]; next: string | null; total: number | null } | { ok: false }> {
  const response = await authedGet(`me/saved?${params.toString()}`);
  if (!response || !response.ok) return { ok: false };
  const body = (await response.json()) as {
    data: SavedItem[];
    page: { next_cursor: string | null; total: number | null };
  };
  return { ok: true, data: body.data, next: body.page.next_cursor, total: body.page.total };
}

/** Which of these listings the current user has saved (empty set for visitors). */
export async function getSavedIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const response = await authedGet(`me/saved?ids=${ids.slice(0, 50).join(",")}`);
  if (!response || !response.ok) return new Set();
  const body = (await response.json()) as { data: { opportunity_id: string }[] };
  return new Set(body.data.map((item) => item.opportunity_id));
}

export async function getSessions(): Promise<SessionInfo[]> {
  const response = await authedGet("me/sessions");
  if (!response || !response.ok) return [];
  return ((await response.json()) as { data: SessionInfo[] }).data;
}

/** The caller's own private profile (an empty one when nothing was saved), or null when unreachable. */
export async function getProfile(): Promise<SeekerProfile | null> {
  const result = await authedJson<SeekerProfile>("me/profile");
  return result.ok ? result.data : null;
}

export async function getJobAlert(): Promise<JobAlert | null> {
  const result = await authedJson<JobAlert>("me/alerts");
  return result.ok ? result.data : null;
}

/** The For You page of recommendations; `status` 0 means the service could not be reached. */
export async function getForYou(
  params: URLSearchParams,
): Promise<{ ok: true; data: ForYouFeed } | { ok: false; status: number }> {
  return authedJson<ForYouFeed>(`discovery/for-you?${params.toString()}`);
}
