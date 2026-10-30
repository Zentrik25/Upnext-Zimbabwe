import "server-only";
import { headers } from "next/headers";
import type {
  Category,
  Location,
  OpportunityDetail,
  OpportunitySummary,
  Page,
  Sector,
} from "./catalog-types";
import type { PublicProfile } from "./employer-types";

export type Failure = "unreachable" | "invalid-query" | "rate-limited" | "unexpected-response";
export type Result<T> = { ok: true; data: T } | { ok: false; reason: Failure; message?: string };

const base = () => process.env.API_INTERNAL_URL ?? "http://localhost:8000";

const ADDRESS = /^[0-9a-fA-F.:]{3,45}$/;

/** The address of the person this page is being rendered for, as nginx stated it (it replaces the header, so a
 *  browser cannot choose it). The API counts its anonymous-read limit per address; without this every visitor
 *  would share the web container's allowance. Only the last entry is used, as the nearest proxy wrote it. */
export function visitorAddress(forwardedFor: string | null): string | null {
  const last = forwardedFor?.split(",").pop()?.trim();
  return last && ADDRESS.test(last) ? last : null;
}

async function visitorHeaders(): Promise<Record<string, string>> {
  try {
    const address = visitorAddress((await headers()).get("x-forwarded-for"));
    return address ? { "X-Forwarded-For": address } : {};
  } catch {
    return {}; // not inside a request (build, tests): the API then counts the web container
  }
}

async function get(path: string, params?: URLSearchParams, revalidate?: number): Promise<Response | null> {
  const query = params && [...params.keys()].length > 0 ? `?${params.toString()}` : "";
  try {
    return await fetch(`${base()}/api/v1/${path}${query}`, {
      ...(revalidate === undefined ? { cache: "no-store" as const } : { next: { revalidate } }),
      signal: AbortSignal.timeout(revalidate === undefined ? 4000 : 20000),
      // The cached sitemap is shared by every crawler, so it is not attributed to one visitor.
      headers: { Accept: "application/json", ...(revalidate === undefined ? await visitorHeaders() : {}) },
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
  // Large and slow-changing: crawlers may ask often, so the web tier keeps it for a few minutes (0 turns the cache
  // off, as in the test stacks). A withdrawn listing can therefore stay in the file for that long; its page already
  // says it is withdrawn and is not indexed.
  const seconds = Number(process.env.UPNEXT_SITEMAP_CACHE_SECONDS ?? 300);
  return json<{ data: { slug: string; updated_at: string }[] }>(
    "sitemap",
    undefined,
    seconds > 0 ? seconds : undefined,
  );
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

export async function listSectors(): Promise<Sector[]> {
  const result = await json<{ data: Sector[] }>("sectors");
  return result.ok ? result.data.data : [];
}

/** The approved company profile of a verified organisation, or null when there is none (404). */
export async function getEmployerProfile(slug: string): Promise<Result<PublicProfile | null>> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return { ok: true, data: null };
  const response = await get(`employers/${slug}`);
  if (response === null) return { ok: false, reason: "unreachable" };
  if (response.status === 404) return { ok: true, data: null };
  if (response.status === 429) return { ok: false, reason: "rate-limited" };
  if (!response.ok) return { ok: false, reason: "unexpected-response" };
  try {
    return { ok: true, data: (await response.json()) as PublicProfile };
  } catch {
    return { ok: false, reason: "unexpected-response" };
  }
}
