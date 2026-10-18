"use client";

import { useEffect, useId, useState } from "react";
import { Button, TextInput } from "@/components/ui";

export type PickedSkill = { id: string; name: string };
const MAX_SKILLS = 30;

/** Search the approved skills list and add from it. Free text never becomes a skill. */
export function SkillPicker({
  value,
  onChange,
}: {
  value: PickedSkill[];
  onChange: (next: PickedSkill[]) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<PickedSkill[]>([]);
  const [note, setNote] = useState("");
  const full = value.length >= MAX_SKILLS;
  const searching = query.trim().length >= 2;
  const shown = searching ? found : [];

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/v1/skills?q=${encodeURIComponent(term)}&limit=8`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) return setFound([]);
        const body = (await response.json()) as { data: PickedSkill[] };
        setFound(body.data.filter((skill) => !value.some((v) => v.id === skill.id)));
      } catch {
        /* aborted or offline: keep the last list */
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, value]);

  const add = (skill: PickedSkill) => {
    onChange([...value, skill]);
    setNote(`Added ${skill.name}.`);
    setFound((list) => list.filter((s) => s.id !== skill.id));
  };
  const remove = (skill: PickedSkill) => {
    onChange(value.filter((v) => v.id !== skill.id));
    setNote(`Removed ${skill.name}.`);
  };

  return (
    <div>
      <label htmlFor={`${id}-q`} className="text-small font-strong">
        Skills
      </label>
      <p id={`${id}-hint`} className="mt-[2px] text-small text-muted">
        Type at least two letters, then add from the list. Up to {MAX_SKILLS}.
      </p>
      <TextInput
        id={`${id}-q`}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        maxLength={50}
        autoComplete="off"
        disabled={full}
        aria-describedby={`${id}-hint`}
        className="mt-2 max-w-[360px]"
      />
      {shown.length > 0 ? (
        <ul className="m-0 mt-2 flex list-none flex-wrap gap-2 p-0" aria-label="Matching skills">
          {shown.map((skill) => (
            <li key={skill.id}>
              <Button variant="secondary" onClick={() => add(skill)} disabled={full}>
                Add {skill.name}
              </Button>
            </li>
          ))}
        </ul>
      ) : searching ? (
        <p className="mt-2 text-small text-muted">No skill in the list matches that.</p>
      ) : null}
      {value.length > 0 ? (
        <ul
          className="m-0 mt-3 flex list-none flex-wrap gap-2 p-0"
          aria-label="Your skills"
          data-testid="skills"
        >
          {value.map((skill) => (
            <li
              key={skill.id}
              className="inline-flex items-center gap-1 border border-tag-border bg-tag-bg px-2 py-[2px] text-small"
            >
              {skill.name}
              <button
                type="button"
                onClick={() => remove(skill)}
                aria-label={`Remove ${skill.name}`}
                className="inline-flex min-h-[28px] min-w-[28px] items-center justify-center text-ctl text-accent"
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p role="status" aria-live="polite" className="sr-only">
        {note}
      </p>
    </div>
  );
}
