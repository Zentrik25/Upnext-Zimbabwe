"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A button that opens a small panel (notifications, account, row actions). Closes on Escape (focus returns to
 * the button), on a click elsewhere and when focus leaves the panel. `aria-expanded` and `aria-controls` tell
 * assistive technology what the button does.
 */
export function Menu({
  label,
  button,
  children,
  align = "right",
  buttonClassName,
  panelClassName,
}: {
  label: string;
  button: ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "left" | "right";
  buttonClassName?: string;
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const close = () => setOpen(false);
  return (
    <div
      ref={root}
      className="relative"
      onBlur={(e) => {
        if (open && !e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-control text-ink hover:bg-row-hover",
          buttonClassName,
        )}
      >
        {button}
      </button>
      {open ? (
        <div
          id={id}
          className={cn(
            "absolute top-[calc(100%+6px)] z-30 min-w-[220px] rounded-card border border-line bg-surface p-[6px] shadow-elevated",
            align === "right" ? "right-0" : "left-0",
            panelClassName,
          )}
        >
          {typeof children === "function" ? children(close) : children}
        </div>
      ) : null}
    </div>
  );
}

export const menuLink =
  "flex min-h-[40px] items-center gap-[10px] rounded-control px-[10px] py-2 text-ctl text-ink hover:bg-match-bg";
