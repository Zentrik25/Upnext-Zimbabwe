"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Field, Panel, TextInput } from "@/components/ui";
import { apiFetch, describeFailure, type FieldErrors } from "@/lib/client-api";
import { AuthField } from "./auth-parts";
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
        <p className="text-base break-all">
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

export function EmailChangePanel({ currentEmail }: { currentEmail: string }) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setErrors({});
    setFailure(null);
    const outcome = await apiFetch("POST", "me/email-change", {
      new_email: String(form.get("new_email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    });
    setBusy(false);
    if (outcome.ok) setAsked(true);
    else if (outcome.code === "validation_failed") setErrors(outcome.fields);
    else if (outcome.code === "reauth_required") setFailure("That password is not correct.");
    else if (outcome.code === "email_unavailable")
      setFailure("Changing your e-mail address is not available right now.");
    else setFailure(describeFailure(outcome));
  }

  return (
    <Panel aria-labelledby="email-change-title" role="region">
      <h2 id="email-change-title" className="text-title font-strong">
        Change your e-mail address
      </h2>
      {asked ? (
        <div className="mt-3">
          <FormSuccess>
            <p className="font-strong">Check your new inbox</p>
            <p className="mt-1 break-all">
              If that address can be used, we have sent it a link. Your account keeps {currentEmail} until you
              open the link. We also told your current address about this request.
            </p>
          </FormSuccess>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-3 grid gap-3">
          {failure ? <FormError>{failure}</FormError> : null}
          <Field id="new_email" label="New e-mail address" error={errors.new_email?.[0]}>
            <TextInput
              id="new_email"
              name="new_email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              invalid={Boolean(errors.new_email)}
            />
          </Field>
          <Field id="email_change_password" label="Your password" error={errors.password?.[0]}>
            <TextInput
              id="email_change_password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
              invalid={Boolean(errors.password)}
            />
          </Field>
          <div>
            <Button type="submit" disabled={busy}>
              Send confirmation link
            </Button>
          </div>
        </form>
      )}
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
    const next = String(form.get("new_password") ?? "");
    setErrors({});
    setFailure(null);
    setDone(false);
    if (next !== String(form.get("confirm_password") ?? "")) {
      return setErrors({ confirm_password: ["The two new passwords are not the same."] });
    }
    setBusy(true);
    const outcome = await apiFetch("POST", "auth/password/change", {
      current_password: String(form.get("current_password") ?? ""),
      new_password: next,
    });
    setBusy(false);
    if (outcome.ok) {
      formElement.reset();
      return setDone(true);
    }
    if (outcome.code === "validation_failed") setErrors(outcome.fields);
    else if (outcome.code === "reauth_required")
      setErrors({ current_password: ["That password is not correct."] });
    else setFailure(describeFailure(outcome));
  }

  return (
    <Panel role="region" aria-labelledby="password-title">
      <h2 id="password-title" className="text-title font-strong">
        Change password
      </h2>
      <form onSubmit={submit} className="mt-3 grid gap-3" noValidate>
        {failure ? <FormError>{failure}</FormError> : null}
        {done ? <FormSuccess>Password changed. Your other sessions were signed out.</FormSuccess> : null}
        <AuthField
          id="current_password"
          name="current_password"
          label="Current password"
          type="password"
          reveal
          autoComplete="current-password"
          required
          maxLength={128}
          error={errors.current_password?.[0]}
        />
        <AuthField
          id="new_password"
          name="new_password"
          label="New password"
          type="password"
          reveal
          hint="At least 10 characters."
          autoComplete="new-password"
          required
          minLength={10}
          maxLength={128}
          error={errors.new_password?.[0]}
        />
        <AuthField
          id="confirm_password"
          name="confirm_password"
          label="Confirm new password"
          type="password"
          reveal
          autoComplete="new-password"
          required
          maxLength={128}
          error={errors.confirm_password?.[0]}
        />
        <div>
          <Button type="submit" disabled={busy}>
            {busy ? "Changing…" : "Change password"}
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
  // A signed-out session leaves the list at once; the refresh below then re-syncs it with the server.
  const [gone, setGone] = useState<string[]>([]);
  const visible = sessions.filter((session) => !gone.includes(session.id));

  async function revoke(id: string) {
    setBusyId(id);
    setFailure(null);
    const outcome = await apiFetch("DELETE", `me/sessions/${id}`);
    setBusyId(null);
    if (outcome.ok) {
      setGone((ids) => [...ids, id]);
      router.refresh();
    } else setFailure(describeFailure(outcome));
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
        {visible.map((session) => (
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

export function DeletionPanel({
  requestedAt,
  scheduledFor,
  staff,
}: {
  requestedAt: string | null;
  scheduledFor: string | null;
  staff: boolean;
}) {
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
    <Panel role="region" aria-labelledby="deletion-title" className="border-danger/40">
      <h2 id="deletion-title" className="text-title font-strong text-danger">
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
            <p className="font-strong">Deletion requested on {formatWhen(requestedAt)}</p>
            <p className="mt-1">
              Nothing has been deleted yet.{" "}
              {scheduledFor
                ? `Your account will be deleted on or after ${formatWhen(scheduledFor)}.`
                : "A deletion date will be confirmed by e-mail."}{" "}
              Until then you can cancel and keep everything as it is.
            </p>
          </FormSuccess>
          <div>
            <Button variant="secondary" onClick={cancel} disabled={busy}>
              Cancel the request
            </Button>
          </div>
        </div>
      ) : staff ? (
        <p className="mt-3 text-base text-muted">
          This account also has staff access. An administrator must remove that access before the account can
          be deleted.
        </p>
      ) : open ? (
        <form onSubmit={request} className="mt-3 grid gap-3">
          <p className="text-base">
            You are asking us to delete your account, your saved listings and your sign-in records. We wait 14
            days before doing it, and you can cancel in that time. Enter your password to confirm.
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
            <Button type="submit" variant="danger" disabled={busy}>
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
            You can ask us to delete your account and everything saved with it. There is a 14-day wait first,
            so you can change your mind.
          </p>
          <div>
            <Button variant="danger" onClick={() => setOpen(true)}>
              Delete my account…
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
