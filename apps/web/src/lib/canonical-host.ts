/**
 * The apex domain is canonical (D-42): a request for `www.<domain>` is sent to `<domain>` with a permanent
 * redirect, keeping path and query. It only applies when `UPNEXT_PUBLIC_BASE_URL` names a real hostname (never
 * localhost or an IP address) and the request host is exactly `www.` + that hostname, so development, CI and
 * previews are untouched. The shared production proxy should also redirect (docs/engineering/DOMAIN_AND_DNS_SETUP.md);
 * this is the application-level safety net and needs no DNS or proxy change to be tested.
 */
export function canonicalRedirect(
  requestHost: string | null,
  requestUrl: { pathname: string; search: string },
  baseUrl: string | undefined,
): string | null {
  if (!requestHost || !baseUrl) return null;
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return null;
  }
  const apex = base.hostname.toLowerCase();
  if (apex === "localhost" || /^[\d.]+$/.test(apex) || apex.includes(":") || !apex.includes(".")) return null;
  const host = requestHost.toLowerCase().replace(/:\d+$/, "");
  if (host !== `www.${apex}`) return null;
  return `${base.origin}${requestUrl.pathname}${requestUrl.search}`;
}
