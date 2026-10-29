import type { Metadata } from "next";
import { openGraphFor } from "@/lib/brand";
import { LegalDocument } from "@/components/content/legal-document";
import { TERMS } from "@/content/legal/terms";
import { legalPublished } from "@/content/legal/operator";

// Read the publication flag on each request, not at build time.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    title: TERMS.title,
    description: TERMS.description,
    alternates: { canonical: "/terms" },
    openGraph: openGraphFor("/terms", { title: TERMS.title, description: TERMS.description }),
    robots: legalPublished() ? { index: true, follow: true } : { index: false, follow: true },
  };
}

export default function TermsPage() {
  return <LegalDocument doc={TERMS} />;
}
