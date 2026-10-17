"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button, Field, TextInput } from "@/components/ui";
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
      <Field
        id="display_name"
        label="Name"
        hint="How we address you. 1 to 80 characters."
        error={errors.display_name?.[0]}
      >
        <TextInput
          id="display_name"
          name="display_name"
          autoComplete="name"
          required
          maxLength={80}
          invalid={Boolean(errors.display_name)}
        />
      </Field>
      <Field id="email" label="E-mail address" error={errors.email?.[0]}>
        <TextInput
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          invalid={Boolean(errors.email)}
        />
      </Field>
      <Field
        id="password"
        label="Password"
        hint="At least 10 characters. Choose something not easy to guess; a few unrelated words work well."
        error={errors.password?.[0]}
      >
        <TextInput
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          maxLength={128}
          invalid={Boolean(errors.password)}
        />
      </Field>
      <Button type="submit" disabled={busy}>
        {busy ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-ctl">
        Already have an account?{" "}
        <Link href="/sign-in" className="text-accent underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
