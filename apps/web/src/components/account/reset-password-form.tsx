"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Button, Field, TextInput } from "@/components/ui";
import { apiFetch, describeFailure, type FieldErrors } from "@/lib/client-api";
import { FormError, FormSuccess } from "./parts";

/** Removes the one-time token from the visible address once the page has it (SECURITY_ARCHITECTURE §3.4). */
export function useStripTokenFromUrl(): void {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("token")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);
}

export function ResetPasswordForm({ token }: { token: string | null }) {
  useStripTokenFromUrl();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [state, setState] = useState<"form" | "done" | "invalid">("form");

  if (!token || state === "invalid") {
    return (
      <div className="grid gap-4">
        <FormError>This link is invalid or has expired.</FormError>
        <p className="text-ctl">
          <Link href="/forgot-password" className="text-accent underline">
            Request a new link
          </Link>
        </p>
      </div>
    );
  }
  if (state === "done") {
    return (
      <div className="grid gap-4">
        <FormSuccess>
          <p className="font-strong">Password changed</p>
          <p className="mt-1">You have been signed out everywhere. Sign in with your new password.</p>
        </FormSuccess>
        <p>
          <Link href="/sign-in" className="text-accent underline">
            Go to sign in
          </Link>
        </p>
      </div>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setErrors({});
    setFailure(null);
    const outcome = await apiFetch("POST", "auth/password-reset/confirm", {
      token,
      new_password: String(form.get("new_password") ?? ""),
    });
    setBusy(false);
    if (outcome.ok) return setState("done");
    if (outcome.code === "invalid_token") return setState("invalid");
    if (outcome.code === "validation_failed") setErrors(outcome.fields);
    else setFailure(describeFailure(outcome));
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      {failure ? <FormError>{failure}</FormError> : null}
      <Field
        id="new_password"
        label="New password"
        hint="At least 10 characters."
        error={errors.new_password?.[0]}
      >
        <TextInput
          id="new_password"
          name="new_password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          maxLength={128}
          invalid={Boolean(errors.new_password)}
        />
      </Field>
      <Button type="submit" disabled={busy}>
        {busy ? "Saving…" : "Change password"}
      </Button>
    </form>
  );
}
