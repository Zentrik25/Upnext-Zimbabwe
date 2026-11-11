import type { Metadata } from "next";
import Link from "next/link";
import { Bullets, Section } from "@/components/content/prose";
import { GuidePage } from "@/components/content/guide-page";
import { socialFor } from "@/lib/brand";
import { guideAt } from "@/lib/guides";

const PATH = "/guides/how-to-apply-for-graduate-trainee-programmes" as const;
const guide = guideAt(PATH);

export const metadata: Metadata = {
  title: guide.title,
  description: guide.description,
  alternates: { canonical: PATH },
  ...socialFor(PATH, { title: guide.title, description: guide.description }),
};

const a = "text-accent underline";

export default function GraduateProgrammesGuide() {
  return (
    <GuidePage
      path={PATH}
      intro="Graduate trainee programmes are structured entry routes for recent graduates. Each employer sets its own rules, so the listing itself is always the authority: read it twice before you apply."
    >
      <Section title="What a graduate trainee programme is">
        <p>
          A graduate trainee programme is a fixed-term post for people who have recently finished a degree or
          diploma. It usually combines work with training, rotations between departments or a mentor. Some
          programmes lead to a permanent post; many do not promise one. The listing, or the employer&apos;s
          own programme page, says which applies.
        </p>
      </Section>
      <Section title="Read the eligibility rules first">
        <Bullets
          items={[
            "The qualification: the field of study and the minimum level or class of degree the employer asks for.",
            "The graduation window: many programmes accept only people who graduated within a stated number of years, or who will graduate by a stated date.",
            "Age, citizenship or residence limits, where the employer states them.",
            "Where the work is: some programmes place trainees in more than one town.",
            "The closing date and time zone. A late application is usually not considered.",
          ]}
        />
        <p>
          If you do not meet a stated requirement, do not apply in the hope that it will be overlooked; look
          for a programme whose rules you meet.
        </p>
      </Section>
      <Section title="Prepare a complete application">
        <Bullets
          items={[
            "A CV written for this programme, not a general one. Our guide on how to prepare a CV explains the structure.",
            "A short cover letter or motivation, if the listing asks for one, that answers the question the employer asked.",
            "Copies of certificates and transcripts in the form the listing asks for (for example certified copies or scans). Send only what is asked.",
            "Referees who have agreed to be contacted and who know your work or studies.",
            "The reference number of the programme, if the listing gives one, in the subject line or the form.",
          ]}
        />
      </Section>
      <Section title="Assessments and interviews">
        <p>
          Programmes with many applicants often use online tests, assessment days or panel interviews. The
          employer explains its own steps. A genuine programme does not charge you to apply, to sit a test or
          to be interviewed; read{" "}
          <Link href="/guides/apply-safely-and-avoid-scams" className={a}>
            how to apply safely and avoid recruitment scams
          </Link>{" "}
          if anything asks for money.
        </p>
      </Section>
      <Section title="Find programmes on UPNEXT Careers">
        <p>
          Open programmes are listed under{" "}
          <Link href="/opportunities?category=graduate-programmes" className={a}>
            Graduate Trainee Programmes
          </Link>
          . Each listing shows its closing date, its verification label and how to apply on the
          employer&apos;s own channel. Save a programme to come back to it before the deadline.
        </p>
      </Section>
    </GuidePage>
  );
}
