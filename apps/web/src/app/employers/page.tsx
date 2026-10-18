import type { Metadata } from "next";
import { openGraphFor } from "@/lib/brand";
import Link from "next/link";
import { Bullets, ProsePage, Section } from "@/components/content/prose";
import { ButtonLink } from "@/components/ui";

export const metadata: Metadata = {
  title: "For employers",
  description:
    "Post jobs, internships and graduate programmes on NextJob Zimbabwe. Organisations are verified and every listing is reviewed by an editor before it is public.",
  alternates: { canonical: "/employers" },
  openGraph: openGraphFor("/employers", { title: "For employers" }),
};

export default function EmployersPage() {
  return (
    <ProsePage
      title="For employers"
      intro="Reach people looking for work in Zimbabwe. Every organisation is verified and every listing is reviewed."
    >
      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/employers/register">Create an employer account</ButtonLink>
        <ButtonLink href="/employer" variant="secondary">
          Go to your dashboard
        </ButtonLink>
      </div>
      <Section title="How it works">
        <Bullets
          items={[
            <>
              <strong>Create an account</strong> with your work e-mail address and confirm it.
            </>,
            <>
              <strong>Claim your organisation.</strong> You say who you are and how we can confirm it. An
              editor checks by hand; we record how the organisation was verified.
            </>,
            <>
              <strong>Post and manage listings.</strong> Jobs, internships and graduate programmes. Save
              drafts, submit when ready, and change a published listing by starting an amendment.
            </>,
            <>
              <strong>An editor reviews each listing.</strong> It is published only after a different person
              approves it. You see the reasons if it is sent back.
            </>,
            <>
              <strong>See how it is doing.</strong> Your dashboard shows views, clicks on the apply link and
              how many people saved the listing.
            </>,
          ]}
        />
      </Section>
      <Section title="What we do not do">
        <Bullets
          items={[
            "We never receive or track applications. Applicants go to your website, e-mail address or instructions.",
            "We do not accept payment from applicants or let listings ask applicants to pay.",
            "A verified organisation does not make a listing verified. Listing labels stay separate and are set by editors.",
            "We cannot promise how quickly an editor will respond.",
          ]}
        />
      </Section>
      <Section title="Questions">
        <p>
          See the{" "}
          <Link href="/contact" className="text-accent underline">
            contact page
          </Link>{" "}
          and the{" "}
          <Link href="/privacy" className="text-accent underline">
            privacy notice
          </Link>{" "}
          (a draft awaiting owner and legal review).
        </p>
      </Section>
    </ProsePage>
  );
}
