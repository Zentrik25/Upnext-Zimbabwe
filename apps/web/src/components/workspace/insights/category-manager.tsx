"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Checkbox, Textarea, TextInput } from "@/components/ui";
import { Row } from "@/components/workspace/job-editor-parts";
import { apiFetch, describeFailure } from "@/lib/client-api";

export type StaffCategory = {
  id: string;
  name: string;
  slug: string;
  description: string;
  seo_title: string;
  seo_description: string;
  display_order: number;
  active: boolean;
};

const BLANK: Omit<StaffCategory, "id"> = {
  name: "",
  slug: "",
  description: "",
  seo_title: "",
  seo_description: "",
  display_order: 100,
  active: true,
};

/**
 * Article categories (D-78), managed in the database by Administrators (`insights.manage`). A category is switched
 * off rather than deleted, so a published article never loses its category address.
 */
export function CategoryManager({ categories }: { categories: StaffCategory[] }) {
  return (
    <div className="grid gap-6">
      {categories.map((c) => (
        <CategoryForm key={c.id} initial={c} />
      ))}
      <section aria-labelledby="new-category" className="rounded-card border border-line p-4">
        <h2 id="new-category" className="m-0 mb-3 text-ctl font-strong">
          Add a category
        </h2>
        <CategoryForm initial={null} />
      </section>
    </div>
  );
}

function CategoryForm({ initial }: { initial: StaffCategory | null }) {
  const router = useRouter();
  const [value, setValue] = useState(initial ?? { ...BLANK, id: "" });
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const key = initial?.id ?? "new";
  const set = <K extends keyof StaffCategory>(k: K, v: StaffCategory[K]) =>
    setValue((s) => ({ ...s, [k]: v }));
  const err = (k: string) => fields[k]?.join(" ");

  return (
    <form
      aria-label={initial ? `Category ${initial.name}` : "New category"}
      className={
        initial
          ? "grid gap-3 rounded-card border border-line p-4 sm:grid-cols-2"
          : "grid gap-3 sm:grid-cols-2"
      }
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage(null);
        const body = {
          name: value.name,
          slug: value.slug,
          description: value.description,
          seo_title: value.seo_title,
          seo_description: value.seo_description,
          display_order: value.display_order,
          active: value.active,
        };
        const result = initial
          ? await apiFetch<StaffCategory>("PATCH", `staff/insights/categories/${initial.id}`, body)
          : await apiFetch<StaffCategory>("POST", "staff/insights/categories", body);
        setBusy(false);
        if (!result.ok) {
          setFields(result.fields);
          return setMessage(describeFailure(result));
        }
        setFields({});
        setMessage("Saved.");
        if (!initial) setValue({ ...BLANK, id: "" });
        router.refresh();
      }}
    >
      <Row id={`${key}-name`} title="Name" error={err("name")}>
        <TextInput
          id={`${key}-name`}
          required
          maxLength={80}
          value={value.name}
          invalid={!!err("name")}
          onChange={(e) => set("name", e.target.value)}
        />
      </Row>
      <Row
        id={`${key}-slug`}
        title="Address"
        hint={initial ? "Changing it changes the category page address." : "Made from the name when empty."}
        error={err("slug")}
        optional={!initial}
      >
        <TextInput
          id={`${key}-slug`}
          maxLength={80}
          value={value.slug}
          invalid={!!err("slug")}
          onChange={(e) => set("slug", e.target.value)}
        />
      </Row>
      <Row
        id={`${key}-description`}
        title="Description"
        optional
        error={err("description")}
        className="sm:col-span-2"
      >
        <Textarea
          id={`${key}-description`}
          maxLength={600}
          rows={2}
          value={value.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </Row>
      <Row
        id={`${key}-seo-title`}
        title={`Search title (${value.seo_title.length}/70)`}
        optional
        error={err("seo_title")}
      >
        <TextInput
          id={`${key}-seo-title`}
          maxLength={70}
          value={value.seo_title}
          onChange={(e) => set("seo_title", e.target.value)}
        />
      </Row>
      <Row
        id={`${key}-seo-description`}
        title={`Search description (${value.seo_description.length}/170)`}
        optional
        error={err("seo_description")}
      >
        <TextInput
          id={`${key}-seo-description`}
          maxLength={170}
          value={value.seo_description}
          onChange={(e) => set("seo_description", e.target.value)}
        />
      </Row>
      <Row
        id={`${key}-order`}
        title="Display order"
        hint="Lower numbers come first."
        error={err("display_order")}
      >
        <TextInput
          id={`${key}-order`}
          type="number"
          min={0}
          max={1000}
          value={String(value.display_order)}
          onChange={(e) => set("display_order", Number(e.target.value) || 0)}
        />
      </Row>
      <div className="flex items-end">
        <Checkbox
          id={`${key}-active`}
          label="Offered to writers and shown publicly"
          checked={value.active}
          onChange={(e) => set("active", e.target.checked)}
        />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={busy} aria-busy={busy}>
          {busy ? "Saving…" : initial ? "Save category" : "Add category"}
        </Button>
        {message ? (
          <p role="status" className="m-0 text-small text-muted">
            {message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
