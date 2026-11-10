import type { Metadata } from "next";
import Link from "next/link";
import { Bullets, Section } from "@/components/content/prose";
import { GuidePage } from "@/components/content/guide-page";
import { socialFor } from "@/lib/brand";
import { guideAt } from "@/lib/guides";

const PATH = "/guides/how-to-prepare-a-cv" as const;
const guide = guideAt(PATH);

export const metadata: Metadata = {
  title: guide.title,
  description: guide.description,
  alternates: { canonical: PATH },
  ...socialFor(PATH, { title: guide.title, description: guide.description }),
};

const a = "text-accent underline";

export default function CvGuide() {
  return (
    <GuidePage
      path={PATH}
      intro="A CV has one job: to show the person reading it, quickly, that you meet what the listing asks for. Clear and accurate beats long and decorated."
    >
      <Section title="A structure that works">
        <Bullets
          items={[
            "Your name and contact details: a phone number and an e-mail address you check. A photograph, date of birth or identity number are not needed unless the listing asks for them.",
            "A short profile of two or three lines saying what you do and what you are looking for.",
            "Work experience, newest first: employer, job title, dates and what you achieved, not only your duties.",
            "Education and qualifications, newest first, with the institution, the qualification and the year.",
            "Skills that the listing asks for, such as software, licences, languages or professional registrations.",
            "Referees, or a line saying they are available on request, as the listing prefers.",
          ]}
        />
      </Section>
      <Section title="Match the CV to the listing">
        <p>
          Read the listing&apos;s responsibilities and requirements and make sure each one you meet is visible
          in your CV, in the employer&apos;s own words where they are accurate for you. Put the most relevant
          experience first. Leave out what does not help this application.
        </p>
      </Section>
      <Section title="Be accurate">
        <Bullets
          items={[
            "State qualifications exactly as they appear on the certificate, including the class or grade.",
            "Give real dates. Explain a gap briefly if it would otherwise raise a question.",
            "Ask referees before you name them, and tell them which post you applied for.",
            "Never claim a qualification, a registration or an employer you cannot prove. Employers may check, and a false claim can end an application or a job.",
          ]}
        />
      </Section>
      <Section title="Format and sending">
        <Bullets
          items={[
            "Two pages are enough for most people; a recent graduate often needs one.",
            "Use a plain layout with clear headings, one readable font and no tables or images that may not survive a conversion.",
            "Save it as a PDF unless the listing asks for another format, and name the file with your name and the post, for example “Tendai-Moyo-CV-Accountant.pdf”.",
            "Send it exactly the way the listing says: the e-mail address, the form or the website it names, with the reference number in the subject if one is given.",
          ]}
        />
        <p>
          UPNEXT Careers does not receive CVs or applications. Every listing explains how to apply to the
          issuer directly; see{" "}
          <Link href="/guides/how-to-find-jobs-in-zimbabwe" className={a}>
            how to find jobs in Zimbabwe
          </Link>{" "}
          for how to read a listing.
        </p>
      </Section>
    </GuidePage>
  );
}
