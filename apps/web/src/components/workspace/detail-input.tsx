"use client";

import { Checkbox, Select, Textarea, TextInput } from "@/components/ui";
import { humanise } from "@/lib/format";
import type { DetailField } from "@/lib/staff-types";
import { Row } from "./job-editor-parts";

/** One category-specific input, edited as text and converted when the draft is saved (`detailFromText`). */
export function DetailInput({
  field,
  value,
  onChange,
  error,
}: {
  field: DetailField;
  value: string | string[] | undefined;
  onChange: (value: string | string[]) => void;
  error?: string;
}) {
  const id = `detail_${field.name}`;
  const title = `${humanise(field.name)}${field.required ? " (required)" : ""}`;
  const text = typeof value === "string" ? value : "";
  if (field.type === "array" && field.item_enum) {
    const chosen = new Set(Array.isArray(value) ? value : []);
    return (
      <fieldset className="grid gap-1 sm:col-span-2">
        <legend className="text-ctl font-medium text-check-text">{title}</legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {field.item_enum.map((v) => (
            <Checkbox
              key={v}
              id={`${id}-${v}`}
              label={humanise(v)}
              checked={chosen.has(v)}
              onChange={(e) =>
                onChange(e.target.checked ? [...chosen, v] : [...chosen].filter((x) => x !== v))
              }
            />
          ))}
        </div>
        {error ? (
          <p role="alert" className="m-0 text-small text-danger">
            <span className="font-strong">Error:</span> {error}
          </p>
        ) : null}
      </fieldset>
    );
  }
  if (field.type === "array")
    return (
      <Row id={id} title={title} hint="One per line." error={error} className="sm:col-span-2">
        <Textarea
          id={id}
          rows={3}
          value={text}
          invalid={Boolean(error)}
          onChange={(e) => onChange(e.target.value)}
        />
      </Row>
    );
  if (field.type === "boolean")
    return (
      <Row id={id} title={title} error={error}>
        <Select id={id} value={text} onChange={(e) => onChange(e.target.value)}>
          <option value="">Not stated</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </Select>
      </Row>
    );
  if (field.enum)
    return (
      <Row id={id} title={title} error={error}>
        <Select id={id} value={text} onChange={(e) => onChange(e.target.value)}>
          <option value="">Not stated</option>
          {field.enum.map((v) => (
            <option key={v} value={v}>
              {humanise(v)}
            </option>
          ))}
        </Select>
      </Row>
    );
  if (field.type === "object")
    return (
      <Row id={id} title={title} hint="JSON." error={error} className="sm:col-span-2">
        <Textarea
          id={id}
          rows={3}
          value={text}
          invalid={Boolean(error)}
          onChange={(e) => onChange(e.target.value)}
        />
      </Row>
    );
  const date = field.format === "date";
  const dateTime = field.format === "date-time";
  return (
    <Row id={id} title={title} error={error}>
      <TextInput
        id={id}
        type={
          date
            ? "date"
            : dateTime
              ? "datetime-local"
              : field.type === "integer" || field.type === "number"
                ? "number"
                : "text"
        }
        maxLength={field.max_length ?? undefined}
        value={text}
        invalid={Boolean(error)}
        onChange={(e) => onChange(e.target.value)}
      />
    </Row>
  );
}
