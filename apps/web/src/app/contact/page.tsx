import { OPERATOR } from "@/content/legal/operator";
import type { Metadata } from "next";
import { BRAND, socialFor } from "@/lib/brand";
import { Container } from "@/components/layout";
import { ContentSection, InfoCard, InfoGrid, PageHeader } from "@/components/content/blocks";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Contact",
  description: `How to reach the ${BRAND.name} team.`,
  alternates: { canonical: "/contact" },
  ...socialFor("/contact", { title: "Contact", description: `How to reach the ${BRAND.name} team.` }),
};

export default function ContactPage() {
  return (
    <>
      <PageHeader title="Contact" intro="Questions, corrections and privacy requests." />
      <Container className="pt-6 pb-[65px]">
        <div className="max-w-[760px]">
          <InfoGrid cols={2}>
            <InfoCard title="General questions and listing corrections">
              <a href={`mailto:${BRAND.email}`} className="text-accent" data-testid="contact-email">
                {BRAND.email}
              </a>
            </InfoCard>
            <InfoCard title="Account help and privacy requests">
              <a
                href={`mailto:${OPERATOR.privacyEmail}`}
                className="text-accent"
                data-testid="contact-support-email"
              >
                {OPERATOR.privacyEmail}
              </a>
              <span className="mt-1 block text-ctl">
                UPNEXT Careers is operated by {OPERATOR.legalName}, Zimbabwe.
              </span>
            </InfoCard>
          </InfoGrid>
          <ContentSection id="what-to-include" title="What to include">
            <ul className="m-0 grid list-disc gap-2 pl-5 text-base">
              <li>
                <strong>A correction:</strong> the address of the listing and what is wrong.
              </li>
              <li>
                <strong>A suspected fake or misleading listing:</strong> use{" "}
                <strong>Report this opportunity</strong> on its page.
              </li>
              <li>
                <strong>A privacy request:</strong> write from the e-mail address of your account.
              </li>
              <li>Never send a password.</li>
            </ul>
          </ContentSection>
        </div>
      </Container>
    </>
  );
}
