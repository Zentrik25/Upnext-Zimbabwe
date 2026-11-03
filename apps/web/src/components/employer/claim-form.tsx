"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Button, Field, Textarea, TextInput } from "@/components/ui";
import { FormError } from "@/components/account/parts";
import { apiFetch, describeFailure, type FieldErrors } from "@/lib/client-api";

type Match = { id: string; name: string };

export function ClaimForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [chosen, setChosen] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    const term = name.trim();
    if (term.length < 2) return;
    const timer = setTimeout(async () => {
      const outcome = await apiFetch<{ data: Match[] }>(
        "GET",
        `employer/organisations/search?q=${encodeURIComponent(term)}`,
      );
      setMatches(outcome.ok ? outcome.data.data : []);
    }, 300);
    return () => clearTimeout(timer);
  }, [name]);

  const shown = name.trim().length >= 2 ? matches : [];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setErrors({});
    setFailure(null);
    const body: Record<string, unknown> = {
      organisation_name: name.trim(),
      website_url: String(form.get("website_url") ?? "").trim() || null,
      registration_number: String(form.get("registration_number") ?? "").trim() || null,
      role_title: String(form.get("role_title") ?? "").trim(),
      evidence_note: String(form.get("evidence_note") ?? "").trim(),
    };
    if (chosen) body.organisation_id = chosen;
    const outcome = await apiFetch("POST", "employer/claims", body);
    setBusy(false);
    if (outcome.ok) {
      router.push("/employer");
      router.refresh();
    } else if (outcome.code === "validation_failed") setErrors(outcome.fields);
    else setFailure(describeFailure(outcome));
  }

  return (
    <form onSubmit={submit} className="grid gap-4" data-testid="claim-form">
      {failure ? <FormError>{failure}</FormError> : null}
      <Field
        id="organisation_name"
        label="Organisation name"
        hint="The name people know the organisation by."
        error={errors.organisation_name?.[0]}
      >
        <TextInput
          id="organisation_name"
          name="organisation_name"
          required
          maxLength={200}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setChosen("");
          }}
          invalid={Boolean(errors.organisation_name)}
        />
      </Field>
      {shown.length > 0 ? (
        <fieldset className="grid gap-1 rounded-card border border-border-panel p-3">
          <legend className="px-1 text-small font-strong">Is it one of these?</legend>
          {shown.map((match) => (
            <label key={match.id} className="flex items-center gap-2 text-base">
              <input
                type="radio"
                name="existing"
                className="accent-accent"
                checked={chosen === match.id}
                onChange={() => {
                  setChosen(match.id);
                  setName(match.name);
                }}
              />
              {match.name}
            </label>
          ))}
          <label className="flex items-center gap-2 text-base">
            <input
              type="radio"
              name="existing"
              className="accent-accent"
              checked={chosen === ""}
              onChange={() => setChosen("")}
            />
            None of these: it is a different organisation
          </label>
        </fieldset>
      ) : null}
      <Field
        id="website_url"
        label="Organisation website (optional)"
        hint="Starts with https://"
        error={errors.website_url?.[0]}
      >
        <TextInput
          id="website_url"
          name="website_url"
          type="url"
          maxLength={2048}
          invalid={Boolean(errors.website_url)}
        />
      </Field>
      <Field
        id="registration_number"
        label="Registration number (optional)"
        error={errors.registration_number?.[0]}
      >
        <TextInput
          id="registration_number"
          name="registration_number"
          maxLength={60}
          invalid={Boolean(errors.registration_number)}
        />
      </Field>
      <Field id="role_title" label="Your role" hint="For example: HR manager." error={errors.role_title?.[0]}>
        <TextInput
          id="role_title"
          name="role_title"
          required
          maxLength={100}
          invalid={Boolean(errors.role_title)}
        />
      </Field>
      <Field
        id="evidence_note"
        label="How can we confirm you act for this organisation?"
        hint="20 to 2000 characters. For example: the official e-mail address or telephone number we can use to check, or where your role is listed. Do not paste documents or ID numbers."
        error={errors.evidence_note?.[0]}
      >
        <Textarea
          id="evidence_note"
          name="evidence_note"
          required
          rows={5}
          maxLength={2000}
          invalid={Boolean(errors.evidence_note)}
        />
      </Field>
      <p className="text-small text-muted" data-testid="legal-notice">
        By sending this claim you confirm you may act for the organisation and agree to section 6 of the{" "}
        <Link href="/terms#employers" className="text-accent underline">
          Terms of Service
        </Link>
        . See the{" "}
        <Link href="/privacy#information-we-collect" className="text-accent underline">
          Privacy Policy
        </Link>{" "}
        for what we keep about your claim.
      </p>
      <Button type="submit" disabled={busy}>
        {busy ? "Sending…" : "Send claim for review"}
      </Button>
    </form>
  );
}
