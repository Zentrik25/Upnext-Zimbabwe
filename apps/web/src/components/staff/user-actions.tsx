"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Field, Select, Textarea } from "@/components/ui";
import { apiFetch } from "@/lib/client-api";
import type { StaffAccount } from "@/lib/staff-types";
import { words } from "@/lib/staff-format";
import { Notice } from "./primitives";

type Mode = "grant" | "revoke" | "reset-two-step";

/** Role and two-step actions for one staff account. Every change needs a written reason and is audited. */
export function UserActions({
  account,
  manageable,
  isSelf,
}: {
  account: StaffAccount;
  manageable: string[];
  isSelf: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (isSelf) return <span className="text-small text-muted">This is you</span>;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    const result = await apiFetch("POST", `staff/users/${account.id}/${mode}`, {
      reason: String(form.get("reason") ?? ""),
      ...(mode !== "reset-two-step" ? { role: String(form.get("role") ?? "") } : {}),
    });
    setBusy(false);
    if (!result.ok) {
      setError(`${result.message} ${Object.values(result.fields).flat().join(" ")}`.trim());
      return;
    }
    setMode(null);
    router.refresh();
  }

  const heldManageable = manageable.filter((r) => account.roles.includes(r));
  const grantable = manageable.filter((r) => !account.roles.includes(r));
  if (!mode) {
    return (
      <div className="flex flex-wrap justify-end gap-1.5">
        {grantable.length ? (
          <Button
            variant="secondary"
            className="min-h-[32px] px-2.5 py-1 text-small"
            onClick={() => setMode("grant")}
          >
            Grant role
          </Button>
        ) : null}
        {heldManageable.length ? (
          <Button
            variant="secondary"
            className="min-h-[32px] px-2.5 py-1 text-small"
            onClick={() => setMode("revoke")}
          >
            Revoke role
          </Button>
        ) : null}
        {account.two_step_enrolled ? (
          <Button
            variant="danger"
            className="min-h-[32px] px-2.5 py-1 text-small"
            onClick={() => setMode("reset-two-step")}
          >
            Reset two-step
          </Button>
        ) : null}
      </div>
    );
  }
  const roles = mode === "grant" ? grantable : heldManageable;
  return (
    <form
      onSubmit={submit}
      className="grid gap-3 rounded-card border border-line bg-surface p-3 text-left"
      noValidate
    >
      <p className="text-ctl font-medium">
        {mode === "reset-two-step" ? "Reset two-step verification" : `${words(mode)} role`} -{" "}
        {account.display_name}
      </p>
      {mode === "reset-two-step" ? (
        <p className="text-small text-muted">
          Their sessions end and they set up a new authenticator at next sign-in.
        </p>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {mode !== "reset-two-step" ? (
        <Field id={`role-${account.id}`} label="Role">
          <Select id={`role-${account.id}`} name="role" defaultValue={roles[0]}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {words(r)}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field id={`why-${account.id}`} label="Reason" hint="10 to 500 characters. Recorded in the audit log.">
        <Textarea id={`why-${account.id}`} name="reason" rows={3} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" variant={mode === "reset-two-step" ? "danger" : "primary"} disabled={busy}>
          {busy ? "Saving…" : "Confirm"}
        </Button>
        <Button variant="secondary" onClick={() => setMode(null)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
