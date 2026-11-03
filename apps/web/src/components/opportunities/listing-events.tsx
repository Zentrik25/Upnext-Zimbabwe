"use client";

import { useEffect } from "react";

/**
 * Reports one page view (once per browser tab session) and apply-link clicks to the aggregate counters behind the
 * staff Analytics and the employer dashboard. No cookie, identifier or body content is sent: only the event name.
 * Failures are ignored: counting must never get in the way of reading or applying.
 *
 * What counts as a view: the page was open in a visible tab, in a normal (not automated) browser, and this tab
 * session had not already reported it. A re-render, React's development double effect, a prefetch or a prerender
 * never counts: the report is sent from the browser after the page is showing, and the session flag is set before
 * it is sent. The server drops crawlers and prefetches too. Staff previews do not mount this component.
 */
export function ListingEvents({ slug, open }: { slug: string; open: boolean }) {
  useEffect(() => {
    if (!open) return;
    if (typeof navigator !== "undefined" && navigator.webdriver) return; // an automated browser is not a reader
    const send = (type: "view" | "apply") => {
      try {
        void fetch(`/api/v1/opportunities/${encodeURIComponent(slug)}/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type }),
          credentials: "omit",
          keepalive: true,
        }).catch(() => undefined);
      } catch {
        /* ignore */
      }
    };
    const reportView = () => {
      try {
        const key = `nj-viewed:${slug}`;
        if (window.sessionStorage.getItem(key)) return;
        window.sessionStorage.setItem(key, "1");
      } catch {
        /* storage blocked: report anyway; the cleanup below still prevents a second send from this effect */
      }
      send("view");
    };
    // A tab that is not showing (opened in the background, or prerendered) reports when it first becomes visible.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        document.removeEventListener("visibilitychange", onVisible);
        reportView();
      }
    };
    if (document.visibilityState === "visible") reportView();
    else document.addEventListener("visibilitychange", onVisible);

    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("[data-listing-apply]") : null;
      if (target) send("apply");
    };
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [slug, open]);
  return null;
}
