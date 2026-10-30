import type { Metadata } from "next";
import { socialFor } from "@/lib/brand";
import Link from "next/link";
import { Bullets, ProsePage, Section } from "@/components/content/prose";
import { VERIFICATION } from "@/lib/format";

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
    <ProsePage
      title="About UPNEXT Careers"
      intro="UPNEXT Careers helps people in Zimbabwe find jobs, internships, graduate programmes, scholarships, tenders and grants in one place."
    >
      <Section title="What UPNEXT does">
        <p>
          We collect opportunities published by employers, institutions and funders, check where each one came
          from, and present it with its source. You can browse and search without an account. An account lets
          you save listings and come back to them.
        </p>
        <p>
          <Link href="/opportunities" className="text-accent underline">
            Browse opportunities
          </Link>
        </p>
      </Section>
      <Section title="Where listings come from">
        <p>
          Every listing names at least one source: the issuer&apos;s own website or notice, a newspaper, a
          gazette, a message from the issuer, or similar. The page shows the source, the date we looked at it
          and, where there is one, a link to it.
        </p>
      </Section>
      <Section title="What the labels mean">
        <p>
          Publishing a listing does not mean we have verified it. The label says what we actually checked.
        </p>
        <Bullets
          items={(["not_verified", "source_checked", "issuer_verified"] as const).map((level) => (
            <span key={level}>
              <strong>{VERIFICATION[level].label}.</strong> {VERIFICATION[level].explanation}
            </span>
          ))}
        />
      </Section>
      <Section title="How you apply">
        <p>
          UPNEXT does not receive applications. Each listing tells you where to apply: the issuer&apos;s
          website, an e-mail address or written instructions. Before you apply, check the details on the
          issuer&apos;s own channel, and be careful with any request that asks you to pay. Our guide explains{" "}
          <Link href="/guides/apply-safely-and-avoid-scams" className="text-accent underline">
            how to apply safely and avoid scams
          </Link>
          .
        </p>
      </Section>
      <Section title="Corrections">
        <p>
          If a listing is wrong or has closed, tell us on the{" "}
          <Link href="/contact" className="text-accent underline">
            contact page
          </Link>
          . Listings that are withdrawn by their issuer or that pass their deadline are marked as closed and
          leave the search results. The full process is described in{" "}
          <Link href="/guides/how-listings-are-verified" className="text-accent underline">
            how listings are checked and verified
          </Link>
          .
        </p>
      </Section>
    </ProsePage>
  );
}
