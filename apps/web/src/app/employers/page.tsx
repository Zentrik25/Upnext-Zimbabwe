import type { Metadata } from "next";
import { socialFor } from "@/lib/brand";
import { Container } from "@/components/layout";
import {
  ContentSection,
  InfoCard,
  InfoGrid,
  PageHeader,
  ProcessSteps,
  TextLink,
} from "@/components/content/blocks";
import { ButtonLink } from "@/components/ui";

const DESCRIPTION =
  "Post jobs, internships and graduate programmes on UPNEXT Careers. Organisations are verified and every listing is reviewed by an editor before it is public.";
export const metadata: Metadata = {
  title: "For employers",
  description: DESCRIPTION,
  alternates: { canonical: "/employers" },
  ...socialFor("/employers", { title: "For employers", description: DESCRIPTION }),
};

export default function EmployersPage() {
  return (
    <>
      <PageHeader
        eyebrow="For employers"
        title="Reach people looking for work in Zimbabwe"
        intro="Every organisation is verified and every listing is reviewed by an editor before it is public."
        actions={
          <>
            <ButtonLink href="/employers/register">Create an employer account</ButtonLink>
            <ButtonLink href="/employer" variant="secondary">
              Go to your dashboard
            </ButtonLink>
          </>
        }
      />
      <Container className="pb-[65px]">
        <div className="max-w-[760px]">
          <ContentSection id="how-it-works" title="How it works">
            <ProcessSteps
              steps={[
                {
                  title: "Create an account",
                  body: "Use your work e-mail address and confirm it.",
                },
                {
                  title: "Claim your organisation",
                  body: "You say who you are and how we can confirm it. An editor checks by hand; we record how the organisation was verified.",
                },
                {
                  title: "Post and manage listings",
                  body: "Jobs, internships and graduate programmes. Save drafts, submit when ready, and change a published listing by starting an amendment.",
                },
                {
                  title: "An editor reviews each listing",
                  body: "It is published only after a different person approves it. You see the reasons if it is sent back.",
                },
                {
                  title: "See how it is doing",
                  body: "Your dashboard shows views, clicks on the apply link and how many people saved the listing.",
                },
              ]}
            />
          </ContentSection>
          <ContentSection id="limits" title="What we do not do" className="border-t border-line">
            <InfoGrid cols={2}>
              <InfoCard title="No applications">
                We never receive or track applications. Applicants go to your website, e-mail address or
                instructions.
              </InfoCard>
              <InfoCard title="No payments">
                We do not accept payment from applicants or let listings ask applicants to pay.
              </InfoCard>
              <InfoCard title="Labels stay separate">
                A verified organisation does not make a listing verified. Listing labels stay separate and are
                set by editors.
              </InfoCard>
              <InfoCard title="No promised turnaround">
                We cannot promise how quickly an editor will respond.
              </InfoCard>
            </InfoGrid>
          </ContentSection>
          <ContentSection id="questions" title="Questions" className="border-t border-line">
            <p className="text-base">
              See the <TextLink href="/contact">contact page</TextLink> and the{" "}
              <TextLink href="/privacy">privacy notice</TextLink> (a draft awaiting owner and legal review).
            </p>
          </ContentSection>
        </div>
      </Container>
    </>
  );
}
