"use client";

import { useState, type FormEvent } from "react";
import { NavLogo } from "@/components/brand/logo";
import { Button, Field, TextInput } from "@/components/ui";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { apiFetch, type ApiOutcome } from "@/lib/client-api";
import type { StaffSession } from "@/lib/staff-types";
import { Notice } from "./primitives";

type Step = "password" | "code" | "enrol" | "recovery";

/** Staff sign-in: password, then the second step (authenticator code or recovery code, or first-time set-up). */
export function StaffSignIn({ next }: { next: string }) {
  const [step, setStep] = useState<Step>("password");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [recovery, setRecovery] = useState<string[]>([]);

  function fail(result: Extract<ApiOutcome, { ok: false }>) {
    setError(result.message);
    setBusy(false);
  }

  function finish() {
    // A full page load on purpose: the console shell reads the fresh session on the server.
    window.location.assign(next);
  }

  async function afterPassword() {
    const session = await apiFetch<StaffSession>("GET", "staff/session");
    if (!session.ok) {
      await apiFetch("POST", "auth/logout");
      setError("This account does not have staff access.");
      setBusy(false);
      return;
    }
    const { mfa } = session.data;
    if (!mfa.required || mfa.verified) return finish();
    if (mfa.enrolled) {
      setStep("code");
      setBusy(false);
      return;
    }
    const enrolment = await apiFetch<{ secret: string; uri: string }>("GET", "staff/mfa/enrolment");
    if (!enrolment.ok) return fail(enrolment);
    setSetup(enrolment.data);
    setStep("enrol");
    setBusy(false);
  }

  async function onPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    const result = await apiFetch("POST", "auth/login", {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    if (!result.ok) return fail(result);
    await afterPassword();
  }

  async function onCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "");
    setBusy(true);
    setError(null);
    if (step === "code") {
      const result = await apiFetch("POST", "staff/mfa/verify", { code });
      if (!result.ok) return fail(result);
      return finish();
    }
    const result = await apiFetch<{ recovery_codes: string[] }>("POST", "staff/mfa/enrolment", { code });
    if (!result.ok) return fail(result);
    setRecovery(result.data.recovery_codes);
    setStep("recovery");
    setBusy(false);
  }

  return (
    <div className="grid min-h-screen place-items-center bg-(--staff-canvas) px-4 py-10">
      <main id="main" className="w-full max-w-[440px]">
        <div className="mb-6 flex items-center justify-between text-logo">
          <NavLogo className="h-[26px] w-auto" />
          <span className="sr-only">UPNEXT Careers</span>
          <span className="rounded-micro border border-line px-1.5 text-micro uppercase tracking-eyebrow text-muted">
            Staff
          </span>
        </div>
        <div className="rounded-feature border border-border-panel bg-(--staff-card) p-7 shadow-ambient max-sm:p-5">
          {step === "password" ? (
            <form onSubmit={onPassword} className="grid gap-4" noValidate>
              <h1 className="text-title tracking-title text-ink">Staff sign-in</h1>
              <p className="text-ctl text-muted">
                For editors, contributors and administrators. Two-step verification follows.
              </p>
              {error ? <Notice tone="error">{error}</Notice> : null}
              <Field id="staff-email" label="Email">
                <TextInput id="staff-email" name="email" type="email" autoComplete="username" required />
              </Field>
              <Field id="staff-password" label="Password">
                <TextInput
                  id="staff-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </Field>
              <Button type="submit" disabled={busy}>
                {busy ? "Signing in…" : "Continue"}
              </Button>
            </form>
          ) : null}

          {step === "code" || step === "enrol" ? (
            <form onSubmit={onCode} className="grid gap-4" noValidate>
              <h1 className="text-title tracking-title text-ink">
                {step === "enrol" ? "Set up two-step verification" : "Two-step verification"}
              </h1>
              {step === "enrol" && setup ? (
                <div className="grid gap-3 text-ctl text-ink">
                  <p>
                    Add this account to an authenticator app (for example Google Authenticator, Microsoft
                    Authenticator or Authy) with the setup key, then enter the 6-digit code it shows.
                  </p>
                  <p>
                    Setup key{" "}
                    <code className="block break-all rounded-control border border-line bg-surface-pale px-2 py-2 font-mono text-ctl tracking-wider">
                      {setup.secret}
                    </code>
                  </p>
                  <p className="text-small text-muted">
                    Time-based (TOTP), 6 digits, 30 seconds.{" "}
                    <a href={setup.uri} className="text-accent underline">
                      Open in an authenticator app on this device
                    </a>
                  </p>
                </div>
              ) : (
                <p className="text-ctl text-muted">
                  Enter the current code from your authenticator app, or one unused recovery code.
                </p>
              )}
              {error ? <Notice tone="error">{error}</Notice> : null}
              <Field id="staff-code" label="Code">
                <TextInput
                  id="staff-code"
                  name="code"
                  inputMode="text"
                  autoComplete="one-time-code"
                  required
                  autoFocus
                  className="tnum tracking-wider"
                />
              </Field>
              <Button type="submit" disabled={busy}>
                {busy ? "Checking…" : step === "enrol" ? "Confirm and continue" : "Verify"}
              </Button>
            </form>
          ) : null}

          {step === "recovery" ? (
            <div className="grid gap-4">
              <h1 className="text-title tracking-title text-ink">Save your recovery codes</h1>
              <p className="text-ctl text-muted">
                Each code works once if you lose your device. They are shown only now: store them somewhere
                safe.
              </p>
              <ul className="grid grid-cols-2 gap-2 rounded-control border border-line bg-surface-pale p-3 font-mono text-ctl">
                {recovery.map((code) => (
                  <li key={code}>
                    <code>{code}</code>
                  </li>
                ))}
              </ul>
              <Button onClick={finish}>I have saved them - continue</Button>
            </div>
          ) : null}
        </div>
        <div className="mt-4 flex items-center justify-between text-small text-muted">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className="underline">
            Back to the public site
          </a>
          <ThemeToggle className="text-muted [&_button]:!text-muted [&_button[aria-pressed=true]]:!bg-match-bg [&_button[aria-pressed=true]]:!text-secondary-text" />
        </div>
      </main>
    </div>
  );
}
