"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button, Field, TextInput } from "@/components/ui";
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
      <div className="grid gap-4">
        <FormSuccess>
          <p className="font-strong">Check your e-mail</p>
          <p className="mt-1">
            If an account uses this address, we have sent a link to choose a new password. It may take a few
            minutes and works for 60 minutes.
          </p>
        </FormSuccess>
        <p className="text-ctl">
          <Link href="/sign-in" className="text-accent underline">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="grid gap-4">
      {failure ? <FormError>{failure}</FormError> : null}
      <Field id="email" label="E-mail address">
        <TextInput id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
      </Field>
      <Button type="submit" disabled={busy}>
        {busy ? "Sending…" : "Send reset link"}
      </Button>
      <p className="text-ctl">
        <Link href="/sign-in" className="text-accent underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
