"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { apiFetch, describeFailure } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import type { ListingRow } from "@/lib/staff-types";
import { StatusBadge } from "./badges";

/**
 * Verified / Not verified with one Verify / Unverify action (D-62). The label changes only after the server has
 * answered, so it always shows what was saved. The button appears for people whose account holds the permission;
 * the server decides again on every request, so showing it is a convenience and never the protection.
 */
export function VerifyToggle({
  id,
  verified,
  canVerify,
  compact = false,
  className,
}: {
  id: string;
  verified: boolean;
  canVerify: boolean;
  /** A small text button for table rows. */
  compact?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState(verified);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // A new value from the page (after a refresh or an autosave) is the truth again.
  const [seen, setSeen] = useState(verified);
  if (seen !== verified) {
    setSeen(verified);
    setState(verified);
  }

  async function change() {
    setBusy(true);
    setProblem(null);
    const result = await apiFetch<ListingRow>("PUT", `staff/opportunities/${id}/verification`, {
      verified: !state,
    });
    setBusy(false);
    if (!result.ok) return setProblem(describeFailure(result));
    setState(result.data.verified);
    router.refresh();
  }

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      <StatusBadge tone={state ? "success" : "neutral"}>{state ? "Verified" : "Not verified"}</StatusBadge>
      {canVerify ? (
        <Button
          variant="secondary"
          onClick={() => void change()}
          disabled={busy}
          aria-busy={busy}
          className={compact ? "min-h-0 px-2 py-[2px] text-small" : undefined}
        >
          {busy ? "Saving…" : state ? "Unverify" : "Verify"}
        </Button>
      ) : null}
      {problem ? (
        <span role="alert" className="text-small text-danger">
          <span className="font-strong">Error:</span> {problem}
        </span>
      ) : null}
    </span>
  );
}
