"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { apiFetch, describeFailure } from "@/lib/client-api";
import { FormError, FormSuccess } from "./parts";

/** "Send the link again". The answer is the same for any address, so it never confirms an account exists. */
export function ResendVerification({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [failure, setFailure] = useState<string | null>(null);

  async function resend() {
    setState("busy");
    setFailure(null);
    const outcome = await apiFetch("POST", "auth/email/resend", { email });
    if (outcome.ok) return setState("sent");
    setState("idle");
    setFailure(describeFailure(outcome));
  }

  return (
    <div className="grid gap-2">
      {failure ? <FormError>{failure}</FormError> : null}
      {state === "sent" ? (
        <FormSuccess>If this address is waiting for confirmation, we have sent a new link.</FormSuccess>
      ) : null}
      <div>
        <Button variant="secondary" onClick={resend} disabled={state === "busy"}>
          {state === "busy" ? "Sending…" : "Send the link again"}
        </Button>
      </div>
    </div>
  );
}
