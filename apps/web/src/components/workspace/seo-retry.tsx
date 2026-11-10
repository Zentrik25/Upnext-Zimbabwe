"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { apiFetch, describeFailure } from "@/lib/client-api";

/**
 * Queue a failed or dead Indexing API notification again (Administrators only; the server checks and audits every
 * request). With no `id`, every dead notification that is still the latest for its address is queued again.
 * Queuing is not sending: the worker sends on its next cycle, only in `live` mode and within the daily quota.
 */
export function SeoRetry({ id, label = "Retry" }: { id?: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function retry() {
    setBusy(true);
    setMessage(null);
    const path = id ? `staff/seo/notifications/${id}/retry` : "staff/seo/notifications/retry-dead";
    const result = await apiFetch<{ requeued?: number }>("POST", path);
    setBusy(false);
    if (!result.ok) return setMessage({ tone: "error", text: describeFailure(result) });
    setMessage({
      tone: "ok",
      text: id ? "Queued again." : `${result.data.requeued ?? 0} queued again.`,
    });
    router.refresh();
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        onClick={() => void retry()}
        disabled={busy}
        aria-busy={busy}
        className="min-h-0 px-2 py-[2px] text-small"
      >
        {busy ? "Queuing…" : label}
      </Button>
      {message ? (
        <span
          role={message.tone === "error" ? "alert" : "status"}
          className={message.tone === "error" ? "text-small text-danger" : "text-small text-muted"}
        >
          {message.text}
        </span>
      ) : null}
    </span>
  );
}
