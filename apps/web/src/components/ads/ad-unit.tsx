"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { setAdConsent, useAdConsent } from "@/lib/ad-consent";
import { adsenseScriptSrc, type AdPlacement } from "@/lib/adsense";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

const SCRIPT_MARK = "data-upnext-adsense";

/** Adds Google's script once, and only after the visitor agreed. Inserted by our own nonced script, which the page's
 *  CSP (`strict-dynamic`) trusts. */
function loadAdsenseScript(client: string) {
  if (document.querySelector(`script[${SCRIPT_MARK}]`)) return;
  const script = document.createElement("script");
  script.async = true;
  script.crossOrigin = "anonymous";
  script.src = adsenseScriptSrc(client);
  script.setAttribute(SCRIPT_MARK, "");
  document.head.appendChild(script);
}

/**
 * The visible advertising block: a plain "Advertisement" label, a bordered box visually apart from the editorial text,
 * and reserved height so the page does not jump when the ad arrives (CLS). With no choice made it asks, inside the
 * reserved box, with two equal buttons; if the visitor declines it disappears and Google is never contacted.
 */
export function AdUnit({
  client,
  slot,
  placement,
}: {
  client: string;
  slot: string;
  placement: AdPlacement;
}) {
  const consent = useAdConsent();
  const requested = useRef(false);

  useEffect(() => {
    if (consent !== "granted" || requested.current) return;
    requested.current = true;
    loadAdsenseScript(client);
    try {
      (window.adsbygoogle = window.adsbygoogle ?? []).push({});
    } catch {
      /* a blocked or failed ad request leaves the reserved box empty; the page is unaffected */
    }
  }, [consent, client]);

  if (consent === "denied")
    return (
      <aside
        aria-label="Advertisement"
        data-ad-placement={placement}
        className="my-6 border-y border-line py-2"
      >
        <p className="m-0 text-small text-muted">
          Advertisements are off.{" "}
          <button
            type="button"
            onClick={() => setAdConsent("granted")}
            className="cursor-pointer text-accent underline"
          >
            Allow advertisements
          </button>
        </p>
      </aside>
    );

  return (
    <aside
      aria-label="Advertisement"
      data-ad-placement={placement}
      className="my-8 border-y border-line py-3 [overflow-anchor:none]"
    >
      <p className="m-0 mb-2 text-small uppercase tracking-wide text-muted">Advertisement</p>
      <div className="min-h-[280px] w-full overflow-hidden rounded-card bg-surface-pale max-sm:min-h-[250px]">
        {consent === "granted" ? (
          <ins
            className="adsbygoogle block"
            style={{ display: "block", minHeight: 250 }}
            data-ad-client={client}
            data-ad-slot={slot}
            data-ad-format="auto"
            data-full-width-responsive="true"
          />
        ) : (
          <div role="group" aria-label="Advertising choice" className="grid gap-3 p-4 text-base">
            <p className="m-0">
              UPNEXT can show advertisements provided by Google. They use cookies and similar technologies.
              Allow them? You can change this at any time on any page that shows advertisements. See{" "}
              <Link href="/privacy#advertising" className="text-accent underline">
                how advertising works
              </Link>
              .
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setAdConsent("granted")}>
                Allow advertisements
              </Button>
              <Button variant="secondary" onClick={() => setAdConsent("denied")}>
                No advertisements
              </Button>
            </div>
          </div>
        )}
      </div>
      {consent === "granted" ? (
        <p className="m-0 mt-2 text-small text-muted">
          <button
            type="button"
            onClick={() => setAdConsent("denied")}
            className="cursor-pointer text-accent underline"
          >
            Stop advertisements
          </button>{" "}
          on this site.
        </p>
      ) : null}
    </aside>
  );
}
