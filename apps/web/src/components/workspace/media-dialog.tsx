"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui";
import type { MediaItem } from "@/lib/staff-types";
import { MediaBrowser } from "./media-browser";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The Media Library as a picker: a modal dialog over the editor. Escape or Close returns to the page with the
 * focus where it was; Tab stays inside the dialog while it is open.
 */
export function MediaDialog({
  open,
  onClose,
  onUse,
  currentName,
}: {
  open: boolean;
  onClose: () => void;
  onUse: (item: MediaItem) => void;
  currentName?: string;
}) {
  const title = useId();
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("input, button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;
      const nodes = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!nodes.length) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-brand-dark/50 p-0 sm:p-4">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title}
        className="flex max-h-full w-full max-w-[860px] flex-col overflow-hidden border border-border-panel bg-surface shadow-subtle sm:rounded-card"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 id={title} className="m-0 text-base font-medium">
            Choose from the library
          </h2>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="overflow-y-auto p-4">
          <MediaBrowser
            currentName={currentName}
            pageSize={12}
            onUse={(item) => {
              onUse(item);
              onClose();
            }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
