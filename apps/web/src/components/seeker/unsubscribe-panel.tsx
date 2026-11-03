"use client";

import { useState } from "react";
import { FormError, FormSuccess } from "@/components/account/parts";
import { Button } from "@/components/ui";
import { apiFetch, describeFailure } from "@/lib/client-api";

/** Needs no sign-in: the signed link in the e-mail is the credential, and all it can do is switch alerts off. */
export function UnsubscribePanel({ token }: { token: string }) {
  const [state, setState] = useState<"ready" | "busy" | "done" | "invalid" | "failed">("ready");
  const [failure, setFailure] = useState("");

  async function stop() {
    setState("busy");
    const outcome = await apiFetch("POST", "alerts/unsubscribe", { token });
    if (outcome.ok) return setState("done");
    if (outcome.code === "invalid_token") return setState("invalid");
    setFailure(describeFailure(outcome));
    setState("failed");
  }

  if (state === "done") {
    return (
      <FormSuccess>
        <p className="font-strong">Job alerts are off</p>
        <p className="mt-1">
          You will not get any more alert e-mails. You can turn them on again at any time.
        </p>
      </FormSuccess>
    );
  }
  if (state === "invalid") {
    return (
      <FormError>This link is not valid. Sign in and use the alert settings to turn alerts off.</FormError>
    );
  }
  return (
    <div className="grid gap-3">
      {state === "failed" ? <FormError>{failure}</FormError> : null}
      <p className="text-base">This stops the job-alert e-mails for the account the message was sent to.</p>
      <div>
        <Button onClick={stop} disabled={state === "busy"}>
          Stop job alert e-mails
        </Button>
      </div>
    </div>
  );
}
