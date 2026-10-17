"use client";

import { Container } from "@/components/layout/container";
import { Button, EmptyState } from "@/components/ui";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <Container className="py-10">
      <EmptyState title="Something went wrong">
        We could not load this page. Please try again.
        <span className="mt-3 block">
          <Button variant="secondary" onClick={reset}>
            Try again
          </Button>
        </span>
      </EmptyState>
    </Container>
  );
}
