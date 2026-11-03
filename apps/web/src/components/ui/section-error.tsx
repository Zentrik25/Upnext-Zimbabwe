"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "./button";
import { EmptyState } from "./empty-state";

/**
 * A section whose request failed: a clear message and a retry. A failure is never shown as an empty result.
 * Retry re-runs the server render of the current address (`router.refresh()`), so the section's own Suspense
 * skeleton shows again while the request is repeated, and the button says so while it waits. The message is
 * announced once (`role="alert"`); the heading level is the caller's, since it depends on the page around it.
 */
export function SectionError({
  title,
  children,
  as = "h3",
  className,
}: {
  title: string;
  children?: string;
  as?: "h1" | "h2" | "h3";
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div role="alert" className={className} data-testid="section-error">
      <EmptyState as={as} title={title}>
        {children}
      </EmptyState>
      <div className="mt-3 text-center">
        <Button
          variant="secondary"
          disabled={pending}
          aria-disabled={pending}
          onClick={() => start(() => router.refresh())}
        >
          {pending ? "Trying again…" : "Try again"}
        </Button>
      </div>
    </div>
  );
}
