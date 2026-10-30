"use client";

import { useEffect, useState } from "react";
import { Select, TextInput } from "@/components/ui";

/**
 * Picks a record by name: a search box that narrows a list from `/api/v1/staff/lookup/<what>`. Used for
 * organisations and locations, which are too many to list whole.
 */
export function LookupSelect({
  id,
  lookup,
  value,
  onChange,
  invalid,
  blank = "Leave empty",
}: {
  id: string;
  lookup: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  blank?: string;
}) {
  const [term, setTerm] = useState("");
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const r = await fetch(`/api/v1/staff/lookup/${lookup}?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
          credentials: "same-origin",
        });
        if (r.ok) setOptions(((await r.json()) as { data: { id: string; name: string }[] }).data);
      } catch {
        /* keep the list shown */
      }
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [lookup, term]);
  return (
    <div className="grid gap-2">
      <TextInput
        id={`${id}-search`}
        aria-label="Search by name"
        placeholder="Type part of a name"
        autoComplete="off"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
      />
      <Select id={id} value={value} invalid={invalid} onChange={(e) => onChange(e.target.value)}>
        <option value="">{blank}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
