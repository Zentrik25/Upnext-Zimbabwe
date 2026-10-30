import type { Metadata } from "next";
import { socialFor } from "@/lib/brand";
import { Container } from "@/components/layout";
import {
  ContentSection,
  PageCTA,
  PageHeader,
  TextLink,
  VerificationLevels,
} from "@/components/content/blocks";
import { ButtonLink } from "@/components/ui";

const DESCRIPTION =
  "What UPNEXT Careers is, where its listings come from and what its verification labels mean.";
export const metadata: Metadata = {
  title: "About",
  description: DESCRIPTION,
  alternates: { canonical: "/about" },
  ...socialFor("/about", { title: "About UPNEXT Careers", description: DESCRIPTION }),
};

export default function AboutPage() {
  return (
    <>
      <PageHeader
        eyebrow="About"
        title="About UPNEXT Careers"
        intro="UPNEXT Careers helps people in Zimbabwe find jobs, internships, graduate programmes, scholarships, tenders and grants in one place."
        actions={<ButtonLink href="/opportunities">Browse opportunities</ButtonLink>}
      />
      <Container className="pb-[65px]">
        <div className="max-w-[760px]">
          <ContentSection id="what-we-do" title="What UPNEXT does">
            <p className="text-base">
              We collect opportunities published by employers, institutions and funders, check where each one
              came from, and present it with its source. You can browse and search without an account. An
              account lets you save listings and come back to them.
            </p>
          </ContentSection>
          <ContentSection id="sources" title="Where listings come from" className="border-t border-line">
            <p className="text-base">
              Every listing names at least one source: the issuer&apos;s own website or notice, a newspaper, a
              gazette, a message from the issuer, or similar. The page shows the source, the date we looked at
              it and, where there is one, a link to it.
            </p>
          </ContentSection>
          <ContentSection
            id="labels"
            title="What the labels mean"
            lead="Publishing a listing does not mean we have verified it. The label says what we actually checked."
            className="border-t border-line"
          >
            <VerificationLevels />
          </ContentSection>
          <ContentSection id="apply" title="How you apply" className="border-t border-line">
            <p className="text-base">
              UPNEXT does not receive applications. Each listing tells you where to apply: the issuer&apos;s
              website, an e-mail address or written instructions. Before you apply, check the details on the
              issuer&apos;s own channel, and be careful with any request that asks you to pay. Our guide
              explains{" "}
              <TextLink href="/guides/apply-safely-and-avoid-scams">
                how to apply safely and avoid scams
              </TextLink>
              .
            </p>
          </ContentSection>
          <ContentSection id="corrections" title="Corrections" className="border-t border-line">
            <p className="text-base">
              If a listing is wrong or has closed, tell us on the{" "}
              <TextLink href="/contact">contact page</TextLink>. Listings that are withdrawn by their issuer
              or that pass their deadline are marked as closed and leave the search results. The full process
              is described in{" "}
              <TextLink href="/guides/how-listings-are-verified">
                how listings are checked and verified
              </TextLink>
              .
            </p>
          </ContentSection>
          <PageCTA
            title="Explore opportunities"
            href="/opportunities"
            label="Browse opportunities"
            secondary={{ href: "/categories", label: "Browse by category" }}
          >
            Search by keyword, location or category. Every listing names its source.
          </PageCTA>
        </div>
      </Container>
    </>
  );
}
