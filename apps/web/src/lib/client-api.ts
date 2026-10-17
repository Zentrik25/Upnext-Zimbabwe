/** Browser-side calls to the same-origin API (cookie session + CSRF header; no tokens in JavaScript storage). */

export type FieldErrors = Record<string, string[]>;
export type ApiOutcome<T = unknown> =
  | { ok: true; status: number; data: T }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      fields: FieldErrors;
      retryAfter: number | null;
    };

const CSRF_COOKIES = ["__Host-upnext_csrf", "upnext_csrf"];

export function readCsrfCookie(cookieString: string): string | null {
  for (const part of cookieString.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name && CSRF_COOKIES.includes(name)) return decodeURIComponent(rest.join("="));
  }
  return null;
}

async function csrfToken(): Promise<string> {
  const existing = readCsrfCookie(document.cookie);
  if (existing) return existing;
  const response = await fetch("/api/v1/auth/csrf", { credentials: "same-origin", cache: "no-store" });
  const body = (await response.json()) as { csrf_token: string };
  return body.csrf_token;
}

type ErrorBody = {
  error?: { code?: string; message?: string; fields?: Record<string, { message: string }[]> };
};

export function toFieldErrors(fields: Record<string, { message: string }[]> | undefined): FieldErrors {
  const out: FieldErrors = {};
  for (const [key, list] of Object.entries(fields ?? {})) out[key] = list.map((item) => item.message);
  return out;
}

export async function apiFetch<T = unknown>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<ApiOutcome<T>> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (method !== "GET") {
    headers["X-CSRFToken"] = await csrfToken();
    if (body !== undefined) headers["Content-Type"] = "application/json";
  }
  let response: Response;
  try {
    response = await fetch(`/api/v1/${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      status: 0,
      code: "network",
      message: "The service could not be reached. Check your connection and try again.",
      fields: {},
      retryAfter: null,
    };
  }
  if (response.ok) {
    const text = response.status === 204 ? "" : await response.text();
    return { ok: true, status: response.status, data: (text ? JSON.parse(text) : null) as T };
  }
  let parsed: ErrorBody = {};
  try {
    parsed = (await response.json()) as ErrorBody;
  } catch {
    /* non-JSON error body */
  }
  const retry = Number(response.headers.get("Retry-After"));
  return {
    ok: false,
    status: response.status,
    code: parsed.error?.code ?? "error",
    message: parsed.error?.message ?? "Something went wrong. Try again.",
    fields: toFieldErrors(parsed.error?.fields),
    retryAfter: Number.isFinite(retry) && retry > 0 ? retry : null,
  };
}

/** Plain-language text for the stable error codes. Never reveals whether an address is registered. */
export function describeFailure(outcome: Extract<ApiOutcome, { ok: false }>): string {
  switch (outcome.code) {
    case "invalid_credentials":
      return "Incorrect e-mail or password.";
    case "email_not_verified":
      return "Confirm your e-mail address first. We sent you a link when you registered.";
    case "account_unavailable":
      return "This account cannot sign in right now.";
    case "rate_limited": {
      const wait = outcome.retryAfter;
      const when = wait
        ? ` Try again in ${wait >= 90 ? `${Math.ceil(wait / 60)} minutes` : `${wait} seconds`}.`
        : " Try again shortly.";
      return `Too many attempts.${when}`;
    }
    case "reauth_required":
      return "That password is not correct.";
    case "csrf_failed":
      return "Your session expired. Reload the page and try again.";
    case "network":
      return outcome.message;
    default:
      return outcome.status >= 500
        ? "Something went wrong on our side. Try again shortly."
        : outcome.message || "Something went wrong. Try again.";
  }
}
