import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/layout";
import { ReportForm } from "@/components/opportunities/report-form";
import { EmptyState } from "@/components/ui";
import { getOpportunity } from "@/lib/catalog";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export const metadata: Metadata = {
  title: "Report this opportunity",
  robots: { index: false, follow: false },
};

export default async function ReportPage({ params }: Props) {
  const { slug } = await params;
  const result = await getOpportunity(slug);
  if (!result.ok) {
    return (
      <Container className="py-10" role="alert">
        <EmptyState as="h1" title="Reporting is unavailable">
          {result.reason === "rate-limited"
            ? "Too many requests. Wait a minute and try again."
            : "The service could not be reached. Try again shortly."}
        </EmptyState>
      </Container>
    );
  }
  if (result.data === null) notFound();
  const listing = result.data;
  return (
    <Container className="py-8">
      <nav aria-label="Breadcrumb" className="mb-3 text-small">
        <Link href={listing.canonical_path} className="text-accent underline">
          ← Back to {listing.title}
        </Link>
      </nav>
      <div className="mx-auto w-full max-w-[640px]">
        <h1 className="text-[28px] font-strong leading-[1.15] tracking-section sm:text-section">
          Report this opportunity
        </h1>
        <p className="mt-1 mb-5 text-base text-muted">
          Tell us if something about this opportunity looks wrong, false or unsafe. Our staff will check it.
          Never pay money to get a job, interview or scholarship.
        </p>
        <ReportForm slug={listing.slug} title={listing.title} />
      </div>
    </Container>
  );
}
