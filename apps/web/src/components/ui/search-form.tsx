"use client";

import type { FormHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/** The `<form>` of the search group: blank searches that would change nothing are not sent. */
export function SearchForm({
  className,
  children,
  onSubmit,
  ...props
}: FormHTMLAttributes<HTMLFormElement> & { children: ReactNode }) {
  function guard(event: Parameters<NonNullable<FormHTMLAttributes<HTMLFormElement>["onSubmit"]>>[0]) {
    onSubmit?.(event);
    if (event.defaultPrevented) return;
    const form = event.currentTarget;
    const field = form.elements.namedItem("q");
    if (!(field instanceof HTMLInputElement)) return;
    const q = field.value.trim().replace(/\s+/g, " ");
    const others = [...new FormData(form).entries()].filter(([k, v]) => k !== "q" && String(v) !== "");
    const here = new URL(form.action, window.location.href);
    const onTarget = here.pathname === window.location.pathname;
    const filtered = onTarget && window.location.search.replace(/^\?/, "") !== "";
    if (!q && others.length === 0 && !filtered) {
      event.preventDefault(); // nothing to look for and nothing to clear: no request
      field.value = "";
      field.focus();
      return;
    }
    field.value = q;
    if (!q) {
      // an emptied search box clears the keyword: leave it out of the address instead of sending `q=`
      field.disabled = true;
      setTimeout(() => (field.disabled = false), 0);
    }
  }
  return (
    <form
      role="search"
      className={cn(
        "flex max-w-[790px] sm:rounded-control border border-control-border max-sm:flex-wrap max-sm:gap-[7px] max-sm:border-0",
        className,
      )}
      onSubmit={guard}
      {...props}
    >
      {children}
    </form>
  );
}
