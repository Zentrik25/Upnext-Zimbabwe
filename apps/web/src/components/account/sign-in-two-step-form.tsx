"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui";
import { apiFetch, describeFailure } from "@/lib/client-api";
import { safeNext } from "@/lib/safe-next";
import { AuthField } from "./auth-parts";
import { FormError } from "./parts";

/** The second step of sign-in (D-54): a code from the authenticator app, or an unused recovery code. */
export function SignInTwoStepForm({ next }: { next?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setFailure(null);
    const outcome = await apiFetch<{ roles?: string[] }>("POST", "auth/login/two-step", {
      code: String(form.get("code") ?? "").trim(),
    });
    if (outcome.ok) {
      const staff = (outcome.data?.roles?.length ?? 0) > 0;
      router.replace(safeNext(next, staff ? "/workspace" : "/account"));
      router.refresh();
      return;
    }
    setBusy(false);
    if (outcome.code === "two_step_expired") setExpired(true);
    setFailure(
      outcome.code === "invalid_code" ||
        outcome.code === "rate_limited" ||
        outcome.code === "two_step_expired"
        ? outcome.message
        : describeFailure(outcome),
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-3" noValidate>
      <p className="text-ctl text-muted">
        Enter the 6-digit code from your authenticator app, or one of your recovery codes.
      </p>
      {failure ? <FormError>{failure}</FormError> : null}
      {expired ? (
        <Link
          href="/sign-in"
          className="inline-flex min-h-[24px] items-center text-ctl text-accent underline"
        >
          Back to sign in
        </Link>
      ) : (
        <>
          <AuthField
            id="code"
            name="code"
            label="Verification code"
            inputMode="text"
            autoComplete="one-time-code"
            autoFocus
            required
            maxLength={32}
          />
          <Button type="submit" disabled={busy} className="sm:min-h-field">
            {busy ? "Checking…" : "Verify and sign in"}
          </Button>
          <Link href="/sign-in" className="inline-flex min-h-[24px] items-center text-ctl text-accent">
            Use a different account
          </Link>
        </>
      )}
    </form>
  );
}
