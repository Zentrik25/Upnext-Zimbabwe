import { OPERATOR } from "@/content/legal/operator";
import type { Metadata } from "next";
import { BRAND, openGraphFor } from "@/lib/brand";
import { ProsePage, Section } from "@/components/content/prose";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Contact",
  description: `How to reach the ${BRAND.name} team.`,
  alternates: { canonical: "/contact" },
  openGraph: openGraphFor("/contact"),
};

export default function ContactPage() {
  return (
    <ProsePage title="Contact" intro="Questions, corrections and privacy requests.">
      <Section title="E-mail">
        <p>
          General questions and listing corrections:{" "}
          <a href={`mailto:${BRAND.email}`} className="text-accent underline" data-testid="contact-email">
            {BRAND.email}
          </a>
          .
        </p>
        <p>
          Help with an account and privacy requests:{" "}
          <a
            href={`mailto:${OPERATOR.privacyEmail}`}
            className="text-accent underline"
            data-testid="contact-support-email"
          >
            {OPERATOR.privacyEmail}
          </a>
          . UPNEXT Careers is operated by {OPERATOR.legalName}, Zimbabwe.
        </p>
      </Section>
      <Section title="What to include">
        <p>
          For a correction, give the address of the listing and what is wrong. To report a suspected fake or
          misleading listing, use <strong>Report this opportunity</strong> on its page. For a privacy request,
          write from the e-mail address of your account. Never send a password.
        </p>
      </Section>
    </ProsePage>
  );
}
