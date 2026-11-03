"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Checkbox, Panel } from "@/components/ui";
import { apiFetch, describeFailure } from "@/lib/client-api";
import type { TrustedDeviceInfo } from "@/lib/session";
import { FormError } from "./parts";

export const TRUST_DAYS = 30;

/** "Trust this device for 30 days", offered next to a code box. The server decides; this only asks. */
export function TrustDeviceCheckbox({
  checked,
  onChange,
  staff = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  staff?: boolean;
}) {
  return (
    <div className="grid gap-1">
      <Checkbox
        id="trust_device"
        name="trust_device"
        label={`Trust this device for ${TRUST_DAYS} days`}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-describedby="trust_device-hint"
      />
      <p id="trust_device-hint" className="m-0 text-small text-muted">
        {staff
          ? "Only on a device you own. Staff still enter a code at least every 24 hours."
          : "Only on a device you own. You will still be asked again on new browsers and after you change your password."}
      </p>
    </div>
  );
}

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(
    new Date(iso),
  ) + " UTC";

/** Account → Security: the browsers this person trusted, each with a way to forget it. */
export function TrustedDevicesPanel({
  devices,
  codeEveryHours,
}: {
  devices: TrustedDeviceInfo[];
  codeEveryHours: number | null;
}) {
  const router = useRouter();
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [gone, setGone] = useState<string[]>([]);
  const visible = devices.filter((d) => !gone.includes(d.id));

  async function forget(id: string | null) {
    setBusy(id ?? "all");
    setFailure(null);
    const outcome = await apiFetch("DELETE", id ? `me/trusted-devices/${id}` : "me/trusted-devices");
    setBusy(null);
    if (!outcome.ok) return setFailure(describeFailure(outcome));
    setGone((list) => (id ? [...list, id] : devices.map((d) => d.id)));
    router.refresh();
  }

  return (
    <Panel role="region" aria-labelledby="trusted-title">
      <h2 id="trusted-title" className="text-title font-strong">
        Trusted devices
      </h2>
      <p className="mt-1 text-small text-muted">
        A trusted device skips the code for {TRUST_DAYS} days after you enter your password.
        {codeEveryHours
          ? ` Staff accounts still enter a code at least every ${codeEveryHours} hours.`
          : ""}{" "}
        Changing your password or two-step settings forgets every device.
      </p>
      {failure ? (
        <div className="mt-3">
          <FormError>{failure}</FormError>
        </div>
      ) : null}
      {visible.length ? (
        <>
          <ul className="m-0 mt-3 grid list-none gap-3 p-0" aria-label="Trusted devices">
            {visible.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3"
              >
                <div className="text-base">
                  <p className="font-strong">
                    {d.label}
                    {d.current ? " (this browser)" : ""}
                  </p>
                  <p className="text-small text-muted">
                    Trusted {when(d.created_at)} · last used {when(d.last_used_at)} · code last entered{" "}
                    {when(d.last_mfa_at)} · expires {when(d.expires_at)}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => forget(d.id)}
                  disabled={busy !== null}
                  aria-label={`Forget ${d.label}, trusted ${when(d.created_at)}`}
                >
                  Forget
                </Button>
              </li>
            ))}
          </ul>
          {visible.length > 1 ? (
            <div className="mt-3">
              <Button variant="secondary" onClick={() => forget(null)} disabled={busy !== null}>
                Forget all trusted devices
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <p className="m-0 mt-3 text-ctl text-muted">
          No trusted devices. Tick “Trust this device for {TRUST_DAYS} days” when you enter a code to add this
          one.
        </p>
      )}
    </Panel>
  );
}
