import "server-only";
import type { Category, Location, OpportunityDetail, OpportunitySummary, Page } from "./catalog-types";

export type Failure = "unreachable" | "invalid-query" | "rate-limited" | "unexpected-response";
export type Result<T> = { ok: true; data: T } | { ok: false; reason: Failure; message?: string };

const base = () => process.env.API_INTERNAL_URL ?? "http://localhost:8000";

async function get(path: string, params?: URLSearchParams, revalidate?: number): Promise<Response | null> {
  const query = params && [...params.keys()].length > 0 ? `?${params.toString()}` : "";
  try {
    return await fetch(`${base()}/api/v1/${path}${query}`, {
      ...(revalidate === undefined ? { cache: "no-store" as const } : { next: { revalidate } }),
      signal: AbortSignal.timeout(revalidate === undefined ? 4000 : 20000),
      headers: { Accept: "application/json" },
    });
  } catch {
    return null;
  }
}

async function errorMessage(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { error?: { fields?: Record<string, { message: string }[]> } };
    const first = Object.entries(body.error?.fields ?? {})[0];
    return first ? `${first[0]}: ${first[1][0]?.message ?? "not valid"}` : undefined;
  } catch {
    return undefined;
  }
}

async function json<T>(path: string, params?: URLSearchParams, revalidate?: number): Promise<Result<T>> {
  const response = await get(path, params, revalidate);
  if (response === null) return { ok: false, reason: "unreachable" };
  if (response.status === 400) {
    return { ok: false, reason: "invalid-query", message: await errorMessage(response) };
  }
  if (response.status === 429) return { ok: false, reason: "rate-limited" };
  if (!response.ok) return { ok: false, reason: "unexpected-response" };
  try {
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, reason: "unexpected-response" };
  }
}

export function getSitemapEntries() {
  // Large and slow-changing: crawlers may ask often, so the web tier keeps it for ten minutes.
  return json<{ data: { slug: string; updated_at: string }[] }>("sitemap", undefined, 600);
}

export function listOpportunities(params: URLSearchParams) {
  return json<{ data: OpportunitySummary[]; page: Page }>("opportunities", params);
}

/** `null` data means the listing is not public (404); other failures keep their reason. */
export async function getOpportunity(slug: string): Promise<Result<OpportunityDetail | null>> {
  const response = await get(`opportunities/${encodeURIComponent(slug)}`);
  if (response === null) return { ok: false, reason: "unreachable" };
  if (response.status === 404) return { ok: true, data: null };
  if (response.status === 429) return { ok: false, reason: "rate-limited" };
  if (!response.ok) return { ok: false, reason: "unexpected-response" };
  try {
    return { ok: true, data: (await response.json()) as OpportunityDetail };
  } catch {
    return { ok: false, reason: "unexpected-response" };
  }
}

export async function listCategories(): Promise<Category[]> {
  const result = await json<{ data: Category[] }>("categories");
  return result.ok ? result.data.data : [];
}

export async function listLocations(): Promise<Location[]> {
  const result = await json<{ data: Location[] }>("locations");
  return result.ok ? result.data.data : [];
}
