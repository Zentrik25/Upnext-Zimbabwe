import type { Metadata } from "next";
import Link from "next/link";
import { Bullets, Section } from "@/components/content/prose";
import { GuidePage } from "@/components/content/guide-page";
import { socialFor } from "@/lib/brand";
import { guideAt } from "@/lib/guides";

const PATH = "/guides/finding-engineering-internships-and-attachments" as const;
const guide = guideAt(PATH);

export const metadata: Metadata = {
  title: guide.title,
  description: guide.description,
  alternates: { canonical: PATH },
  ...socialFor(PATH, { title: guide.title, description: guide.description }),
};

const a = "text-accent underline";

export default function EngineeringInternshipsGuide() {
  return (
    <GuidePage
      path={PATH}
      intro="Engineering placements are advertised in several places, and many are never advertised at all. Searching listings and approaching employers directly work best together."
    >
      <Section title="Internships and attachments">
        <p>
          An <strong>attachment</strong> (industrial attachment) is usually a placement that a college or
          university course requires, arranged for a set period while you are still studying. An{" "}
          <strong>internship</strong> may be for students or recent graduates and may or may not be part of a
          course. Each listing says who may apply; check whether it needs a letter from your institution.
        </p>
      </Section>
      <Section title="Search UPNEXT Careers">
        <Bullets
          items={[
            <>
              Browse{" "}
              <Link href="/opportunities?category=internships" className={a}>
                Internships &amp; Attachments
              </Link>{" "}
              and search for your discipline, for example “civil”, “electrical”, “mechanical” or “mining”.
            </>,
            <>
              <Link href="/jobs/engineering" className={a}>
                Engineering jobs
              </Link>{" "}
              collects open engineering listings of every kind, including graduate posts.
            </>,
            <>
              <Link href="/opportunities?category=graduate-programmes" className={a}>
                Graduate Trainee Programmes
              </Link>{" "}
              often include engineering streams for people who have finished their studies.
            </>,
            "Save the listings you want and note each closing date.",
          ]}
        />
      </Section>
      <Section title="Other places to look">
        <Bullets
          items={[
            "Your institution's attachment or careers office, which often keeps lists of employers that have taken students before.",
            "The careers pages of engineering firms, utilities, manufacturers, mines and contractors in your field.",
            "Lecturers, past students and professional bodies in your discipline, who often hear of placements first.",
          ]}
        />
      </Section>
      <Section title="Approaching an employer directly">
        <p>
          A short, specific letter works better than a general one: say which course and year you are in, the
          dates you are available, what kind of work you can do and what your institution requires. Attach
          your CV (see{" "}
          <Link href="/guides/how-to-prepare-a-cv" className={a}>
            how to prepare a CV
          </Link>
          ) and the institution&apos;s letter if you have one. Follow up once, politely, after a week or two.
        </p>
        <p>
          A genuine placement never requires you to pay a fee to be accepted. If you are asked for money, read{" "}
          <Link href="/guides/apply-safely-and-avoid-scams" className={a}>
            how to apply safely and avoid recruitment scams
          </Link>
          .
        </p>
      </Section>
    </GuidePage>
  );
}
