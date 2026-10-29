"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui";
import { IconField } from "./auth-parts";
import { apiFetch, describeFailure, type FieldErrors } from "@/lib/client-api";
import { FormError, FormSuccess } from "./parts";
import { ResendVerification } from "./resend-verification";

export function RegisterForm() {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    setBusy(true);
    setErrors({});
    setFailure(null);
    const outcome = await apiFetch("POST", "auth/register", {
      email,
      password: String(form.get("password") ?? ""),
      display_name: String(form.get("display_name") ?? "").trim(),
    });
    setBusy(false);
    if (outcome.ok) return setDone(email);
    if (outcome.code === "validation_failed") setErrors(outcome.fields);
    else setFailure(describeFailure(outcome));
  }

  if (done) {
    return (
      <div className="grid gap-4">
        <FormSuccess>
          <p className="font-strong">Check your e-mail</p>
          <p className="mt-1">
            If this address can be used, we have sent a message with a link to confirm it. It may take a few
            minutes. The link works once and expires in 24 hours.
          </p>
        </FormSuccess>
        <ResendVerification email={done} />
        <p className="text-ctl">
          Already confirmed?{" "}
          <Link href="/sign-in" className="text-accent underline">
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate={false}>
      {failure ? <FormError>{failure}</FormError> : null}
      <IconField
        id="display_name"
        name="display_name"
        label="Name"
        icon="user"
        placeholder="Your name"
        hint="How we address you. 1 to 80 characters."
        error={errors.display_name?.[0]}
        autoComplete="name"
        required
        maxLength={80}
      />
      <IconField
        id="email"
        name="email"
        label="E-mail address"
        icon="mail"
        type="email"
        placeholder="you@example.com"
        error={errors.email?.[0]}
        autoComplete="email"
        required
        maxLength={254}
      />
      <IconField
        id="password"
        name="password"
        label="Password"
        icon="lock"
        type="password"
        reveal
        placeholder="At least 10 characters"
        hint="At least 10 characters. Choose something not easy to guess; a few unrelated words work well."
        error={errors.password?.[0]}
        autoComplete="new-password"
        required
        minLength={10}
        maxLength={128}
      />
      <Button type="submit" disabled={busy} className="min-h-field">
        {busy ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-small text-muted" data-testid="legal-notice">
        By creating an account you agree to the{" "}
        <Link href="/terms" className="text-accent underline">
          Terms of Service
        </Link>{" "}
        and acknowledge the{" "}
        <Link href="/privacy" className="text-accent underline">
          Privacy Policy
        </Link>
        . This does not sign you up for any e-mail alerts.
      </p>
      <p className="text-center text-ctl">
        Already have an account?{" "}
        <Link href="/sign-in" className="text-accent underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
