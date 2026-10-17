"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Field, Panel, TextInput } from "@/components/ui";
import { apiFetch, describeFailure, type FieldErrors } from "@/lib/client-api";
import { FormError, FormSuccess } from "./parts";

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Harare",
  }).format(new Date(iso));
}

export function ProfilePanel({ displayName, email }: { displayName: string; email: string }) {
  const router = useRouter();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setErrors({});
    setFailure(null);
    setSaved(false);
    const outcome = await apiFetch("PATCH", "me", {
      display_name: String(form.get("display_name") ?? "").trim(),
    });
    setBusy(false);
    if (outcome.ok) {
      setSaved(true);
      router.refresh();
    } else if (outcome.code === "validation_failed") setErrors(outcome.fields);
    else setFailure(describeFailure(outcome));
  }

  return (
    <Panel aria-labelledby="profile-title" role="region">
      <h2 id="profile-title" className="text-title font-strong">
        Your details
      </h2>
      <form onSubmit={submit} className="mt-3 grid gap-3">
        {failure ? <FormError>{failure}</FormError> : null}
        {saved ? <FormSuccess>Name saved.</FormSuccess> : null}
        <p className="text-base">
          <span className="text-small text-muted">E-mail address</span>
          <br />
          {email}
        </p>
        <Field id="display_name" label="Name" error={errors.display_name?.[0]}>
          <TextInput
            id="display_name"
            name="display_name"
            defaultValue={displayName}
            required
            maxLength={80}
            invalid={Boolean(errors.display_name)}
          />
        </Field>
        <div>
          <Button type="submit" disabled={busy}>
            Save name
          </Button>
        </div>
      </form>
    </Panel>
  );
}

export function PasswordPanel() {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setErrors({});
    setFailure(null);
    setDone(false);
    const outcome = await apiFetch("POST", "auth/password/change", {
      current_password: String(form.get("current_password") ?? ""),
      new_password: String(form.get("new_password") ?? ""),
    });
    setBusy(false);
    if (outcome.ok) {
      formElement.reset();
      return setDone(true);
    }
    if (outcome.code === "validation_failed") setErrors(outcome.fields);
    else setFailure(describeFailure(outcome));
  }

  return (
    <Panel role="region" aria-labelledby="password-title">
      <h2 id="password-title" className="text-title font-strong">
        Change password
      </h2>
      <form onSubmit={submit} className="mt-3 grid gap-3">
        {failure ? <FormError>{failure}</FormError> : null}
        {done ? <FormSuccess>Password changed. Your other sessions were signed out.</FormSuccess> : null}
        <Field id="current_password" label="Current password">
          <TextInput
            id="current_password"
            name="current_password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
          />
        </Field>
        <Field
          id="new_password"
          label="New password"
          hint="At least 10 characters."
          error={errors.new_password?.[0]}
        >
          <TextInput
            id="new_password"
            name="new_password"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            maxLength={128}
            invalid={Boolean(errors.new_password)}
          />
        </Field>
        <div>
          <Button type="submit" disabled={busy}>
            Change password
          </Button>
        </div>
      </form>
    </Panel>
  );
}

export type SessionRow = {
  id: string;
  created_at: string;
  last_seen_at: string;
  user_agent_summary: string | null;
  current: boolean;
};

export function SessionsPanel({ sessions }: { sessions: SessionRow[] }) {
  const router = useRouter();
  const [failure, setFailure] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function revoke(id: string) {
    setBusyId(id);
    setFailure(null);
    const outcome = await apiFetch("DELETE", `me/sessions/${id}`);
    setBusyId(null);
    if (outcome.ok) router.refresh();
    else setFailure(describeFailure(outcome));
  }

  return (
    <Panel role="region" aria-labelledby="sessions-title">
      <h2 id="sessions-title" className="text-title font-strong">
        Where you are signed in
      </h2>
      <p className="mt-1 text-small text-muted">
        Sign out any browser you do not recognise. Changing your password signs out all the others.
      </p>
      {failure ? (
        <div className="mt-3">
          <FormError>{failure}</FormError>
        </div>
      ) : null}
      <ul className="m-0 mt-3 grid list-none gap-3 p-0" aria-label="Sessions">
        {sessions.map((session) => (
          <li
            key={session.id}
            className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3"
          >
            <div className="text-base">
              <p className="font-strong">
                {session.user_agent_summary ?? "Unknown browser"}
                {session.current ? " (this browser)" : ""}
              </p>
              <p className="text-small text-muted">
                Signed in {formatWhen(session.created_at)} · last active {formatWhen(session.last_seen_at)}
              </p>
            </div>
            {session.current ? null : (
              <Button
                variant="secondary"
                onClick={() => revoke(session.id)}
                disabled={busyId === session.id}
                aria-label={`Sign out ${session.user_agent_summary ?? "unknown browser"} signed in ${formatWhen(session.created_at)}`}
              >
                Sign out
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function DeletionPanel({ requestedAt }: { requestedAt: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function request(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setFailure(null);
    const outcome = await apiFetch("POST", "me/deletion-request", {
      password: String(form.get("password") ?? ""),
    });
    setBusy(false);
    if (outcome.ok) {
      setOpen(false);
      router.refresh();
    } else setFailure(describeFailure(outcome));
  }

  async function cancel() {
    setBusy(true);
    const outcome = await apiFetch("DELETE", "me/deletion-request");
    setBusy(false);
    if (outcome.ok) router.refresh();
    else setFailure(describeFailure(outcome));
  }

  return (
    <Panel role="region" aria-labelledby="deletion-title">
      <h2 id="deletion-title" className="text-title font-strong">
        Delete your account
      </h2>
      {failure ? (
        <div className="mt-3">
          <FormError>{failure}</FormError>
        </div>
      ) : null}
      {requestedAt ? (
        <div className="mt-3 grid gap-3">
          <FormSuccess>
            Deletion requested on {formatWhen(requestedAt)}. No deletion date has been set yet; your request
            is recorded and the team will follow up by e-mail.
          </FormSuccess>
          <div>
            <Button variant="secondary" onClick={cancel} disabled={busy}>
              Cancel the request
            </Button>
          </div>
        </div>
      ) : open ? (
        <form onSubmit={request} className="mt-3 grid gap-3">
          <p className="text-base">
            This asks us to delete your account and saved listings. Enter your password to confirm.
          </p>
          <Field id="delete_password" label="Password">
            <TextInput
              id="delete_password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              Request deletion
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Keep my account
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-3 grid gap-3">
          <p className="text-base text-muted">
            You can ask us to delete your account and everything saved with it.
          </p>
          <div>
            <Button variant="secondary" onClick={() => setOpen(true)}>
              Delete my account…
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
