"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui";

/** Share a published listing: copy its public link, or send it through WhatsApp (D-47). */
export function ShareLink({ url, title }: { url: string; title: string }) {
  const [message, setMessage] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Link copied.");
    } catch {
      setMessage("Copy failed. Select the address in your browser to copy it.");
    }
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Share this opportunity" role="group">
      <Button type="button" variant="secondary" onClick={copy}>
        Copy link
      </Button>
      <ButtonLink
        variant="secondary"
        href={`https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Share on WhatsApp
      </ButtonLink>
      <span role="status" className="text-small text-meta">
        {message}
      </span>
    </div>
  );
}
