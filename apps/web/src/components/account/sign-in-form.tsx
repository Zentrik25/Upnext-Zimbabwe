"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Icon } from "@/components/ui";
import { IconField } from "./auth-parts";
import { apiFetch, describeFailure } from "@/lib/client-api";
import { safeNext } from "@/lib/safe-next";
import { FormError } from "./parts";
import { ResendVerification } from "./resend-verification";

export function SignInForm({ next }: { next?: string }) {
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
    const outcome = await apiFetch("POST", "auth/login", {
      email,
      password: String(form.get("password") ?? ""),
    });
    if (outcome.ok) {
      router.replace(safeNext(next));
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
      <div className="-mt-1 text-right text-ctl">
        <Link href="/forgot-password" className="inline-flex min-h-[44px] items-center text-accent underline">
          Forgot your password?
        </Link>
      </div>
      <Button type="submit" disabled={busy} className="min-h-field gap-2">
        <Icon name="signIn" className="h-[18px] w-[18px]" />
        {busy ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-center text-ctl">
        Don’t have an account?{" "}
        <Link href="/register" className="text-accent underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
