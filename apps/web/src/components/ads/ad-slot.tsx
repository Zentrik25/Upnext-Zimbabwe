import { headers } from "next/headers";
import { adAllowedOn } from "@/lib/ad-rules";
import { adSlotId, adsenseClient, adsenseMode, type AdPlacement } from "@/lib/adsense";
import { AdUnit } from "./ad-unit";

/**
 * A labelled advertising slot. Renders NOTHING unless advertising is live, the real publisher id and this
 * placement's real ad-unit id are configured, and the request path is one where ads are allowed (ad-rules.ts). The
 * path check uses the real request, so putting this component on a page that is not allowed has no effect.
 * Place it between content sections, never directly beside Apply, Save, Share, sign-in or navigation controls.
 */
export async function AdSlot({ placement }: { placement: AdPlacement }) {
  if (adsenseMode() !== "live") return null;
  const client = adsenseClient();
  const slot = adSlotId(placement);
  if (!client || !slot) return null;
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (!adAllowedOn(placement, pathname)) return null;
  return <AdUnit client={client} slot={slot} placement={placement} />;
}
