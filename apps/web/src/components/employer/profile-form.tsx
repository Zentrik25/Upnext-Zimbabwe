"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Field, Select, Textarea, TextInput } from "@/components/ui";
import { FormError, FormSuccess } from "@/components/account/parts";
import { apiFetch, describeFailure, type FieldErrors } from "@/lib/client-api";
import type { ProfileRevision, ProfileState } from "@/lib/employer-types";

export function ProfileForm({ organisationId, state }: { organisationId: string; state: ProfileState }) {
  const router = useRouter();
  const start: ProfileRevision | null = state.pending ?? state.last_rejected ?? state.live;
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setErrors({});
    setFailure(null);
    setSent(false);
    const year = String(form.get("founded_year") ?? "").trim();
    const outcome = await apiFetch("POST", `employer/organisations/${organisationId}/profile`, {
      tagline: String(form.get("tagline") ?? "").trim(),
      about: String(form.get("about") ?? "").trim(),
      sector_id: String(form.get("sector_id") ?? "") || null,
      size_band: String(form.get("size_band") ?? "") || null,
      founded_year: year ? Number(year) : null,
      location_text: String(form.get("location_text") ?? "").trim() || null,
    });
    setBusy(false);
    if (outcome.ok) {
      setSent(true);
      router.refresh();
    } else if (outcome.code === "validation_failed") setErrors(outcome.fields);
    else setFailure(describeFailure(outcome));
  }

  async function withdraw() {
    if (!state.pending) return;
    setBusy(true);
    const outcome = await apiFetch(
      "DELETE",
      `employer/organisations/${organisationId}/profile/revisions/${state.pending.id}`,
    );
    setBusy(false);
    if (outcome.ok) router.refresh();
    else setFailure(describeFailure(outcome));
  }

  if (!state.can_edit) {
    return (
      <p className="text-base" data-testid="profile-readonly">
        Only an owner of this organisation can change the company profile.
      </p>
    );
  }
  if (!state.verified) {
    return <p className="text-base">The organisation is not verified, so its profile cannot be changed.</p>;
  }

  return (
    <form onSubmit={submit} className="grid gap-4" data-testid="profile-form" key={start?.id ?? "new"}>
      {failure ? <FormError>{failure}</FormError> : null}
      {sent ? (
        <FormSuccess>
          Sent for review. The public profile stays as it is until an editor approves the change.
        </FormSuccess>
      ) : null}
      {state.pending ? (
        <div
          role="status"
          className="rounded-card border border-border-notice bg-surface-notice p-3 text-base"
        >
          A change is waiting for review. Sending a new one replaces it.{" "}
          <button type="button" onClick={withdraw} disabled={busy} className="text-accent underline">
            Withdraw the waiting change
          </button>
        </div>
      ) : null}
      <Field id="tagline" label="Tagline (optional)" hint="Up to 120 characters." error={errors.tagline?.[0]}>
        <TextInput
          id="tagline"
          name="tagline"
          maxLength={120}
          defaultValue={start?.tagline ?? ""}
          invalid={Boolean(errors.tagline)}
        />
      </Field>
      <Field
        id="about"
        label="About the organisation"
        hint="50 to 2000 characters of plain text: what you do and who you are. No links, no claims about guaranteed jobs, no fees."
        error={errors.about?.[0]}
      >
        <Textarea
          id="about"
          name="about"
          required
          rows={8}
          maxLength={2000}
          defaultValue={start?.about ?? ""}
          invalid={Boolean(errors.about)}
        />
      </Field>
      <Field id="sector_id" label="Sector (optional)" error={errors.sector_id?.[0]}>
        <Select id="sector_id" name="sector_id" defaultValue={start?.sector?.id ?? ""}>
          <option value="">Not stated</option>
          {state.sectors.map((sector) => (
            <option key={sector.id} value={sector.id}>
              {sector.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="size_band" label="Number of employees (optional)" error={errors.size_band?.[0]}>
        <Select id="size_band" name="size_band" defaultValue={start?.size_band ?? ""}>
          <option value="">Not stated</option>
          {state.size_bands.map((band) => (
            <option key={band} value={band}>
              {band}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="founded_year" label="Year founded (optional)" error={errors.founded_year?.[0]}>
        <TextInput
          id="founded_year"
          name="founded_year"
          inputMode="numeric"
          pattern="[0-9]{4}"
          maxLength={4}
          defaultValue={start?.founded_year ?? ""}
          invalid={Boolean(errors.founded_year)}
        />
      </Field>
      <Field id="location_text" label="Where you are based (optional)" error={errors.location_text?.[0]}>
        <TextInput
          id="location_text"
          name="location_text"
          maxLength={120}
          defaultValue={start?.location_text ?? ""}
          invalid={Boolean(errors.location_text)}
        />
      </Field>
      <Button type="submit" disabled={busy}>
        {busy ? "Sending…" : "Send for review"}
      </Button>
    </form>
  );
}
