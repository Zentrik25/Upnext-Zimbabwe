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
  /^\/account$/,
  // Employer portal (Phase 6A): the dashboard, the claim form and the pages addressed by an id.
  /^\/employer(\/claim)?$/,
  /^\/employer\/listings\/[0-9a-f-]{36}$/,
  /^\/employer\/organisations\/[0-9a-f-]{36}\/profile$/,
  // Staff workspace (D-49): pages only; the API and the two-step page decide who may see them.
  /^\/workspace(\/[a-z0-9-]{1,40}){0,3}$/,
];

export function safeNext(value: string | string[] | null | undefined, fallback = "/account"): string {
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
