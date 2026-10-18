"use client";

import { useEffect } from "react";

/**
 * Reports one page view (once per browser tab session) and apply-link clicks to the aggregate counters
 * behind the employer dashboard. No cookie, identifier or body content is sent: only the event name.
 * Failures are ignored: counting must never get in the way of reading or applying.
 */
export function ListingEvents({ slug, open }: { slug: string; open: boolean }) {
  useEffect(() => {
    if (!open) return;
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
    try {
      const key = `nj-viewed:${slug}`;
      if (!window.sessionStorage.getItem(key)) {
        window.sessionStorage.setItem(key, "1");
        send("view");
      }
    } catch {
      send("view");
    }
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("[data-listing-apply]") : null;
      if (target) send("apply");
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [slug, open]);
  return null;
}
