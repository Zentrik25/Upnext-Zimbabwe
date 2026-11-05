/**
 * Where to send someone after signing in. Only same-origin relative paths under known routes are accepted
 * (SECURITY_ARCHITECTURE §6: no open redirect); anything else becomes the fallback.
 */
const ALLOWED = [
  /^\/$/,
  /^\/opportunities(\/[a-z0-9-]+)?$/,
  /^\/saved$/,
  // Jobseeker pages (Phase 6B). The unsubscribe page is public and is never a sign-in destination.
  /^\/(dashboard|for-you|profile|alerts)$/,
  /^\/account(\/(personal|security|sessions|delete))?$/,
  // Employer portal (Phase 6A, D-70): the dashboard, its sections, the claim form and the pages addressed by an id.
  /^\/employer(\/(claim|opportunities|analytics|settings))?$/,
  /^\/employer\/listings\/new$/,
  /^\/employer\/listings\/[0-9a-f-]{36}(\/preview)?$/,
  /^\/employer\/organisations\/[0-9a-f-]{36}\/profile$/,
  // Staff workspace (D-49): pages only; the API and the two-step page decide who may see them.
  /^\/workspace(\/[a-z0-9-]{1,40}){0,3}$/,
];

export function safeNext(value: string | string[] | null | undefined, fallback = "/dashboard"): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || raw.length > 300 || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) {
    return fallback;
  }
  let url: URL;
  try {
    url = new URL(raw, "http://upnext.invalid");
  } catch {
    return fallback;
  }
  if (url.origin !== "http://upnext.invalid") return fallback;
  return ALLOWED.some((pattern) => pattern.test(url.pathname)) ? `${url.pathname}${url.search}` : fallback;
}

/** The three dashboards, and the only values a landing page may take (the API names one of them, D-70). */
export const HOME_PATHS = ["/workspace", "/employer", "/dashboard"] as const;
export type HomePath = (typeof HOME_PATHS)[number];

/** The dashboard the API named for the account; anything unexpected becomes the jobseeker dashboard. */
export function homeOf(value: unknown): HomePath {
  return HOME_PATHS.find((path) => path === value) ?? "/dashboard";
}

/** A return address the person was sent to sign in from, or undefined when there is none (or it is unsafe). */
export function explicitNext(value: string | string[] | null | undefined): string | undefined {
  return safeNext(value, "") || undefined;
}

/**
 * Where to go after signing in (D-70). A safe return address is kept only when the account may use that area:
 * the workspace for staff, the employer pages for employers (and staff). Otherwise, and when there is no
 * return address, the person lands on their own dashboard, never on the Account page. The API still decides
 * every request; this only avoids sending someone to a page that would turn them away.
 */
export function landing(next: string | undefined, homePath: unknown): string {
  const home = homeOf(homePath);
  const wanted = next ? safeNext(next, "") : "";
  if (!wanted || wanted === "/sign-in") return home;
  if (wanted.startsWith("/workspace") && home !== "/workspace") return home;
  if (wanted.startsWith("/employer/") && home === "/dashboard") return home;
  return wanted;
}
