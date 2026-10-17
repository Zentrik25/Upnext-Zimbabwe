import Link from "next/link";
import { Container } from "@/components/layout";
import { EmptyState } from "@/components/ui";

export default function OpportunityNotFound() {
  return (
    <Container className="py-10">
      <EmptyState title="Opportunity not found">
        It may have been taken down, or the address may be wrong.{" "}
        <Link href="/opportunities" className="text-accent underline">
          Browse all opportunities
        </Link>
        .
      </EmptyState>
    </Container>
  );
}
