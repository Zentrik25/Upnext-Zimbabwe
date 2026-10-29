"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./icons";
import type { SearchGroups } from "@/lib/staff-types";

const MIN = 2;
const DEBOUNCE_MS = 250;

/**
 * Global search: a combobox with debounced suggestions from the staff API. Enter without a highlighted
 * suggestion searches the full opportunity list. Arrow keys move through the suggestions, Escape closes them;
 * the live region says how many there are.
 */
export function SearchBox() {
  const router = useRouter();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [term, setTerm] = useState("");
  const [groups, setGroups] = useState<SearchGroups["groups"]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const flat = groups.flatMap((g) => g.items);
  const starts = groups.map((_, gi) => groups.slice(0, gi).reduce((sum, g) => sum + g.items.length, 0));
  const show = open && term.trim().length >= MIN;

  useEffect(() => {
    const query = term.trim();
    if (query.length < MIN) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/v1/staff/search?q=${encodeURIComponent(query)}`, {
          credentials: "same-origin",
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) return setOpen(false);
        const body = (await response.json()) as SearchGroups;
        setGroups(body.groups);
        setActive(-1);
        setOpen(true);
      } catch {
        /* aborted or unreachable: keep what is shown */
      }
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  function go(href: string) {
    setOpen(false);
    if (href.startsWith("/workspace")) router.push(href);
    else window.location.assign(href); // the classic staff site is a separate application
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") return setOpen(false);
    if (!show) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && active >= 0 && flat[active]) {
      e.preventDefault();
      go(flat[active].href);
    }
  }

  return (
    <form
      role="search"
      className="relative min-w-0 max-w-[640px] flex-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (active < 0 && term.trim()) go(`/workspace/opportunities?q=${encodeURIComponent(term.trim())}`);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <label htmlFor={`${listId}-q`} className="sr-only">
        Search opportunities, organisations or records
      </label>
      <Icon
        name="search"
        className="pointer-events-none absolute top-[11px] left-[11px] h-[18px] w-[18px] text-muted"
      />
      <input
        id={`${listId}-q`}
        ref={input}
        type="search"
        maxLength={80}
        autoComplete="off"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Search opportunities, organisations or records…"
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-o${active}` : undefined}
        className="block min-h-[40px] w-full rounded-card border border-control-border bg-surface py-2 pr-3 pl-[38px] text-ctl text-ink placeholder:text-muted focus-visible:border-focus focus-visible:ring-1 focus-visible:ring-focus"
      />
      <p className="sr-only" role="status" aria-live="polite">
        {show ? (flat.length ? `${flat.length} suggestions available` : "No suggestions") : ""}
      </p>
      {show ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Search suggestions"
          className="absolute top-[46px] right-0 left-0 z-40 max-h-[60vh] overflow-y-auto rounded-card border border-line bg-surface p-[6px] shadow-elevated"
        >
          {groups.length === 0 ? (
            <p className="px-[10px] py-3 text-ctl text-muted">
              No matches. Press Enter to search the full list.
            </p>
          ) : null}
          {groups.map((g, gi) => (
            <div key={g.group} role="presentation">
              <p
                role="presentation"
                className="px-[10px] pt-2 pb-1 text-small tracking-eyebrow text-muted uppercase"
              >
                {g.group}
              </p>
              {g.items.map((item, ii) => {
                const mine = (starts[gi] ?? 0) + ii;
                return (
                  <a
                    key={item.href}
                    id={`${listId}-o${mine}`}
                    role="option"
                    aria-selected={mine === active}
                    href={item.href}
                    tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.preventDefault();
                      go(item.href);
                    }}
                    className={`flex flex-col gap-px rounded-control px-[10px] py-2 text-ctl text-ink ${mine === active ? "bg-match-bg" : "hover:bg-match-bg"}`}
                  >
                    <span>{item.label}</span>
                    <span className="text-small text-muted">{item.hint}</span>
                  </a>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </form>
  );
}
