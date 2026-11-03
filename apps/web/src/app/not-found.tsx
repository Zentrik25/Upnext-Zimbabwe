import Link from "next/link";
import { Container } from "@/components/layout";
import { EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <Container className="py-10">
      <EmptyState as="h1" title="Page not found">
        The page you asked for does not exist.{" "}
        <Link href="/" className="text-accent underline">
          Return to the home page
        </Link>
        .
      </EmptyState>
    </Container>
  );
}
