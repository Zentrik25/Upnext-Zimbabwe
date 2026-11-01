"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormError, FormSuccess } from "@/components/account/parts";
import { Button, Field, TextInput } from "@/components/ui";
import { apiFetch, describeFailure } from "@/lib/client-api";

/** Edit the one profile detail an Administrator may change: the display name. */
export function TeamNameForm({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await apiFetch("PATCH", `staff/team/${id}`, { display_name: value });
    setBusy(false);
    if (!result.ok) return setError(result.fields.display_name?.[0] ?? describeFailure(result));
    setSaved(true);
    setOpen(false);
    router.refresh();
  }

  if (!open)
    return (
      <div className="grid gap-2">
        {saved ? <FormSuccess>Name updated.</FormSuccess> : null}
        <div>
          <Button
            variant="secondary"
            onClick={() => {
              setOpen(true);
              setSaved(false);
            }}
          >
            Edit name
          </Button>
        </div>
      </div>
    );
  return (
    <form onSubmit={submit} noValidate className="grid max-w-[420px] gap-3" aria-label="Edit name">
      {error && !error.startsWith("Enter") ? <FormError>{error}</FormError> : null}
      <Field id="edit-name" label="Full name" error={error ?? undefined}>
        <TextInput
          id="edit-name"
          value={value}
          maxLength={80}
          invalid={Boolean(error)}
          onChange={(ev) => setValue(ev.target.value)}
        />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save name"}
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
