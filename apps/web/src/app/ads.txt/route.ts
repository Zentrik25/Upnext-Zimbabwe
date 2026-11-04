import { adsTxtFor, adsenseClient } from "@/lib/adsense";

// Read the publisher id on each request, not at build time: the owner sets it in the deployed environment.
export const dynamic = "force-dynamic";

const TEXT = "text/plain; charset=utf-8";

/**
 * /ads.txt for Google AdSense. Served only when the owner has set a well-formed UPNEXT_ADSENSE_CLIENT; until then it
 * answers 404, so nothing is published and no publisher id lives in the repository. It needs no UPNEXT_ADSENSE_MODE and
 * loads nothing from Google: this is the verification method that puts no Google script on the pages.
 */
export function GET(): Response {
  const client = adsenseClient();
  if (!client) return new Response("Not found\n", { status: 404, headers: { "Content-Type": TEXT } });
  return new Response(adsTxtFor(client), {
    headers: { "Content-Type": TEXT, "Cache-Control": "public, max-age=3600" },
  });
}
