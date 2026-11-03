"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui";
import { AuthField, AuthSwitch } from "./auth-parts";
import { apiFetch, describeFailure } from "@/lib/client-api";
import { FormError, FormSuccess } from "./parts";

export function ForgotPasswordForm() {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setFailure(null);
    const outcome = await apiFetch("POST", "auth/password-reset/request", {
      email: String(form.get("email") ?? "").trim(),
    });
    setBusy(false);
    if (outcome.ok) return setSent(true);
    setFailure(
      outcome.code === "validation_failed" ? "Enter a valid e-mail address." : describeFailure(outcome),
    );
  }

  if (sent) {
    return (
      <div className="grid gap-3">
        <FormSuccess>
          <p className="font-strong">Check your e-mail</p>
          <p className="mt-1">
            If an account uses this address, we have sent a link to choose a new password. It may take a few
            minutes and works for 60 minutes.
          </p>
        </FormSuccess>
        <AuthSwitch>
          <Link href="/sign-in">Back to sign in</Link>
        </AuthSwitch>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="grid gap-3">
      <p className="text-ctl text-muted">Enter your e-mail address and we will send you a link.</p>
      {failure ? <FormError>{failure}</FormError> : null}
      <AuthField
        id="email"
        name="email"
        label="E-mail address"
        type="email"
        autoComplete="email"
        required
        maxLength={254}
      />
      <Button type="submit" disabled={busy} className="sm:min-h-field">
        {busy ? "Sending…" : "Send reset link"}
      </Button>
      <AuthSwitch>
        <Link href="/sign-in">Back to sign in</Link>
      </AuthSwitch>
    </form>
  );
}
