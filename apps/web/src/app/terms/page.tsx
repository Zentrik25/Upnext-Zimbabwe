import type { Metadata } from "next";
import { openGraphFor } from "@/lib/brand";
import Link from "next/link";
import { Bullets, ProsePage, Section } from "@/components/content/prose";

export const metadata: Metadata = {
  title: "Terms of use (draft)",
  description: "Draft terms of use for UPNEXT Careers, awaiting owner and legal review.",
  alternates: { canonical: "/terms" },
  openGraph: openGraphFor("/terms"),
  robots: { index: false, follow: true },
};

export default function TermsPage() {
  return (
    <ProsePage draft title="Terms of use" intro="The rules for using UPNEXT.">
      <Section title="The service">
        <p>
          UPNEXT lists opportunities published by other organisations and shows where each one came from. We
          do not employ, award or fund anything ourselves, we are not a party to any application, and we do
          not receive applications.
        </p>
      </Section>
      <Section title="Information may be incomplete">
        <p>
          We take care to name sources and to label what we checked, but a listing can be out of date or
          wrong. Check the details with the issuer before you rely on them or apply. Verification labels
          describe what we checked and are not a guarantee. See{" "}
          <Link href="/about" className="text-accent underline">
            About
          </Link>
          .
        </p>
      </Section>
      <Section title="Links to other sites">
        <p>
          Apply and source links lead to websites we do not control. Their content and rules are theirs. Be
          careful with any request to pay money or share sensitive documents.
        </p>
        <p>
          <strong className="font-strong">Never pay to apply.</strong> A genuine job, internship, scholarship
          or grant does not ask applicants for a fee, and a tender document may have a published, official
          price at most. We do not list anything that asks applicants to pay or to hand over identity or bank
          details before a real process begins. If you see a listing that looks wrong, tell us on the contact
          page and we will check it and take it down if needed.
        </p>
      </Section>
      <Section title="Your account">
        <Bullets
          items={[
            "Give accurate details and keep your password to yourself. You are responsible for what happens under your account.",
            "One account is for one person.",
            "Tell us if you think someone else has used your account.",
          ]}
        />
      </Section>
      <Section title="Acceptable use">
        <Bullets
          items={[
            "Do not try to break, overload or bypass the service or its limits.",
            "Do not collect the listings in bulk by automated means beyond what the service's limits allow.",
            "Do not use the service to mislead others or to send spam.",
          ]}
        />
      </Section>
      <Section title="Ending your use">
        <p>
          You can delete your account at any time from the account page (see the{" "}
          <Link href="/privacy" className="text-accent underline">
            privacy notice
          </Link>
          ). We may suspend an account that breaks these terms. [Notice and appeal arrangements: to be
          decided.]
        </p>
      </Section>
      <Section title="Liability, governing law and changes">
        <p>
          [Limits of liability, governing law and courts, intellectual property in listings and in the
          service, and how changes to these terms are announced: to be completed after legal review.]
        </p>
      </Section>
    </ProsePage>
  );
}
