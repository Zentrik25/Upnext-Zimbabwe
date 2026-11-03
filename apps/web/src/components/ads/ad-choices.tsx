"use client";

import { setAdConsent, useAdConsent } from "@/lib/ad-consent";
import { cn } from "@/lib/cn";

/** Footer control to give or withdraw the advertising choice at any time. Shown only while advertising is live. */
export function AdChoices({ className }: { className?: string }) {
  const consent = useAdConsent();
  const options = [
    { value: "granted", label: "Allow" },
    { value: "denied", label: "Don't allow" },
  ] as const;
  return (
    <div role="group" aria-label="Advertising choice" className={cn("flex items-center gap-1", className)}>
      <span className="mr-1" aria-hidden="true">
        Advertising
      </span>
      {options.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          aria-pressed={consent === value}
          onClick={() => setAdConsent(value)}
          className={cn(
            "inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-control border px-2 text-small",
            consent === value
              ? "border-brand-dark-text bg-white/10 text-white"
              : "border-transparent text-brand-dark-text hover:bg-white/5",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
