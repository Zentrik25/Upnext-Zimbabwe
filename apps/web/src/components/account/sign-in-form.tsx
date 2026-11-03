"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { lazy, Suspense, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui";
import { AuthField } from "./auth-parts";
import { apiFetch, describeFailure } from "@/lib/client-api";
import { safeNext } from "@/lib/safe-next";
import { FormError } from "./parts";

// Only shown after a "confirm your e-mail first" answer, so it loads on demand and stays out of the first script.
const ResendVerification = lazy(() =>
  import("./resend-verification").then((m) => ({ default: m.ResendVerification })),
);

/** `social` is rendered by the page (a server component) so the Google button and its logo stay out of this
 *  client bundle, which the mobile script budget (150 KiB) measures. */
export function SignInForm({
  next,
  notice,
  options,
  social,
}: {
  next?: string;
  notice?: ReactNode;
  options?: ReactNode;
  social?: ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    setBusy(true);
    setFailure(null);
    setUnverifiedEmail(null);
    const outcome = await apiFetch<{ roles?: string[]; two_step_required?: boolean }>("POST", "auth/login", {
      email,
      password: String(form.get("password") ?? ""),
      remember: form.get("remember") === "on",
    });
    if (outcome.ok && outcome.data?.two_step_required) {
      // Correct password, no session yet: the code comes next (D-54).
      router.replace(`/sign-in/two-step?next=${encodeURIComponent(safeNext(next, "/account"))}`);
      return;
    }
    if (outcome.ok) {
      // Staff go straight to the workspace (and its second step) unless they were sent here from somewhere.
      const staff = (outcome.data?.roles?.length ?? 0) > 0;
      router.replace(safeNext(next, staff ? "/workspace" : "/account"));
      router.refresh();
      return;
    }
    setBusy(false);
    if (outcome.code === "email_not_verified") setUnverifiedEmail(email);
    setFailure(
      outcome.code === "validation_failed"
        ? "Enter your e-mail address and password."
        : describeFailure(outcome),
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      {notice && !failure ? notice : null}
      {failure ? <FormError>{failure}</FormError> : null}
      {unverifiedEmail ? (
        <Suspense fallback={null}>
          <ResendVerification email={unverifiedEmail} />
        </Suspense>
      ) : null}
      <AuthField
        id="email"
        name="email"
        label="E-mail address"
        type="email"
        autoComplete="username"
        required
        maxLength={254}
      />
      <AuthField
        id="password"
        name="password"
        label="Password"
        type="password"
        reveal
        aside={
          <Link
            href="/forgot-password"
            className="inline-flex min-h-[24px] items-center text-ctl text-accent"
          >
            Forgot your password?
          </Link>
        }
        autoComplete="current-password"
        required
        maxLength={128}
      />
      {options}
      <Button type="submit" disabled={busy} className="sm:min-h-field">
        {busy ? "Signing in…" : "Sign in"}
      </Button>
      {social}
    </form>
  );
}
