"use client";

import { Button, EmptyState } from "@/components/ui";

export default function WorkspaceError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="grid gap-3">
      <EmptyState as="h1" title="The workspace could not load">
        The staff service could not be reached or answered with an error. Nothing was changed.
      </EmptyState>
      <div className="text-center">
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
