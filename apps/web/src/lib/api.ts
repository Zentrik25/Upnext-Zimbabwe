import "server-only";

export type ApiRoot = { name: string; version: string; status: string };
export type ApiResult =
  { ok: true; data: ApiRoot } | { ok: false; reason: "unreachable" | "unexpected-response" };

function isApiRoot(value: unknown): value is ApiRoot {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.name === "string" && typeof v.version === "string" && typeof v.status === "string";
}

/** Server-side call to the Django API root over the internal network (never exposed to the browser). */
export async function getApiRoot(): Promise<ApiResult> {
  const base = process.env.API_INTERNAL_URL ?? "http://localhost:8000";
  try {
    const response = await fetch(`${base}/api/v1/`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return { ok: false, reason: "unexpected-response" };
    const body: unknown = await response.json();
    return isApiRoot(body) ? { ok: true, data: body } : { ok: false, reason: "unexpected-response" };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}
