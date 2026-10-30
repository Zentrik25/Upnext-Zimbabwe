"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Icon } from "@/components/ui";
import { IconField } from "./auth-parts";
import { apiFetch, describeFailure } from "@/lib/client-api";
import { safeNext } from "@/lib/safe-next";
import { GoogleButton, OrDivider } from "./google-button";
import { FormError } from "./parts";
import { ResendVerification } from "./resend-verification";

export function SignInForm({
  next,
  googleEnabled = false,
  googleFailed = false,
}: {
  next?: string;
  googleEnabled?: boolean;
  googleFailed?: boolean;
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
      {googleFailed && !failure ? (
        <FormError>
          Google sign-in did not work. Try again, or sign in with your e-mail and password.
        </FormError>
      ) : null}
      {failure ? <FormError>{failure}</FormError> : null}
      {unverifiedEmail ? <ResendVerification email={unverifiedEmail} /> : null}
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
      <div className="-mt-1 flex flex-wrap items-center justify-between gap-x-4 text-ctl">
        <label htmlFor="remember" className="inline-flex min-h-[44px] items-center gap-3 text-check-text">
          <input id="remember" name="remember" type="checkbox" className="accent-accent" />
          Remember me
        </label>
        <Link href="/forgot-password" className="inline-flex min-h-[44px] items-center text-accent">
          Forgot your password?
        </Link>
      </div>
      <Button type="submit" disabled={busy} className="min-h-field gap-2">
        <Icon name="signIn" className="h-[18px] w-[18px]" />
        {busy ? "Signing in…" : "Sign in"}
      </Button>
      <OrDivider />
      <GoogleButton enabled={googleEnabled} next={safeNext(next)} />
      <p className="text-center text-ctl">
        Don’t have an account?{" "}
        <Link href="/register" className="text-accent underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
