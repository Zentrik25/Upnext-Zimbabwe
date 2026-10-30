"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FormError } from "@/components/account/parts";
import { Button, Field, Select, TextInput } from "@/components/ui";
import { apiFetch, describeFailure, type FieldErrors } from "@/lib/client-api";
import type { ListingDetail, StaffCategory } from "@/lib/staff-types";

/** Start a draft: category (fixed afterwards), issuing organisation, working title. Then the editor opens. */
export function NewDraftForm({ categories }: { categories: StaffCategory[] }) {
  const router = useRouter();
  const [category, setCategory] = useState("");
  const [term, setTerm] = useState("");
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  const [org, setOrg] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const r = await fetch(`/api/v1/staff/organisations?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
          credentials: "same-origin",
        });
        if (r.ok) setOrgs(((await r.json()) as { data: { id: string; name: string }[] }).data);
      } catch {
        /* keep the list shown */
      }
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setFailure(null);
    const result = await apiFetch<ListingDetail>("POST", "staff/opportunities", {
      category,
      organisation_id: org,
      title,
    });
    setBusy(false);
    if (!result.ok) {
      if (result.code === "validation_failed") setErrors(result.fields);
      setFailure(describeFailure(result));
      return;
    }
    router.push(`/workspace/opportunities/${result.data.id}/edit`);
  }

  return (
    <form onSubmit={submit} className="grid max-w-[560px] gap-4" noValidate>
      {failure ? <FormError>{failure}</FormError> : null}
      <Field id="category" label="Category" hint="It cannot be changed later." error={errors.category?.[0]}>
        <Select
          id="category"
          required
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          invalid={!!errors.category}
        >
          <option value="">Choose a category…</option>
          {categories.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        id="org-search"
        label="Find the issuing organisation"
        hint="Type part of the name. The organisation must already exist; editors add new ones."
      >
        <TextInput
          id="org-search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          autoComplete="off"
        />
      </Field>
      <Field id="organisation" label="Organisation" error={errors.organisation_id?.[0]}>
        <Select
          id="organisation"
          required
          value={org}
          onChange={(e) => setOrg(e.target.value)}
          invalid={!!errors.organisation_id}
        >
          <option value="">{orgs.length ? "Choose an organisation…" : "No organisation matches"}</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="title" label="Working title" error={errors.title?.[0]}>
        <TextInput
          id="title"
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          invalid={!!errors.title}
        />
      </Field>
      <div>
        <Button type="submit" disabled={busy || !category || !org || !title.trim()}>
          {busy ? "Creating…" : "Create draft"}
        </Button>
      </div>
    </form>
  );
}
