import type { Metadata } from "next";
import { openGraphFor } from "@/lib/brand";
import { ProsePage, Section } from "@/components/content/prose";
import { mailboxes } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Contact",
  description: "How to reach the NextJob Zimbabwe team.",
  alternates: { canonical: "/contact" },
  openGraph: openGraphFor("/contact"),
};

export default function ContactPage() {
  const boxes = mailboxes();
  return (
    <ProsePage title="Contact" intro="Questions, corrections and privacy requests.">
      <Section title="E-mail">
        {boxes.length > 0 ? (
          <ul className="m-0 grid list-none gap-2 p-0">
            {boxes.map((box) => (
              <li key={box.email}>
                <span className="text-small text-muted">{box.purpose}</span>
                <br />
                <a href={`mailto:${box.email}`} className="text-accent underline">
                  {box.email}
                </a>
              </li>
            ))}
          </ul>
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
