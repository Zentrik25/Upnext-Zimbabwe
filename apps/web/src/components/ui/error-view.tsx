"use client";

import { useEffect, useRef } from "react";
import { Button } from "./button";

/**
 * What a visitor sees when a page fails to render. It never shows the error text (that can contain internals);
 * it offers a retry that re-renders the segment, a way out, and the reference (digest) staff can look up in the
 * logs. Focus moves to the heading so keyboard and screen-reader users learn what happened (WCAG 3.3.1/4.1.3).
 */
export function ErrorView({
  reset,
  digest,
  title = "Something went wrong",
  homeHref = "/",
}: {
  reset: () => void;
  digest?: string;
  title?: string;
  homeHref?: string;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <div
      role="alert"
      className="border border-dashed border-border-empty p-7 text-center"
      data-testid="error-view"
    >
      <h1 ref={heading} tabIndex={-1} className="text-title font-strong text-ink outline-none">
        {title}
      </h1>
      <p className="mt-[7px] text-base text-empty-text">
        We could not show this page. Nothing you entered has been lost on our side. Try again, or go back to
        the home page.
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <Button variant="secondary" onClick={reset}>
          Try again
        </Button>
        {/* A plain link: it still works when the page's scripts are what failed. */}
        <a href={homeHref} className="text-accent underline">
          Go to the home page
        </a>
      </div>
      {digest ? (
        <p className="mt-3 text-small text-muted">
          Reference: <code>{digest}</code>
        </p>
      ) : null}
    </div>
  );
}
