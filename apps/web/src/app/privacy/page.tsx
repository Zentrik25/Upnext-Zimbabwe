import type { Metadata } from "next";
import { socialFor } from "@/lib/brand";
import { LegalDocument } from "@/components/content/legal-document";
import { PRIVACY } from "@/content/legal/privacy";
import { legalPublished } from "@/content/legal/operator";

// Read the publication flag on each request, not at build time.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    title: PRIVACY.title,
    description: PRIVACY.description,
    alternates: { canonical: "/privacy" },
    ...socialFor("/privacy", { title: PRIVACY.title, description: PRIVACY.description }),
    robots: legalPublished() ? { index: true, follow: true } : { index: false, follow: true },
  };
}

export default function PrivacyPage() {
  return <LegalDocument doc={PRIVACY} />;
}
