"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FormError, FormSuccess } from "@/components/account/parts";
import { Button, Callout, Checkbox } from "@/components/ui";
import { apiFetch, describeFailure, type FieldErrors } from "@/lib/client-api";
import type { Category, Location } from "@/lib/catalog-types";
import type { JobAlert } from "@/lib/seeker-types";
import { CheckboxGroup } from "./checkbox-group";

export function AlertForm({
  alert,
  categories,
  locations,
}: {
  alert: JobAlert;
  categories: Category[];
  locations: Location[];
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(alert.enabled);
  const [frequency, setFrequency] = useState(alert.frequency);
  const [categoryCodes, setCategoryCodes] = useState(alert.categories.map((c) => c.code));
  const [placeIds, setPlaceIds] = useState(alert.locations.map((l) => l.id));
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});

  async function send(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setMessage(null);
    setFailure(null);
    setErrors({});
    const outcome = await apiFetch<JobAlert>("PUT", "me/alerts", body);
    setBusy(false);
    if (outcome.ok) {
      setEnabled(outcome.data.enabled);
      setConsent(false);
      setMessage(done);
      router.refresh();
    } else if (outcome.code === "validation_failed") {
      setErrors(outcome.fields);
      setFailure("Check the highlighted fields.");
    } else if (outcome.status === 403) {
      setFailure("Confirm your e-mail address first. We sent you a link when you registered.");
    } else setFailure(describeFailure(outcome));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const choices = { frequency, categories: categoryCodes, locations: placeIds };
    if (enabled) void send(choices, "Alert settings saved.");
    else
      void send(
        { ...choices, enabled: true, consent },
        "Job alerts are on. You will hear only about opportunities published from now on.",
      );
  }

  const placeOptions = locations.map((l) => ({ value: l.id, label: l.name }));

  return (
    <form onSubmit={submit} className="grid max-w-[760px] gap-6">
      {!alert.delivery_available ? (
        <Callout data-testid="alerts-unavailable">
          <p className="text-base font-strong">E-mail alerts are not being sent yet</p>
          <p className="mt-1 text-small text-muted">
            You can choose what you want now. We will not send anything until e-mail delivery has been
            checked, and we will not send older listings when it starts: only ones published after you turned
            alerts on.
          </p>
        </Callout>
      ) : null}
      {failure ? <FormError>{failure}</FormError> : null}
      {message ? <FormSuccess>{message}</FormSuccess> : null}

      <p className="text-base" data-testid="alert-state">
        Job alerts are <span className="font-strong">{enabled ? "on" : "off"}</span>.
      </p>

      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="p-0 text-small font-strong">How often</legend>
        <div className="mt-2 flex flex-wrap gap-x-6">
          {(["daily", "weekly"] as const).map((value) => (
            <label key={value} className="flex min-h-[44px] items-center gap-2 text-ctl text-check-text">
              <input
                type="radio"
                name="frequency"
                value={value}
                checked={frequency === value}
                onChange={() => setFrequency(value)}
                className="accent-accent"
              />
              {value === "daily" ? "Daily" : "Weekly"}
            </label>
          ))}
        </div>
        <p className="text-small text-muted">We send nothing when there is nothing new.</p>
      </fieldset>

      <CheckboxGroup
        name="alert_categories"
        legend="Categories"
        options={categories.map((c) => ({ value: c.code, label: c.name }))}
        selected={categoryCodes}
        onChange={setCategoryCodes}
        max={6}
      />
      {errors.categories ? (
        <p role="alert" className="-mt-4 text-small text-urgent">
          <span className="font-strong">Error:</span> {errors.categories[0]}
        </p>
      ) : null}
      <CheckboxGroup
        name="alert_locations"
        legend="Places"
        hint="Leave empty for anywhere in Zimbabwe."
        options={placeOptions}
        selected={placeIds}
        onChange={setPlaceIds}
        max={10}
      />

      {!enabled ? (
        <div className="grid gap-1">
          <Checkbox
            id="alert-consent"
            label={alert.consent_wording}
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            className="min-h-[44px] items-start"
            aria-describedby={errors.consent ? "alert-consent-error" : undefined}
          />
          {errors.consent ? (
            <p id="alert-consent-error" role="alert" className="text-small text-urgent">
              <span className="font-strong">Error:</span> {errors.consent[0]}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>
          {enabled ? "Save alert settings" : "Turn on job alerts"}
        </Button>
        {enabled ? (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void send({ enabled: false }, "Job alerts are off. No more e-mails will be sent.")}
          >
            Turn off job alerts
          </Button>
        ) : null}
      </div>
      <p className="max-w-[640px] text-small text-muted">
        Every alert e-mail has a link to stop them without signing in. We list only opportunities, check each
        listing&apos;s source, and you apply on the official site.
      </p>
    </form>
  );
}
