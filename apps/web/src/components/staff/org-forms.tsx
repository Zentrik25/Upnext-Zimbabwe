"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Field, TextInput } from "@/components/ui";
import { apiFetch } from "@/lib/client-api";
import type { OrganisationRow } from "@/lib/staff-types";
import { Notice } from "./primitives";

export function OrganisationForm({
  organisation,
  canEdit,
}: {
  organisation?: OrganisationRow;
  canEdit?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const editing = Boolean(organisation);
  const locked = editing && !canEdit;

  async function submit(event: FormEvent<HTMLFormElement>, allowDuplicate = false) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = {
      name: String(form.get("name") ?? ""),
      website_url: String(form.get("website_url") ?? "") || null,
      ...(editing ? { row_version: organisation!.row_version } : { allow_duplicate: allowDuplicate }),
    };
    setBusy(true);
    setMessage(null);
    setFields({});
    const result = editing
      ? await apiFetch<OrganisationRow>("PATCH", `staff/organisations/${organisation!.id}`, body)
      : await apiFetch<OrganisationRow>("POST", "staff/organisations", body);
    setBusy(false);
    if (!result.ok) {
      setFields(result.fields);
      setMessage({ tone: "error", text: result.message });
      return;
    }
    setMessage({
      tone: "success",
      text: editing ? "Organisation updated." : "Organisation added. It is not verified.",
    });
    if (!editing) (event.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <Field
          id={`org-name-${organisation?.id ?? "new"}`}
          label="Name"
          error={fields.name?.[0] && fields.name[0].length > 40 ? undefined : fields.name?.[0]}
        >
          <TextInput
            id={`org-name-${organisation?.id ?? "new"}`}
            name="name"
            defaultValue={organisation?.name}
            maxLength={200}
            disabled={locked}
            required
          />
        </Field>
        <Field
          id={`org-site-${organisation?.id ?? "new"}`}
          label="Website (optional)"
          hint="https address of the organisation's own site."
          error={fields.website_url?.[0]}
        >
          <TextInput
            id={`org-site-${organisation?.id ?? "new"}`}
            name="website_url"
            type="url"
            placeholder="https://"
            defaultValue={organisation?.website_url ?? ""}
            disabled={locked}
          />
        </Field>
      </div>
      {!locked ? (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : editing ? "Save changes" : "Add organisation"}
          </Button>
        </div>
      ) : (
        <p className="text-small text-muted">Editors and Administrators edit organisation details.</p>
      )}
    </form>
  );
}
