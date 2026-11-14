"use client";

import { useState, useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * Sharing an article (D-78): plain links for WhatsApp, Facebook and LinkedIn (they work without JavaScript), a copy
 * button and, where the browser offers it, the native share sheet. No floating widget, no third-party script.
 */
export function ShareControls({ url, title }: { url: string; title: string }) {
  const [note, setNote] = useState<string | null>(null);
  const encoded = encodeURIComponent(url);
  const text = encodeURIComponent(`${title} ${url}`);
  const link =
    "inline-flex min-h-[44px] items-center rounded-control border border-line px-3 text-ctl text-ink hover:bg-surface-pale";
  // False on the server and in the first render, then what the browser offers: no hydration mismatch.
  const canShare = useSyncExternalStore(
    noop,
    () => typeof navigator.share === "function",
    () => false,
  );
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="share-controls">
      <button
        type="button"
        className={link}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setNote("Link copied.");
          } catch {
            setNote("Copy the address from your browser's address bar.");
          }
        }}
      >
        Copy link
      </button>
      {canShare ? (
        <button
          type="button"
          className={link}
          onClick={() => void navigator.share({ title, url }).catch(() => undefined)}
        >
          Share…
        </button>
      ) : null}
      <a className={link} href={`https://wa.me/?text=${text}`} rel="noopener noreferrer" target="_blank">
        WhatsApp
      </a>
      <a
        className={link}
        href={`https://www.facebook.com/sharer/sharer.php?u=${encoded}`}
        rel="noopener noreferrer"
        target="_blank"
      >
        Facebook
      </a>
      <a
        className={link}
        href={`https://www.linkedin.com/sharing/share-offsite/?url=${encoded}`}
        rel="noopener noreferrer"
        target="_blank"
      >
        LinkedIn
      </a>
      <span role="status" aria-live="polite" className="text-small text-muted">
        {note}
      </span>
    </div>
  );
}
