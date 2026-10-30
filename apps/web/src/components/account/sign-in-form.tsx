"use client";

import { useRouter } from "next/navigation";
import { lazy, Suspense, useState, type FormEvent, type ReactNode } from "react";
import { Button, Icon } from "@/components/ui";
import { IconField } from "./auth-parts";
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
    const outcome = await apiFetch<{ roles?: string[] }>("POST", "auth/login", {
      email,
      password: String(form.get("password") ?? ""),
      remember: form.get("remember") === "on",
    });
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
    <form onSubmit={submit} className="grid gap-4">
      {notice && !failure ? notice : null}
      {failure ? <FormError>{failure}</FormError> : null}
      {unverifiedEmail ? (
        <Suspense fallback={null}>
          <ResendVerification email={unverifiedEmail} />
        </Suspense>
      ) : null}
      <IconField
        id="email"
        name="email"
        label="E-mail address"
        icon="mail"
        type="email"
        placeholder="you@example.com"
        autoComplete="username"
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
        placeholder="Enter your password"
        autoComplete="current-password"
        required
        maxLength={128}
      />
      {options}
      <Button type="submit" disabled={busy} className="min-h-field gap-2">
        <Icon name="signIn" className="h-[18px] w-[18px]" />
        {busy ? "Signing in…" : "Sign in"}
      </Button>
      {social}
    </form>
  );
}
