/**
 * Where to send someone after signing in. Only same-origin relative paths under known routes are accepted
 * (SECURITY_ARCHITECTURE §6: no open redirect); anything else becomes the fallback.
 */
const ALLOWED = [/^\/$/, /^\/opportunities(\/[a-z0-9-]+)?$/, /^\/saved$/, /^\/account$/];

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
