"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icons";
import { apiFetch, describeFailure } from "@/lib/client-api";
import { cn } from "@/lib/cn";

const square =
  "inline-grid min-h-field w-10 shrink-0 cursor-pointer place-items-center self-stretch rounded-control border border-border-interest bg-match-bg text-ink hover:bg-accent/10";

/**
 * Save / unsave as an icon-only square (bookmark, no visible text) for the listing page's one-line action row. It
 * lives apart from `SaveToggle` so the list pages, which only use the small heart, do not carry it. The name and
 * tooltip say what it does, the state is `aria-pressed`, and a failure is written as a note under the row (against
 * the nearest `relative` ancestor). Visitors get a link to sign in and come back.
 */
export function SaveIconToggle({
  opportunityId,
  title,
  initialSaved,
  signedIn,
  returnTo,
}: {
  opportunityId: string;
  title: string;
  initialSaved: boolean;
  signedIn: boolean;
  returnTo: string;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  if (!signedIn)
    return (
      <a
        href={`/sign-in?next=${encodeURIComponent(returnTo)}`}
        aria-label={`Save ${title} (sign in to save)`}
        title="Save (sign in to save this opportunity)"
        className={square}
      >
        <Icon name="bookmark" className="h-4 w-4" />
      </a>
    );

  async function toggle() {
    if (busy) return;
    const next = !saved;
    setBusy(true);
    setMessage("");
    const outcome = await apiFetch(next ? "PUT" : "DELETE", `me/saved/${opportunityId}`);
    setBusy(false);
    if (outcome.ok) {
      setSaved(next);
      setMessage(next ? `Saved: ${title}` : `Removed from saved: ${title}`);
      return;
    }
    if (outcome.code === "listing_not_saveable")
      setMessage("This listing is no longer open, so it cannot be saved.");
    else if (outcome.code === "saved_limit_reached") setMessage(outcome.message);
    else if (outcome.status === 401) setMessage("Your session ended. Sign in again to save.");
    else setMessage(describeFailure(outcome));
  }

  const failure = message && !message.startsWith("Saved") && !message.startsWith("Removed");
  return (
    <>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={saved}
        aria-label={`Save ${title}`}
        title={saved ? "Saved (select to remove)" : "Save"}
        className={cn(square, "disabled:cursor-not-allowed disabled:opacity-60")}
      >
        <Icon name="bookmark" className={cn("h-4 w-4", saved && "fill-current text-accent")} />
      </button>
      <span
        role="status"
        aria-live="polite"
        className={
          failure
            ? "absolute inset-x-0 top-full z-10 mt-1 rounded-control border border-danger/50 bg-surface px-3 py-2 text-small text-danger [overflow-wrap:anywhere]"
            : "sr-only"
        }
      >
        {message}
      </span>
    </>
  );
}
