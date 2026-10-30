import type { Metadata } from "next";
import Link from "next/link";
import { Bullets, Section } from "@/components/content/prose";
import { GuidePage } from "@/components/content/guide-page";
import { socialFor } from "@/lib/brand";
import { guideAt } from "@/lib/guides";
import { VERIFICATION } from "@/lib/format";

const PATH = "/guides/how-listings-are-verified" as const;
const guide = guideAt(PATH);

export const metadata: Metadata = {
  title: guide.title,
  description: guide.description,
  alternates: { canonical: PATH },
  ...socialFor(PATH, { title: guide.title, description: guide.description }),
};

const a = "text-accent underline";

export default function VerificationGuide() {
  return (
    <GuidePage
      path={PATH}
      intro="UPNEXT Careers lists opportunities published by other organisations. It says plainly where each one came from and what has, and has not, been checked."
    >
      <Section title="Where listings come from">
        <p>
          A listing cannot be published without at least one source: the issuer&apos;s own website or notice,
          a newspaper, a gazette, a message from the issuer, or similar. The listing page shows the source,
          the date it was looked at and, where there is one, a link to it.
        </p>
      </Section>
      <Section title="Review before a listing is public">
        <Bullets
          items={[
            "Nobody approves their own work: a second person reviews the exact version that goes live.",
            "A material change to a listing after approval needs a new review before it is public.",
            "Organisations that post directly are verified before their listings can be published, and every listing is reviewed by an editor.",
            "Every step is recorded.",
          ]}
        />
      </Section>
      <Section title="What the verification labels mean">
        <p>
          Publishing a listing does not mean it has been verified. The label says what was actually checked.
        </p>
        <Bullets
          items={(["not_verified", "source_checked", "issuer_verified"] as const).map((level) => (
            <span key={level}>
              <strong>{VERIFICATION[level].label}.</strong> {VERIFICATION[level].explanation}
            </span>
          ))}
        />
        <p>A label is not an endorsement of the issuer, the pay or the outcome of an application.</p>
      </Section>
      <Section title="Closed and withdrawn listings">
        <p>
          A listing whose deadline has passed is marked as closed, and one the issuer has withdrawn is marked
          as withdrawn. Both leave the search results and the sitemap. The page stays available so that shared
          links keep working.
        </p>
      </Section>
      <Section title="Report a problem or ask for a correction">
        <p>
          Every listing has a <strong>Report this opportunity</strong> link for a suspected fake, a request
          for payment, wrong application details or a listing that has closed. A report is read by staff; it
          does not remove a listing by itself. To ask for a correction or removal of a listing or of an
          organisation&apos;s details, use the{" "}
          <Link href="/contact" className={a}>
            contact page
          </Link>
          . Before you apply to anything, read{" "}
          <Link href="/guides/apply-safely-and-avoid-scams" className={a}>
            how to apply safely and avoid scams
          </Link>
          .
        </p>
      </Section>
      <Section title="More about UPNEXT">
        <p>
          <Link href="/about" className={a}>
            About UPNEXT Careers
          </Link>{" "}
          describes the service, and the{" "}
          <Link href="/privacy" className={a}>
            privacy
          </Link>{" "}
          and{" "}
          <Link href="/terms" className={a}>
            terms
          </Link>{" "}
          pages describe how your data and the service are handled.
        </p>
      </Section>
    </GuidePage>
  );
}
