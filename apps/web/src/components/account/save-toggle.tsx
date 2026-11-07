"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SaveButton } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { apiFetch, describeFailure } from "@/lib/client-api";
import { cn } from "@/lib/cn";

/**
 * Save / unsave a listing. Visitors get a link to sign in (and come back here); signed-in people get the
 * toggle. The state is announced politely and the heart is never the only cue (aria-pressed + visible label on
 * the detail page).
 */
export function SaveToggle({
  opportunityId,
  title,
  initialSaved,
  signedIn,
  returnTo,
  showLabel = false,
  icon = false,
  refreshOnChange = false,
  className,
}: {
  opportunityId: string;
  title: string;
  initialSaved: boolean;
  signedIn: boolean;
  returnTo: string;
  showLabel?: boolean;
  /**
   * An icon-only square button (bookmark, no visible text) for the one-line action row. Its name and tooltip say
   * what it does; the state is `aria-pressed`; a failure is written as a note under the row (against the nearest
   * `relative` ancestor).
   */
  icon?: boolean;
  /** Re-render the server page after a change (the saved list drops what was removed). */
  refreshOnChange?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const iconClass =
    "inline-grid min-h-field w-10 shrink-0 cursor-pointer place-items-center self-stretch rounded-control border border-border-interest bg-match-bg text-ink hover:bg-accent/10";

  if (!signedIn && icon) {
    return (
      <a
        href={`/sign-in?next=${encodeURIComponent(returnTo)}`}
        aria-label={`Save ${title} (sign in to save)`}
        title="Save (sign in to save this opportunity)"
        className={cn(iconClass, className)}
      >
        <Icon name="bookmark" className="h-4 w-4" />
      </a>
    );
  }

  if (!signedIn) {
    return (
      <a
        href={`/sign-in?next=${encodeURIComponent(returnTo)}`}
        className={cn("inline-flex min-h-[44px] items-center gap-1 px-1 text-ctl text-accent", className)}
      >
        <span aria-hidden="true" className="text-[20px] leading-[31px] text-save-idle">
          ♡
        </span>
        <span className={showLabel ? "underline" : "sr-only"}>Sign in to save {title}</span>
      </a>
    );
  }

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
      if (refreshOnChange) router.refresh();
      return;
    }
    if (outcome.code === "listing_not_saveable")
      setMessage("This listing is no longer open, so it cannot be saved.");
    else if (outcome.code === "saved_limit_reached") setMessage(outcome.message);
    else if (outcome.status === 401) setMessage("Your session ended. Sign in again to save.");
    else setMessage(describeFailure(outcome));
  }

  if (icon)
    return (
      <>
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          aria-pressed={saved}
          aria-label={`Save ${title}`}
          title={saved ? "Saved (select to remove)" : "Save"}
          className={cn(iconClass, "disabled:cursor-not-allowed disabled:opacity-60", className)}
        >
          <Icon name="bookmark" className={cn("h-4 w-4", saved && "fill-current text-accent")} />
        </button>
        <span
          role="status"
          aria-live="polite"
          className={
            message && !message.startsWith("Saved") && !message.startsWith("Removed")
              ? "absolute inset-x-0 top-full z-10 mt-1 rounded-control border border-danger/50 bg-surface px-3 py-2 text-small text-danger [overflow-wrap:anywhere]"
              : "sr-only"
          }
        >
          {message}
        </span>
      </>
    );

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <SaveButton title={title} saved={saved} onClick={toggle} disabled={busy} />
      {showLabel ? (
        <span aria-hidden="true" className="text-ctl text-muted">
          {saved ? "Saved" : "Save"}
        </span>
      ) : null}
      <span
        role="status"
        aria-live="polite"
        className={
          message.startsWith("Saved") || message.startsWith("Removed") ? "sr-only" : "text-small text-danger"
        }
      >
        {message}
      </span>
    </span>
  );
}
