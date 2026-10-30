"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button, Select } from "@/components/ui";
import { apiFetch, describeFailure, type FieldErrors } from "@/lib/client-api";
import { COUNTRY_CODES, toE164 } from "@/lib/phone";
import { GoogleButton, OrDivider } from "./google-button";
import { IconField } from "./auth-parts";
import { FormError, FormSuccess } from "./parts";
import { ResendVerification } from "./resend-verification";

export function RegisterForm({ googleEnabled = false }: { googleEnabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const problems: FieldErrors = {};
    if (password !== String(form.get("confirm_password") ?? "")) {
      problems.confirm_password = ["The two passwords do not match."];
    }
    if (form.get("accept_terms") !== "on") {
      problems.accept_terms = ["Tick the box to agree to the Terms of Service and Privacy Policy."];
    }
    const phone = toE164(String(form.get("country_code") ?? "+263"), String(form.get("phone") ?? ""));
    if (!phone) problems.phone_number = ["Enter your phone number."];
    setFailure(null);
    if (Object.keys(problems).length) {
      setErrors(problems);
      return;
    }
    setBusy(true);
    setErrors({});
    const outcome = await apiFetch("POST", "auth/register", {
      email,
      password,
      display_name: String(form.get("display_name") ?? "").trim(),
      phone_number: phone,
      accept_terms: true,
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
          Already confirmed? <Link href="/sign-in">Sign in</Link>
        </p>
      </div>
    );
  }

  const phoneError = errors.phone_number?.[0];
  const termsError = errors.accept_terms?.[0];
  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      {failure ? <FormError>{failure}</FormError> : null}
      <IconField
        id="display_name"
        name="display_name"
        label="Full name"
        icon="user"
        placeholder="Enter your full name"
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

      <div className="grid gap-[5px]">
        <label htmlFor="phone" className="text-ctl font-medium text-check-text">
          Phone number
        </label>
        <div className="grid grid-cols-[minmax(0,150px)_1fr] gap-2 max-sm:grid-cols-[minmax(0,128px)_1fr]">
          <div>
            <label htmlFor="country_code" className="sr-only">
              Country code
            </label>
            <Select id="country_code" name="country_code" defaultValue="+263" autoComplete="tel-country-code">
              {COUNTRY_CODES.map((c) => (
                <option key={c.code + c.label} value={c.code}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="78 123 4567"
            required
            maxLength={20}
            aria-invalid={phoneError ? true : undefined}
            aria-describedby={phoneError ? "phone-error" : "phone-hint"}
            className="block min-h-field w-full rounded-control border border-control-border bg-surface px-3 text-ctl font-light text-ink focus-visible:border-focus focus-visible:ring-1 focus-visible:ring-focus aria-[invalid=true]:border-danger aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-danger"
          />
        </div>
        {phoneError ? (
          <p id="phone-error" role="alert" className="text-small text-danger">
            <span className="font-strong">Error:</span> {phoneError}
          </p>
        ) : (
          <p id="phone-hint" className="text-small text-muted">
            Choose your country code and enter the number without it.
          </p>
        )}
      </div>

      <IconField
        id="password"
        name="password"
        label="Password"
        icon="lock"
        type="password"
        reveal
        placeholder="Create a strong password"
        hint="At least 10 characters. Choose something not easy to guess; a few unrelated words work well."
        error={errors.password?.[0]}
        autoComplete="new-password"
        required
        minLength={10}
        maxLength={128}
      />
      <IconField
        id="confirm_password"
        name="confirm_password"
        label="Confirm password"
        icon="lock"
        type="password"
        reveal
        placeholder="Confirm your password"
        error={errors.confirm_password?.[0]}
        autoComplete="new-password"
        required
        maxLength={128}
      />

      <div className="grid gap-1">
        <label htmlFor="accept_terms" className="flex items-start gap-3 text-ctl text-check-text">
          <input
            id="accept_terms"
            name="accept_terms"
            type="checkbox"
            className="mt-0.5 accent-accent"
            aria-invalid={termsError ? true : undefined}
            aria-describedby={termsError ? "terms-error" : undefined}
          />
          <span>
            I agree to the <Link href="/terms">Terms of Service</Link> and{" "}
            <Link href="/privacy">Privacy Policy</Link>
          </span>
        </label>
        {termsError ? (
          <p id="terms-error" role="alert" className="text-small text-danger">
            <span className="font-strong">Error:</span> {termsError}
          </p>
        ) : null}
      </div>

      <Button type="submit" disabled={busy} className="min-h-field">
        {busy ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-small text-muted" data-testid="legal-notice">
        Read the <Link href="/terms">Terms of Service</Link> and the{" "}
        <Link href="/privacy">Privacy Policy</Link>. We record when you agree and to which version. This does
        not sign you up for any e-mail alerts.
      </p>
      <OrDivider />
      <GoogleButton enabled={googleEnabled} />
      <p className="text-center text-ctl">
        Already have an account? <Link href="/sign-in">Log in</Link>
      </p>
    </form>
  );
}
