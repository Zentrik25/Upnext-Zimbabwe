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
          Write to{" "}
          <a href={`mailto:${BRAND.email}`} className="text-accent underline" data-testid="contact-email">
            {BRAND.email}
          </a>
          . It is the only address we use, for general questions, listing corrections, help with an account
          and privacy requests.
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
