"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui";
import { apiFetch, describeFailure } from "@/lib/client-api";
import { FormError, FormSuccess } from "./parts";
import { useStripTokenFromUrl } from "./reset-password-form";

/**
 * The link only opens this page; confirming is an explicit click, so mail scanners that fetch links cannot
 * consume the token. No session is created (SECURITY_ARCHITECTURE §3.2).
 */
export function VerifyEmailPanel({ token, change = false }: { token: string | null; change?: boolean }) {
  useStripTokenFromUrl();
  const [state, setState] = useState<"ready" | "busy" | "done" | "invalid">("ready");
  const [failure, setFailure] = useState<string | null>(null);

  if (!token || state === "invalid") {
    return (
      <div className="grid gap-4">
        <FormError>This link is invalid or has expired.</FormError>
        {change ? (
          <p className="text-ctl">
            <Link href="/sign-in?next=%2Faccount" className="text-accent underline">
              Sign in
            </Link>{" "}
            and ask for the change again from your account page.
          </p>
        ) : (
          <p className="text-ctl">
            Register again or{" "}
            <Link href="/sign-in" className="text-accent underline">
              sign in
            </Link>{" "}
            to ask for a new link.
          </p>
        )}
      </div>
    );
  }
  if (state === "done") {
    return (
      <div className="grid gap-4">
        <FormSuccess>
          <p className="font-strong">E-mail address confirmed</p>
          <p className="mt-1">
            {change
              ? "Your account now uses this address. Sign in with it from now on."
              : "Your account is ready. Sign in to continue."}
          </p>
        </FormSuccess>
        <p>
          <Link href="/sign-in" className="text-accent underline">
            Go to sign in
          </Link>
        </p>
      </div>
    );
  }

  async function confirm() {
    setState("busy");
    setFailure(null);
    const outcome = await apiFetch("POST", "auth/email/verify", { token });
    if (outcome.ok) return setState("done");
    if (outcome.code === "invalid_token") return setState("invalid");
    setState("ready");
    setFailure(describeFailure(outcome));
  }

  return (
    <div className="grid gap-4">
      {failure ? <FormError>{failure}</FormError> : null}
      <p className="text-base">Confirm that this is your e-mail address.</p>
      <div>
        <Button onClick={confirm} disabled={state === "busy"}>
          {state === "busy" ? "Confirming…" : "Confirm e-mail address"}
        </Button>
      </div>
    </div>
  );
}
