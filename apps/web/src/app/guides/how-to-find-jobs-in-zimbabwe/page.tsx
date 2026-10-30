import type { Metadata } from "next";
import Link from "next/link";
import { Bullets, Section } from "@/components/content/prose";
import { GuidePage } from "@/components/content/guide-page";
import { socialFor } from "@/lib/brand";
import { guideAt } from "@/lib/guides";

const PATH = "/guides/how-to-find-jobs-in-zimbabwe" as const;
const guide = guideAt(PATH);

export const metadata: Metadata = {
  title: guide.title,
  description: guide.description,
  alternates: { canonical: PATH },
  ...socialFor(PATH, { title: guide.title, description: guide.description }),
};

const a = "text-accent underline";

export default function FindJobsGuide() {
  return (
    <GuidePage
      path={PATH}
      intro="UPNEXT Careers collects jobs, internships, graduate programmes, scholarships, tenders and grants in Zimbabwe. This is how to get to the ones that suit you, and what to check before you act on one."
    >
      <Section title="Start with the kind of opportunity you want">
        <p>Every listing belongs to one of six categories, and each has its own list:</p>
        <Bullets
          items={[
            <Link key="j" href="/opportunities?category=jobs" className={a}>
              Jobs
            </Link>,
            <Link key="i" href="/opportunities?category=internships" className={a}>
              Internships
            </Link>,
            <Link key="g" href="/opportunities?category=graduate-programmes" className={a}>
              Graduate programmes
            </Link>,
            <Link key="s" href="/opportunities?category=scholarships" className={a}>
              Scholarships
            </Link>,
            <Link key="t" href="/opportunities?category=tenders" className={a}>
              Tenders
            </Link>,
            <Link key="gr" href="/opportunities?category=grants" className={a}>
              Grants
            </Link>,
          ]}
        />
      </Section>
      <Section title="Search by keyword and narrow the list">
        <p>
          On the{" "}
          <Link href="/opportunities" className={a}>
            opportunities page
          </Link>{" "}
          you can search by job title, organisation or keyword. The filters narrow the list by location, type
          of work, work arrangement (on site, hybrid or remote) and deadline. You can also sort by the
          listings that close soonest, which is useful when you want to see what is still open this week.
        </p>
      </Section>
      <Section title="Read the whole listing before you decide">
        <p>Each listing page tells you:</p>
        <Bullets
          items={[
            "who the issuing organisation is and where the information came from (the source, and the date we last looked at it);",
            "the deadline, if the issuer stated one, and whether the listing is still open;",
            "a verification label that says what UPNEXT did and did not check;",
            "how to apply, which is always on the issuer's own channel.",
          ]}
        />
        <p>
          The{" "}
          <Link href="/guides/how-listings-are-verified" className={a}>
            guide to verification
          </Link>{" "}
          explains the labels in detail.
        </p>
      </Section>
      <Section title="Save opportunities to come back to">
        <p>
          You can browse without an account. If you{" "}
          <Link href="/register" className={a}>
            create an account
          </Link>
          , the save button on a listing keeps it in your saved opportunities, so you can return to it without
          searching again. Listings that close or are withdrawn stay in your saved list so you can see what
          happened to them.
        </p>
      </Section>
      <Section title="Internships and graduate programmes">
        <p>
          Internships and graduate programmes have their own lists, separate from jobs, so that entry-level
          opportunities are not buried. Check the closing date first.
        </p>
      </Section>
      <Section title="Apply on the issuer's own channel">
        <p>
          UPNEXT does not receive applications. A listing sends you to the issuer&apos;s website, an e-mail
          address or written instructions. Read{" "}
          <Link href="/guides/apply-safely-and-avoid-scams" className={a}>
            how to apply safely and avoid scams
          </Link>{" "}
          before you share personal documents or pay anyone anything.
        </p>
      </Section>
    </GuidePage>
  );
}
