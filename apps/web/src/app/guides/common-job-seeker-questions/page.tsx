import type { Metadata } from "next";
import Link from "next/link";
import { Bullets, Section } from "@/components/content/prose";
import { GuidePage } from "@/components/content/guide-page";
import { socialFor } from "@/lib/brand";
import { guideAt } from "@/lib/guides";

const PATH = "/guides/common-job-seeker-questions" as const;
const guide = guideAt(PATH);

export const metadata: Metadata = {
  title: guide.title,
  description: guide.description,
  alternates: { canonical: PATH },
  ...socialFor(PATH, { title: guide.title, description: guide.description }),
};

const a = "text-accent underline";

/**
 * Plain question-and-answer guide (AEO, ADR-0027). Each answer is two or three sentences that stand alone, comes straight
 * after its question as a heading, and describes only what UPNEXT Careers actually does. No FAQPage markup: Google shows
 * FAQ rich results for a few authoritative sites only, and the visible text is what assistants and people read.
 * DRAFT wording until the owner approves it (D-51).
 */
export default function CommonQuestionsGuide() {
  return (
    <GuidePage
      path={PATH}
      intro="Short answers to questions job seekers ask most. Each answer describes how UPNEXT Careers works today; the longer guides go into detail."
    >
      <Section title="What jobs are available in Harare?">
        <p>
          The open listings for the city are on{" "}
          <Link href="/locations/harare" className={a}>
            Jobs and opportunities in Harare
          </Link>
          . Every listing there is published and still open, and each one names its source. To narrow further,
          use the keyword search and the type and work-mode filters on the{" "}
          <Link href="/opportunities?location=harare" className={a}>
            full list for Harare
          </Link>
          . Other cities with enough open listings are linked from the Opportunities page.
        </p>
      </Section>
      <Section title="How do I apply for jobs in Zimbabwe?">
        <p>
          UPNEXT Careers does not receive applications. Open the listing and read its{" "}
          <strong>How to apply</strong> section: the issuer gives either a web address to apply on, an e-mail
          address to write to, or written instructions. Follow that channel exactly, and never pay to apply.
          The{" "}
          <Link href="/guides/how-to-find-jobs-in-zimbabwe" className={a}>
            guide to finding jobs
          </Link>{" "}
          walks through a listing step by step.
        </p>
      </Section>
      <Section title="Where can I find graduate trainee opportunities?">
        <p>
          Structured entry-level programmes are in{" "}
          <Link href="/opportunities?category=graduate-programmes" className={a}>
            Graduate programmes
          </Link>
          , and attachments, internships and apprenticeships are in{" "}
          <Link href="/opportunities?category=internships" className={a}>
            Internships
          </Link>
          . Each listing states the issuer&apos;s own requirements. A category with no open listing says so
          rather than showing something unrelated.
        </p>
      </Section>
      <Section title="How can I identify fake job advertisements?">
        <p>The most common warning signs are:</p>
        <Bullets
          items={[
            "any request for money to apply, interview, start work or train;",
            "a request for bank details, PINs or one-time codes before you have a confirmed job;",
            "contact details that differ from the organisation's own website;",
            "pressure to act today, or pay far above what the role normally offers.",
          ]}
        />
        <p>
          Check the source on the issuer&apos;s own website, typed in by you. The full checklist is in{" "}
          <Link href="/guides/apply-safely-and-avoid-scams" className={a}>
            how to apply safely and avoid recruitment scams
          </Link>
          , and any listing can be reported with its <strong>Report this opportunity</strong> link.
        </p>
      </Section>
      <Section title="What qualifications are required for a vacancy?">
        <p>
          The listing shows the qualifications and experience the issuer stated, under{" "}
          <strong>Qualifications &amp; experience</strong> (or <strong>Requirements</strong>). UPNEXT does not
          add requirements the issuer did not give. If a listing is silent on something you need to know, ask
          the issuer through the channel in <strong>How to apply</strong>.
        </p>
      </Section>
      <Section title="When does this job close?">
        <p>
          The closing date is shown on the listing. If the issuer did not state one, the listing says{" "}
          <strong>Deadline not stated</strong>; UPNEXT never guesses a date. Once a deadline has passed the
          listing is marked <strong>Closed</strong>, the apply actions are removed and it leaves the search
          results. A listing the issuer withdrew is marked as withdrawn.
        </p>
      </Section>
      <Section title="What does Verified mean on a listing?">
        <p>
          It means UPNEXT staff have checked the listing and marked it as verified. A listing without the
          label was still reviewed by a second person before it went public, but it has not been marked
          verified. Neither is an endorsement of the pay or of the outcome of an application.{" "}
          <Link href="/guides/how-listings-are-verified" className={a}>
            How listings are checked
          </Link>{" "}
          explains the rest.
        </p>
      </Section>
    </GuidePage>
  );
}
