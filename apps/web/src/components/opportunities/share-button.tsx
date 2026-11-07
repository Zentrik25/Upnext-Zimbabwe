"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icons";

/**
 * Share this listing: the device's share sheet where there is one, otherwise a copy of its address. Either way the
 * outcome is said in words (a polite status), so the control is never silent.
 */
export function ShareButton({
  title,
  path,
  icon = false,
}: {
  title: string;
  path: string;
  /**
   * An icon-only square button for the one-line action row (Apply, Save, Share). It has a name and a tooltip, and the
   * outcome appears as a small note under the row (positioned against the nearest `relative` ancestor), then clears.
   */
  icon?: boolean;
}) {
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!icon || !message) return;
    const timer = window.setTimeout(() => setMessage(""), 5000);
    return () => window.clearTimeout(timer);
  }, [icon, message]);

  async function share() {
    const url = `${window.location.origin}${path}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, url });
        setMessage("Shared.");
        return;
      }
    } catch (error) {
      if ((error as DOMException).name === "AbortError") return; // the person closed the sheet
    }
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Link copied.");
    } catch {
      setMessage(`Copy this address: ${url}`);
    }
  }

  if (icon)
    return (
      <>
        <button
          type="button"
          onClick={share}
          aria-label="Share this opportunity"
          title="Share"
          className="inline-grid min-h-[48px] w-12 shrink-0 cursor-pointer place-items-center self-stretch rounded-control border border-border-interest bg-match-bg text-ink hover:bg-accent/10"
        >
          <Icon name="share" className="h-5 w-5" />
        </button>
        <span
          role="status"
          aria-live="polite"
          className={
            message
              ? "absolute inset-x-0 top-full z-10 mt-1 rounded-control border border-line bg-surface px-3 py-2 text-small text-ink [overflow-wrap:anywhere]"
              : "sr-only"
          }
        >
          {message}
        </span>
      </>
    );

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={share}
        className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-control px-2 text-ctl text-accent hover:bg-accent/5"
      >
        <Icon name="share" className="h-4 w-4" />
        Share
        <span className="sr-only"> this opportunity</span>
      </button>
      <span role="status" aria-live="polite" className="text-small text-muted">
        {message}
      </span>
    </span>
  );
}
