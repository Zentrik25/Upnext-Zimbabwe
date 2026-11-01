"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icons";

/**
 * Share this listing: the device's share sheet where there is one, otherwise a copy of its address. Either way the
 * outcome is said in words (a polite status), so the control is never silent.
 */
export function ShareButton({ title, path }: { title: string; path: string }) {
  const [message, setMessage] = useState("");

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
