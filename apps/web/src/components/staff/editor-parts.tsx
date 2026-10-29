"use client";

import { useEffect, useState } from "react";
import { Button, Checkbox, Field, Select, Textarea, TextInput } from "@/components/ui";
import { cn } from "@/lib/cn";
import { apiFetch } from "@/lib/client-api";
import type { CategorySchema, Choice, OrganisationRow, SchemaProperty } from "@/lib/staff-types";
import { words } from "@/lib/staff-format";

export function Section({
  id,
  title,
  hint,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-h`}
      className="scroll-mt-24 rounded-card border border-border-panel bg-(--staff-card) p-5 shadow-subtle max-sm:p-4"
    >
      <h2 id={`${id}-h`} className="text-lead tracking-title text-ink">
        {title}
      </h2>
      {hint ? <p className="mt-1 mb-4 text-ctl text-muted">{hint}</p> : <div className="mb-4" />}
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

export function Row({ children, cols = 2 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
  const map = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" } as const;
  return <div className={cn("grid gap-4 max-md:grid-cols-1", map[cols])}>{children}</div>;
}

export function ChoiceSelect({
  id,
  label,
  value,
  onChange,
  choices,
  blank = "Not stated",
  error,
  hint,
}: {
  id: string;
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  choices: Choice[];
  blank?: string | null;
  error?: string;
  hint?: string;
}) {
  return (
    <Field id={id} label={label} error={error} hint={hint}>
      <Select
        id={id}
        value={value ?? ""}
        invalid={Boolean(error)}
        onChange={(e) => onChange(e.target.value || null)}
      >
        {blank !== null ? <option value="">{blank}</option> : null}
        {choices.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/** Organisation picker: search existing organisations, or enter one by hand (never marked verified). */
export function OrganisationPicker({
  value,
  onChange,
  canCreate,
  error,
}: {
  value: { id: string; name: string; verified: boolean } | null;
  onChange: (org: { id: string; name: string; verified: boolean } | null) => void;
  canCreate: boolean;
  error?: string;
}) {
  const [mode, setMode] = useState<"select" | "manual">("select");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OrganisationRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [manual, setManual] = useState({ name: "", website_url: "" });
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);

  useEffect(() => {
    if (mode !== "select") return;
    const handle = setTimeout(async () => {
      setSearching(true);
      const result = await apiFetch<{ data: OrganisationRow[] }>(
        "GET",
        `staff/organisations?q=${encodeURIComponent(query)}&page_size=8`,
      );
      if (result.ok) setResults(result.data.data);
      setSearching(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [query, mode]);

  async function create(allowDuplicate = false) {
    setCreating(true);
    setMessage(null);
    const result = await apiFetch<OrganisationRow>("POST", "staff/organisations", {
      name: manual.name,
      website_url: manual.website_url || null,
      allow_duplicate: allowDuplicate,
    });
    setCreating(false);
    if (!result.ok) {
      setMessage({
        tone: "error",
        text:
          result.code === "duplicate_organisation"
            ? `${result.message} Search for it above, or create a separate organisation anyway.`
            : (Object.values(result.fields)[0]?.[0] ?? result.message),
      });
      return;
    }
    onChange({ id: result.data.id, name: result.data.name, verified: false });
    setMessage({
      tone: "ok",
      text: "Organisation added. It is not verified: only an approved employer claim verifies one.",
    });
    setMode("select");
  }

  return (
    <div className="grid gap-3">
      <div role="group" aria-label="How to choose the organisation" className="flex flex-wrap gap-2">
        {(["select", "manual"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            disabled={m === "manual" && !canCreate}
            onClick={() => setMode(m)}
            className={cn(
              "inline-flex min-h-control items-center rounded-control border px-3 text-ctl",
              mode === m
                ? "border-border-strong bg-match-bg text-secondary-text"
                : "border-line text-muted hover:text-ink",
            )}
          >
            {m === "select" ? "Select an organisation" : "Enter one manually"}
          </button>
        ))}
      </div>

      {value ? (
        <p className="rounded-card border border-border-interest bg-match-bg px-3 py-2 text-ctl">
          <span className="text-muted">Selected: </span>
          <strong className="font-medium">{value.name}</strong>
          <span className="text-muted">
            {" "}
            · {value.verified ? "Verified employer" : "Entered by staff, not verified"}
          </span>
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-small text-danger">
          <span className="font-strong">Error:</span> {error}
        </p>
      ) : null}

      {mode === "select" ? (
        <div className="grid gap-2">
          <Field id="org-q" label="Search organisations" hint="Type part of the name.">
            <TextInput
              id="org-q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
          </Field>
          <ul
            aria-label="Matching organisations"
            aria-busy={searching}
            className="grid max-h-[220px] gap-1 overflow-y-auto"
          >
            {results.map((org) => (
              <li key={org.id}>
                <button
                  type="button"
                  onClick={() => onChange({ id: org.id, name: org.name, verified: org.verified })}
                  aria-pressed={value?.id === org.id}
                  className={cn(
                    "flex min-h-[40px] w-full items-center justify-between gap-3 rounded-control border px-3 text-left text-ctl",
                    value?.id === org.id
                      ? "border-border-strong bg-match-bg"
                      : "border-line hover:bg-row-hover",
                  )}
                >
                  <span className="min-w-0 truncate">{org.name}</span>
                  <span className="shrink-0 text-small text-muted">
                    {org.verified ? "Verified employer" : "Entered by staff"}
                  </span>
                </button>
              </li>
            ))}
            {results.length === 0 && !searching ? (
              <li className="px-1 py-2 text-ctl text-muted">
                No organisation matches. Enter it manually instead.
              </li>
            ) : null}
          </ul>
        </div>
      ) : (
        <div className="grid gap-3 rounded-card border border-line p-3">
          <Row>
            <Field id="org-name" label="Organisation name">
              <TextInput
                id="org-name"
                value={manual.name}
                onChange={(e) => setManual({ ...manual, name: e.target.value })}
                maxLength={200}
              />
            </Field>
            <Field id="org-site" label="Website (optional)" hint="https address of the issuer's own site.">
              <TextInput
                id="org-site"
                type="url"
                value={manual.website_url}
                onChange={(e) => setManual({ ...manual, website_url: e.target.value })}
                placeholder="https://"
              />
            </Field>
          </Row>
          <p className="text-small text-muted">
            A manually entered organisation is labelled “Entered by staff” everywhere. Only an approved
            employer claim makes an organisation a verified employer.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => create(false)} disabled={creating || manual.name.trim().length < 2}>
              {creating ? "Adding…" : "Add organisation"}
            </Button>
            {message?.text.includes("separate organisation anyway") ? (
              <Button variant="secondary" onClick={() => create(true)} disabled={creating}>
                Create it anyway
              </Button>
            ) : null}
          </div>
        </div>
      )}
      {message ? (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={cn("text-small", message.tone === "error" ? "text-danger" : "text-good")}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

// --- category details, drawn from the category's JSON Schema ----------------------------------------------------
function typeOf(property: SchemaProperty): string {
  const raw = property.type;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.find((t) => t !== "null") ?? "string";
}

/** One schema property as a form control. Unknown shapes fall back to a JSON box rather than being dropped. */
function DetailField({
  name,
  property,
  required,
  value,
  onChange,
  error,
}: {
  name: string;
  property: SchemaProperty;
  required: boolean;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
}) {
  const id = `detail-${name}`;
  const label = `${words(name)}${required ? " (required)" : ""}`;
  const kind = typeOf(property);
  const choices = (property.enum ?? []).filter((v): v is string => typeof v === "string");
  const blank = (v: string) => (v === "" ? undefined : v);

  if (choices.length && kind !== "array") {
    return (
      <Field id={id} label={label} error={error}>
        <Select
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(blank(e.target.value))}
        >
          <option value="">Not stated</option>
          {choices.map((c) => (
            <option key={c} value={c}>
              {words(c)}
            </option>
          ))}
        </Select>
      </Field>
    );
  }
  if (kind === "boolean") {
    return (
      <Field id={id} label={label} error={error}>
        <Select
          id={id}
          value={value === true ? "yes" : value === false ? "no" : ""}
          onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value === "yes")}
        >
          <option value="">Not stated</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </Select>
      </Field>
    );
  }
  if (kind === "integer" || kind === "number") {
    return (
      <Field id={id} label={label} error={error}>
        <TextInput
          id={id}
          type="number"
          inputMode="decimal"
          min={property.minimum}
          max={property.maximum}
          value={typeof value === "number" ? String(value) : ""}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        />
      </Field>
    );
  }
  if (kind === "array") {
    const itemChoices = property.items?.enum ?? [];
    const current = Array.isArray(value) ? (value as string[]) : [];
    if (itemChoices.length) {
      return (
        <fieldset className="grid gap-1.5">
          <legend className="mb-1 text-ctl font-medium text-check-text">{label}</legend>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 max-sm:grid-cols-1">
            {itemChoices.map((choice) => (
              <Checkbox
                key={choice}
                id={`${id}-${choice}`}
                label={words(choice)}
                checked={current.includes(choice)}
                onChange={(e) => {
                  const next = e.target.checked ? [...current, choice] : current.filter((c) => c !== choice);
                  onChange(next.length ? next : undefined);
                }}
              />
            ))}
          </div>
          {error ? (
            <p role="alert" className="text-small text-danger">
              <span className="font-strong">Error:</span> {error}
            </p>
          ) : null}
        </fieldset>
      );
    }
    return (
      <Field
        id={id}
        label={label}
        hint={`One per line${property.maxItems ? `, up to ${property.maxItems}` : ""}.`}
        error={error}
      >
        <Textarea
          id={id}
          rows={3}
          value={current.join("\n")}
          onChange={(e) => {
            const lines = e.target.value
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean);
            onChange(lines.length ? lines : undefined);
          }}
        />
      </Field>
    );
  }
  if (kind === "object") {
    return (
      <Field id={id} label={label} hint="JSON object." error={error}>
        <Textarea
          id={id}
          rows={3}
          defaultValue={value ? JSON.stringify(value, null, 2) : ""}
          onBlur={(e) => {
            const text = e.target.value.trim();
            if (!text) return onChange(undefined);
            try {
              onChange(JSON.parse(text));
            } catch {
              /* left as typed; the server reports invalid values on save */
            }
          }}
        />
      </Field>
    );
  }
  return (
    <Field id={id} label={label} error={error}>
      <TextInput
        id={id}
        maxLength={property.maxLength}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(blank(e.target.value))}
      />
    </Field>
  );
}

export function CategoryDetails({
  schema,
  value,
  onChange,
  errors,
}: {
  schema: CategorySchema;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  errors: Record<string, string[]>;
}) {
  const entries = Object.entries(schema.properties);
  if (entries.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
      {entries.map(([name, property]) => (
        <div
          key={name}
          className={
            typeOf(property) === "array" || typeOf(property) === "object"
              ? "col-span-2 max-md:col-span-1"
              : ""
          }
        >
          <DetailField
            name={name}
            property={property}
            required={schema.required.includes(name)}
            value={value[name]}
            error={errors[`detail.${name}`]?.[0]}
            onChange={(next) => {
              const copy = { ...value };
              if (next === undefined) delete copy[name];
              else copy[name] = next;
              onChange(copy);
            }}
          />
        </div>
      ))}
    </div>
  );
}
