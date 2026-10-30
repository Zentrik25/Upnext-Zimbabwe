import type { FormHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { SearchForm } from "./search-form";
import { cn } from "@/lib/cn";

/**
 * The compact search control from the reference: one outlined group holding a text field (with a magnifying
 * glass inside it) and optionally a select. There is no separate button: Enter submits on a keyboard and the
 * phone keyboard shows "Search" (`enterKeyHint`). A blank search that would change nothing is not sent. On
 * narrow screens the group unwraps into separate outlined controls.
 */
export function SearchGroup({
  children,
  ...props
}: FormHTMLAttributes<HTMLFormElement> & { children: ReactNode }) {
  return <SearchForm {...props}>{children}</SearchForm>;
}

const part =
  "min-h-field border-0 border-r border-line bg-surface px-[11px] py-2 text-ctl text-ink max-sm:border max-sm:border-control-border";

SearchGroup.Input = function SearchInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { id: string }) {
  return (
    <div className="relative min-w-0 flex-1 max-sm:basis-full sm:[&:not(:last-child)>input]:rounded-r-none sm:[&:last-child>input]:border-r-0">
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        className="pointer-events-none absolute top-1/2 left-[11px] -translate-y-1/2 text-muted"
      >
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5 14 14" />
      </svg>
      <input
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        className={cn(part, "block w-full pl-[34px]", className)}
        {...props}
      />
    </div>
  );
};

SearchGroup.Select = function SearchSelect({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { id: string }) {
  return (
    <select
      className={cn(part, "w-[155px] sm:rounded-l-none sm:border-r-0 max-sm:flex-1", className)}
      {...props}
    >
      {children}
    </select>
  );
};
