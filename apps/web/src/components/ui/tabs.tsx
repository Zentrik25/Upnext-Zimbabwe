import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type TabItem = { href: string; label: string; current?: boolean };

/** Category tabs: a labelled navigation landmark of links (they are filters of /opportunities later). */
export function Tabs({
  label,
  items,
  className,
}: {
  label: string;
  items: TabItem[];
  className?: string;
}): ReactNode {
  return (
    <nav aria-label={label} className={cn("border-b border-line", className)}>
      <ul className="m-0 flex list-none overflow-x-auto p-0 max-sm:flex-nowrap">
        {items.map((item) => (
          <li key={item.href + item.label}>
            <a
              href={item.href}
              aria-current={item.current ? "page" : undefined}
              className={cn(
                "inline-block whitespace-nowrap border-b-2 px-[14px] py-[10px] text-ctl",
                item.current ? "border-accent font-semi text-accent" : "border-transparent text-tab-text",
              )}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
