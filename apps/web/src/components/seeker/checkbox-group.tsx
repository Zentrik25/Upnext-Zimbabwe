"use client";

import { Checkbox } from "@/components/ui";

export type Option = { value: string; label: string };

/**
 * A labelled group of checkboxes with an optional ceiling. At the ceiling the unchecked boxes are disabled and
 * the hint says why, so nobody has to guess.
 */
export function CheckboxGroup({
  name,
  legend,
  hint,
  options,
  selected,
  onChange,
  max,
}: {
  name: string;
  legend: string;
  hint?: string;
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
  max?: number;
}) {
  const full = max !== undefined && selected.length >= max;
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="p-0 text-small font-strong">{legend}</legend>
      {hint || max ? (
        <p id={`${name}-hint`} className="mt-[2px] text-small text-muted">
          {[hint, max ? `Choose up to ${max}.` : null].filter(Boolean).join(" ")}
          {full ? " You have reached the limit." : ""}
        </p>
      ) : null}
      <div className="mt-2 grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        {options.map((option) => {
          const checked = selected.includes(option.value);
          return (
            <Checkbox
              key={option.value}
              id={`${name}-${option.value}`}
              name={name}
              value={option.value}
              label={option.label}
              checked={checked}
              disabled={full && !checked}
              aria-describedby={hint || max ? `${name}-hint` : undefined}
              className="min-h-[44px]"
              onChange={() =>
                onChange(checked ? selected.filter((v) => v !== option.value) : [...selected, option.value])
              }
            />
          );
        })}
      </div>
    </fieldset>
  );
}
