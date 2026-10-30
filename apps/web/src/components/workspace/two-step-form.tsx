"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormError } from "@/components/account/parts";
import { Button, ButtonLink, Field, TextInput } from "@/components/ui";
import { apiFetch, describeFailure } from "@/lib/client-api";

/** Two-step verification: enrol (setup key, then a code) or enter a code. The API holds the rules and the limits. */
export function TwoStepForm({
  enrolling,
  secret,
  uri,
  qr,
  next,
}: {
  enrolling: boolean;
  secret?: string;
  uri?: string;
  qr?: string;
  next: string;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailure(null);
    const result = await apiFetch<{ verified: boolean; recovery_codes?: string[] }>(
      "POST",
      "staff/two-step",
      { code },
    );
    setBusy(false);
    if (!result.ok) {
      setFailure(
        result.code === "invalid_code" || result.code === "rate_limited"
          ? result.message
          : describeFailure(result),
      );
      return;
    }
    if (result.data.recovery_codes) setCodes(result.data.recovery_codes);
    else {
      router.replace(next);
      router.refresh();
    }
  }

  if (codes)
    return (
      <div className="grid gap-4">
        <h1 className="m-0 text-section font-light tracking-section">Two-step verification is on</h1>
        <p className="m-0 text-base text-muted">
          Save these recovery codes somewhere safe. Each works once if you lose your device, and they are not
          shown again.
        </p>
        <ul className="m-0 grid list-none gap-1 p-0 font-mono text-base" aria-label="Recovery codes">
          {codes.map((c) => (
            <li key={c}>
              <code>{c}</code>
            </li>
          ))}
        </ul>
        <ButtonLink href={next}>Continue to the workspace</ButtonLink>
      </div>
    );

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <h1 className="m-0 text-section font-light tracking-section">
        {enrolling ? "Set up two-step verification" : "Enter your verification code"}
      </h1>
      {enrolling ? (
        <>
          <p className="m-0 text-base text-muted">
            Staff accounts need a second step. In an authenticator app (Google Authenticator, Microsoft
            Authenticator, Authy, 1Password), scan this code, then enter the 6-digit code it shows.
          </p>
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- generated data URL, nothing to optimise
            <img
              src={qr}
              width={224}
              height={224}
              alt="QR code that adds your UPNEXT account to an authenticator app"
              className="rounded-card border border-border bg-white"
            />
          ) : null}
          <p className="m-0 text-base">
            Cannot scan? Choose &ldquo;enter a setup key&rdquo;, pick time-based, and type this key:{" "}
            <code className="font-mono">{secret}</code>
          </p>
          {uri ? (
            <p className="m-0 text-small text-muted">
              Or open this link on the device that has your authenticator:{" "}
              <a className="text-accent underline break-all" href={uri}>
                {uri}
              </a>
            </p>
          ) : null}
        </>
      ) : (
        <p className="m-0 text-base text-muted">
          Enter the 6-digit code from your authenticator app, or one of your recovery codes. If it keeps
          failing, check that your phone&apos;s date and time are set automatically.
        </p>
      )}
      {failure ? <FormError>{failure}</FormError> : null}
      <Field id="code" label="Code">
        <TextInput
          id="code"
          inputMode="text"
          autoComplete="one-time-code"
          maxLength={32}
          required
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </Field>
      <div>
        <Button type="submit" disabled={busy || code.trim() === ""}>
          {busy ? "Checking…" : enrolling ? "Turn on two-step verification" : "Verify"}
        </Button>
      </div>
    </form>
  );
}
