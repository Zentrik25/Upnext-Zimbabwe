import type { FormHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The compact search control from the reference: one outlined group holding a text field, a select and
 * a primary button. Children are expected to be `SearchGroup.Input`, `SearchGroup.Select` and a
 * `Button size="search"`. On narrow screens the group unwraps into separate outlined controls.
 */
export function SearchGroup({
  className,
  children,
  ...props
}: FormHTMLAttributes<HTMLFormElement> & { children: ReactNode }) {
  return (
    <form
      role="search"
      className={cn(
        "flex max-w-[790px] border border-control-border max-sm:flex-wrap max-sm:gap-[7px] max-sm:border-0",
        className,
      )}
      {...props}
    >
      {children}
    </form>
  );
}

const part =
  "min-h-search border-0 border-r border-line bg-surface px-[11px] py-2 text-base text-ink max-sm:border max-sm:border-control-border";

SearchGroup.Input = function SearchInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { id: string }) {
  return <input className={cn(part, "min-w-0 flex-1 max-sm:basis-full", className)} {...props} />;
};

SearchGroup.Select = function SearchSelect({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { id: string }) {
  return (
    <select className={cn(part, "w-[155px] max-sm:flex-1", className)} {...props}>
      {children}
    </select>
  );
};
