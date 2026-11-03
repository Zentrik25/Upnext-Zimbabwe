"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormError } from "@/components/account/parts";
import { Button, Field, Select, TextInput } from "@/components/ui";
import { apiFetch, describeFailure, type FieldErrors } from "@/lib/client-api";
import type { RoleChoice } from "@/lib/team-types";

/** Invite a staff member: name, email and one of the roles that already exist. No password is typed or sent. */
export function InviteForm({ roles }: { roles: RoleChoice[] }) {
  const router = useRouter();
  const [role, setRole] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const chosen = roles.find((r) => r.value === role);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setErrors({});
    setFailure(null);
    const result = await apiFetch<{ id: string }>("POST", "staff/team", {
      display_name: String(form.get("display_name") ?? ""),
      email: String(form.get("email") ?? ""),
      role,
    });
    setBusy(false);
    if (!result.ok) {
      if (result.code === "validation_failed") setErrors(result.fields);
      setFailure(describeFailure(result));
      return;
    }
    router.push(`/workspace/team/${result.data.id}?invited=1`);
    router.refresh();
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="grid max-w-[560px] gap-4 rounded-card border border-border-panel bg-surface p-4 shadow-subtle"
      aria-label="Invite staff"
    >
      {failure ? <FormError>{failure}</FormError> : null}
      <Field id="display_name" label="Full name" error={errors.display_name?.[0]}>
        <TextInput
          id="display_name"
          name="display_name"
          autoComplete="off"
          maxLength={80}
          required
          invalid={Boolean(errors.display_name)}
        />
      </Field>
      <Field
        id="email"
        label="Email address"
        hint="The invitation link goes to this address. It can be used once."
        error={errors.email?.[0]}
      >
        <TextInput
          id="email"
          name="email"
          type="email"
          autoComplete="off"
          maxLength={254}
          required
          invalid={Boolean(errors.email)}
        />
      </Field>
      <Field
        id="role"
        label="Role"
        hint={chosen?.summary ?? "Choose what this person may do."}
        error={errors.role?.[0]}
      >
        <Select
          id="role"
          value={role}
          invalid={Boolean(errors.role)}
          onChange={(ev) => setRole(ev.target.value)}
          required
        >
          <option value="">Choose a role…</option>
          {roles.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
      </Field>
      <p className="m-0 text-small text-muted">
        The person chooses their own password from the link and sets up two-step verification at first
        sign-in. Nothing is emailed except the link.
      </p>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send invitation"}
        </Button>
        <Button variant="secondary" onClick={() => router.push("/workspace/team")} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
