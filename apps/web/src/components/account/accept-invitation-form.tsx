"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui";
import { AuthField, AuthSwitch } from "./auth-parts";
import { apiFetch, describeFailure, type FieldErrors } from "@/lib/client-api";
import { FormError, FormSuccess } from "./parts";
import { useStripTokenFromUrl } from "./reset-password-form";

/**
 * A staff invitation: the person chooses their own password from the one-time link. No password is ever sent
 * to them. The token leaves the address bar as soon as the page has it.
 */
export function AcceptInvitationForm({ token }: { token: string | null }) {
  useStripTokenFromUrl();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [state, setState] = useState<"form" | "done" | "invalid">("form");

  if (!token || state === "invalid") {
    return (
      <div className="grid gap-3">
        <FormError>This invitation link is invalid or has expired.</FormError>
        <p className="m-0 text-ctl text-muted">
          Ask an administrator to send you a new invitation. Each link works once.
        </p>
        <AuthSwitch>
          <Link href="/sign-in">Go to sign in</Link>
        </AuthSwitch>
      </div>
    );
  }
  if (state === "done") {
    return (
      <div className="grid gap-3">
        <FormSuccess>
          <p className="font-strong">Your account is ready</p>
          <p className="mt-1">
            Sign in with your email address and the password you just chose. You will set up two-step
            verification the first time.
          </p>
        </FormSuccess>
        <AuthSwitch>
          <Link href="/sign-in">Go to sign in</Link>
        </AuthSwitch>
      </div>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirm") ?? "")) {
      setErrors({ confirm: ["The two passwords do not match."] });
      return;
    }
    setBusy(true);
    setErrors({});
    setFailure(null);
    const outcome = await apiFetch("POST", "auth/staff-invitation/accept", { token, password });
    setBusy(false);
    if (outcome.ok) return setState("done");
    if (outcome.code === "invalid_token") return setState("invalid");
    if (outcome.code === "validation_failed") setErrors(outcome.fields);
    else setFailure(describeFailure(outcome));
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <p className="m-0 text-ctl text-muted">
        Choose a password for your UPNEXT Careers staff account. Use a long phrase that you do not use
        anywhere else.
      </p>
      {failure ? <FormError>{failure}</FormError> : null}
      <AuthField
        id="password"
        name="password"
        label="Password"
        type="password"
        reveal
        hint="At least 10 characters."
        error={errors.password?.[0]}
        autoComplete="new-password"
        required
        minLength={10}
        maxLength={128}
      />
      <AuthField
        id="confirm"
        name="confirm"
        label="Repeat the password"
        type="password"
        error={errors.confirm?.[0]}
        autoComplete="new-password"
        required
        minLength={10}
        maxLength={128}
      />
      <Button type="submit" disabled={busy} className="sm:min-h-field">
        {busy ? "Saving…" : "Accept invitation"}
      </Button>
    </form>
  );
}
