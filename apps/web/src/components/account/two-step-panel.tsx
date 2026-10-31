"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Panel } from "@/components/ui";
import { apiFetch, describeFailure } from "@/lib/client-api";
import { AuthField } from "./auth-parts";
import { FormError, FormSuccess } from "./parts";

type Step = "idle" | "password" | "scan" | "codes" | "disable" | "replace";

const CODE_FIELD = {
  name: "code",
  inputMode: "text",
  autoComplete: "one-time-code",
  maxLength: 32,
  required: true,
} as const;

/** Two-step verification (D-54): off by default, turned on with an authenticator app. Every sensitive step asks for
 *  the password again, and turning it off or replacing recovery codes also needs a current code. */
export function TwoStepPanel({
  enabled,
  codesLeft,
  staff,
}: {
  enabled: boolean;
  codesLeft: number;
  staff: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("idle");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [setup, setSetup] = useState<{ secret: string; uri: string; qr: string | null } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);

  function open(next: Step) {
    setFailure(null);
    setStep(next);
  }

  function explain(outcome: Extract<Awaited<ReturnType<typeof apiFetch>>, { ok: false }>): string {
    if (outcome.code === "reauth_required") return "That password is not correct.";
    if (outcome.code === "invalid_code" || outcome.code === "rate_limited") return outcome.message;
    return describeFailure(outcome);
  }

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setFailure(null);
    const outcome = await apiFetch<{ secret: string; uri: string }>("POST", "me/two-step/setup", {
      password: String(form.get("password") ?? ""),
    });
    if (!outcome.ok) {
      setBusy(false);
      return setFailure(explain(outcome));
    }
    // Loaded only now, so the QR library is not part of the account page's first script.
    let qr: string | null = null;
    try {
      const { default: QRCode } = await import("qrcode");
      qr = await QRCode.toDataURL(outcome.data.uri, { margin: 2, width: 200, errorCorrectionLevel: "M" });
    } catch {
      qr = null; // the setup key below still works
    }
    setSetup({ ...outcome.data, qr });
    setBusy(false);
    setStep("scan");
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setFailure(null);
    const outcome = await apiFetch<{ recovery_codes: string[] }>("POST", "me/two-step/confirm", {
      code: String(form.get("code") ?? "").trim(),
    });
    setBusy(false);
    if (!outcome.ok) return setFailure(explain(outcome));
    setSetup(null);
    setCodes(outcome.data.recovery_codes);
    setStep("codes");
  }

  async function sensitive(event: FormEvent<HTMLFormElement>, kind: "disable" | "replace") {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setFailure(null);
    const body = {
      password: String(form.get("password") ?? ""),
      code: String(form.get("code") ?? "").trim(),
    };
    if (kind === "disable") {
      const outcome = await apiFetch("POST", "me/two-step/disable", body);
      setBusy(false);
      if (!outcome.ok) return setFailure(explain(outcome));
      setStep("idle");
      return router.refresh();
    }
    const outcome = await apiFetch<{ recovery_codes: string[] }>("POST", "me/two-step/recovery-codes", body);
    setBusy(false);
    if (!outcome.ok) return setFailure(explain(outcome));
    setCodes(outcome.data.recovery_codes);
    setStep("codes");
  }

  function finish() {
    setCodes(null);
    setStep("idle");
    router.refresh();
  }

  const passwordField = (
    <AuthField
      id="two_step_password"
      name="password"
      label="Your password"
      type="password"
      reveal
      autoComplete="current-password"
      required
      maxLength={128}
    />
  );

  return (
    <Panel role="region" aria-labelledby="two-step-title">
      <h2 id="two-step-title" className="text-title font-strong">
        Two-step verification
      </h2>
      <p className="mt-1 text-small text-muted">
        {enabled
          ? "On. Signing in needs your password and a 6-digit code from your authenticator app."
          : "Off. Add a code from an authenticator app so a stolen password alone cannot open your account."}
      </p>
      {failure ? (
        <div className="mt-3">
          <FormError>{failure}</FormError>
        </div>
      ) : null}

      {staff ? (
        <p className="mt-3 text-base text-muted">
          Staff accounts are protected in the staff workspace, where the second step is required.{" "}
          <a href="/workspace" className="text-accent underline">
            Open the staff workspace
          </a>
        </p>
      ) : step === "codes" && codes ? (
        <div className="mt-3 grid gap-3">
          <FormSuccess>
            <p className="font-strong">Save your recovery codes</p>
            <p className="mt-1">Each code works once if you lose your device. They are not shown again.</p>
          </FormSuccess>
          <ul
            className="m-0 grid list-none grid-cols-2 gap-1 p-0 font-mono text-base"
            aria-label="Recovery codes"
          >
            {codes.map((c) => (
              <li key={c}>
                <code>{c}</code>
              </li>
            ))}
          </ul>
          <div>
            <Button onClick={finish}>I have saved these codes</Button>
          </div>
        </div>
      ) : step === "password" ? (
        <form onSubmit={start} className="mt-3 grid gap-3">
          <p className="text-base">
            Enter your password to start. You stay signed in, and you can turn it off again at any time.
          </p>
          {passwordField}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Starting…" : "Continue"}
            </Button>
            <Button variant="secondary" onClick={() => open("idle")}>
              Cancel
            </Button>
          </div>
        </form>
      ) : step === "scan" && setup ? (
        <form onSubmit={confirm} className="mt-3 grid gap-3" noValidate>
          <p className="text-base">
            In an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, 1Password), scan
            this code, then enter the 6-digit code it shows.
          </p>
          {setup.qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- generated data URL, nothing to optimise
            <img
              src={setup.qr}
              width={200}
              height={200}
              alt="QR code that adds your UPNEXT account to an authenticator app"
              className="rounded-card border border-border bg-white"
            />
          ) : null}
          <p className="text-base">
            Cannot scan? Choose &ldquo;enter a setup key&rdquo;, pick time-based, and type:{" "}
            <code className="font-mono break-all">{setup.secret}</code>
          </p>
          <AuthField id="two_step_code" label="6-digit code" autoFocus {...CODE_FIELD} />
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Checking…" : "Turn on"}
            </Button>
            <Button variant="secondary" onClick={() => open("idle")}>
              Cancel
            </Button>
          </div>
        </form>
      ) : step === "disable" || step === "replace" ? (
        <form onSubmit={(e) => sensitive(e, step)} className="mt-3 grid gap-3" noValidate>
          <p className="text-base">
            {step === "disable"
              ? "To turn it off, confirm with your password and a current code. Your other signed-in browsers will be signed out."
              : "New recovery codes replace every old one. Confirm with your password and a current code."}
          </p>
          {passwordField}
          <AuthField id="two_step_code" label="Code or recovery code" {...CODE_FIELD} />
          <div className="flex gap-2">
            <Button type="submit" variant={step === "disable" ? "danger" : "primary"} disabled={busy}>
              {busy ? "Checking…" : step === "disable" ? "Turn off" : "Get new codes"}
            </Button>
            <Button variant="secondary" onClick={() => open("idle")}>
              Cancel
            </Button>
          </div>
        </form>
      ) : enabled ? (
        <div className="mt-3 grid gap-3">
          <p className="text-base">
            {codesLeft} recovery {codesLeft === 1 ? "code" : "codes"} left.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => open("replace")}>
              New recovery codes
            </Button>
            <Button variant="danger" onClick={() => open("disable")}>
              Turn off…
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <Button onClick={() => open("password")}>Turn on two-step verification</Button>
        </div>
      )}
    </Panel>
  );
}
