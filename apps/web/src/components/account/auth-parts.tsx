"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

/** Sign-in / registration page in the Stripe pattern (D-53): a pale canvas, one 400px card, a short title and the
 *  form, nothing else. No illustration or intro paragraph, so even the long registration form fits one screen. */
export function AuthPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="relative isolate flex min-h-[calc(100dvh-82px)] justify-center overflow-hidden bg-surface-pale">
      {/* The system's ruby-to-magenta accent as one soft diagonal band, wide screens only (decorative). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -left-24 -z-10 hidden h-64 w-[60%] -rotate-12 bg-linear-to-r from-ruby to-magenta opacity-80 md:block"
      />
      <div className="w-full max-w-[404px] px-3 py-2 sm:px-4 sm:py-6 [&_a]:text-accent">
        <div className="rounded-feature border border-border-panel bg-surface p-3.5 shadow-ambient sm:p-6">
          <h1 className="mb-2.5 text-title tracking-title sm:mb-3">{title}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}

/** The grey strip under the card ("New to UPNEXT? Create account"). */
export function AuthSwitch({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-card bg-surface-pale px-3 py-1.5 text-center text-ctl text-check-text sm:py-2.5">
      {children}
    </p>
  );
}

/** Shared by every text control on the one-screen forms: 36px on phones (so registration fits a phone screen),
 *  40px from the small breakpoint up; 14px light text; a soft 2px focus halo as on Stripe's forms. */
export const AUTH_CONTROL =
  "block min-h-[36px] w-full rounded-control border border-control-border bg-surface px-3 text-ctl font-light text-ink focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/25 sm:min-h-field aria-[invalid=true]:border-danger aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-danger";

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  /** Adds a show / hide button (for passwords). */
  reveal?: boolean;
  /** Content opposite the label, e.g. "Forgot your password?". */
  aside?: ReactNode;
};

/** Labelled input, label always visible above it; the error text starts with "Error:". */
export function AuthField({
  id,
  label,
  hint,
  error,
  reveal,
  aside,
  className,
  type = "text",
  ...props
}: FieldProps) {
  const [shown, setShown] = useState(false);
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-ctl font-medium leading-tight text-check-text">
          {label}
        </label>
        {aside}
      </div>
      <div className="relative">
        <input
          id={id}
          type={reveal && shown ? "text" : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={cn(AUTH_CONTROL, reveal && "pr-11", className)}
          {...props}
        />
        {reveal ? (
          <button
            type="button"
            onClick={() => setShown(!shown)}
            aria-pressed={shown}
            className="absolute inset-y-0 right-0 flex min-w-[40px] items-center justify-center text-muted hover:text-ink"
          >
            <Icon name={shown ? "eyeOff" : "eye"} className="h-4 w-4" />
            <span className="sr-only">{shown ? "Hide password" : "Show password"}</span>
          </button>
        ) : null}
      </div>
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-small text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-small text-danger">
          <span className="font-strong">Error:</span> {error}
        </p>
      ) : null}
    </div>
  );
}
