"use client";

import { Container } from "@/components/layout/container";
import { ErrorView } from "@/components/ui/error-view";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Container className="py-10">
      <ErrorView reset={reset} digest={error.digest} />
    </Container>
  );
}
