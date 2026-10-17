import type { Metadata } from "next";
import { ProsePage, Section } from "@/components/content/prose";
import { contactEmail } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Contact",
  description: "How to reach the UPNEXT team.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  const email = contactEmail();
  return (
    <ProsePage title="Contact" intro="Questions, corrections and privacy requests.">
      <Section title="E-mail">
        {email ? (
          <p>
            <a href={`mailto:${email}`} className="text-accent underline">
              {email}
            </a>
          </p>
        ) : (
          <p data-testid="contact-pending">
            Contact details will be published here before launch. Until then there is no address to write to.
          </p>
        )}
      </Section>
      <Section title="What to include">
        <p>
          For a correction, give the address of the listing and what is wrong. For a privacy request, write
          from the e-mail address of your account. Never send a password.
        </p>
      </Section>
    </ProsePage>
  );
}
