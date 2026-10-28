"use client";

import "@/styles/globals.css";
import { ErrorView } from "@/components/ui/error-view";

/**
 * Last resort: replaces the root layout when the layout itself fails. It must render its own <html> and
 * <body>, so it avoids anything that depends on the layout (header, session lookups).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main id="main" className="mx-auto w-full max-w-page px-6 py-10 max-sm:px-[14px]">
          <ErrorView reset={reset} digest={error.digest} />
        </main>
      </body>
    </html>
  );
}
