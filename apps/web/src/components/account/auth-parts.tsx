"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { JobSearchArt } from "@/components/brand/job-search-art";
import { Icon, type IconName } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

/** Centred sign-in / registration page: heading, short intro, the illustration, then the form. */
export function AuthPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="bg-surface-pale">
      <div className="mx-auto w-full max-w-[460px] px-6 pt-8 pb-14 max-sm:px-4">
        <h1 className="text-center text-section font-strong tracking-section max-sm:text-sub">{title}</h1>
        <p className="mt-2 text-center text-base text-muted">{intro}</p>
        <JobSearchArt className="mx-auto my-4 h-auto w-full max-w-[220px]" />
        <div className="rounded-feature border border-border-panel bg-surface p-6 shadow-subtle max-sm:p-4">
          {children}
        </div>
      </div>
    </div>
  );
}

type IconFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  id: string;
  label: string;
  icon: IconName;
  hint?: string;
  error?: string;
  /** Adds a show / hide button (for passwords). */
  reveal?: boolean;
};

/** Labelled input with a leading icon; the label is always visible and the error text starts with "Error:". */
export function IconField({
  id,
  label,
  icon,
  hint,
  error,
  reveal,
  className,
  type = "text",
  ...props
}: IconFieldProps) {
  const [shown, setShown] = useState(false);
  return (
    <div className="grid gap-[5px]">
      <label htmlFor={id} className="text-ctl font-medium text-check-text">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">
          <Icon name={icon} className="h-[18px] w-[18px]" />
        </span>
        <input
          id={id}
          type={reveal && shown ? "text" : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={cn(
            "block min-h-field w-full rounded-control border border-control-border bg-surface pl-10 text-ctl font-light text-ink focus-visible:border-focus focus-visible:ring-1 focus-visible:ring-focus aria-[invalid=true]:border-danger aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-danger",
            reveal ? "pr-12" : "pr-3",
            className,
          )}
          {...props}
        />
        {reveal ? (
          <button
            type="button"
            onClick={() => setShown(!shown)}
            aria-pressed={shown}
            className="absolute inset-y-0 right-0 flex min-w-[44px] items-center justify-center text-muted hover:text-ink"
          >
            <Icon name={shown ? "eyeOff" : "eye"} />
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
