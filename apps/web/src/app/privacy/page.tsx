import type { Metadata } from "next";
import { socialFor } from "@/lib/brand";
import { LegalDocument } from "@/components/content/legal-document";
import { privacyFor } from "@/content/legal/privacy";
import { adsenseMode } from "@/lib/adsense";
import { legalPublished } from "@/content/legal/operator";

// Read the publication flag on each request, not at build time.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  const doc = privacyFor(adsenseMode());
  return {
    title: doc.title,
    description: doc.description,
    alternates: { canonical: "/privacy" },
    ...socialFor("/privacy", { title: doc.title, description: doc.description }),
    robots: legalPublished() ? { index: true, follow: true } : { index: false, follow: true },
  };
}

export default function PrivacyPage() {
  return <LegalDocument doc={privacyFor(adsenseMode())} />;
}
