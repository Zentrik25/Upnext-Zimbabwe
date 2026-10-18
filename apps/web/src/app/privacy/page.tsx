import type { Metadata } from "next";
import { openGraphFor } from "@/lib/brand";
import Link from "next/link";
import { Bullets, ProsePage, Section } from "@/components/content/prose";

export const metadata: Metadata = {
  title: "Privacy notice (draft)",
  description: "Draft privacy notice for NextJob Zimbabwe, awaiting owner and legal review.",
  alternates: { canonical: "/privacy" },
  openGraph: openGraphFor("/privacy"),
  // A draft is not published to search engines until the owner has approved it.
  robots: { index: false, follow: true },
};

export default function PrivacyPage() {
  return (
    <ProsePage
      draft
      title="Privacy notice"
      intro="What NextJob collects, why, how long it is kept and what you can do about it."
    >
      <Section title="Who is responsible">
        <p>
          [Name, legal form and address of the operator of NextJob: to be provided by the owner.] Contact for
          privacy questions: see the{" "}
          <Link href="/contact" className="text-accent underline">
            contact page
          </Link>
          .
        </p>
      </Section>
      <Section title="If you only browse">
        <p>
          You do not need an account to search or read listings. We set no advertising, analytics or tracking
          cookies and use no analytics service. When you open a listing, or follow its apply link, we add one
          to a daily count for that listing (shown to the employer who posted it); the count holds no cookie,
          identifier, address or browser details, and daily counts are deleted after about twelve months
          [provisional period, to be confirmed by the owner and the lawyer]. Our servers keep technical logs
          of requests (time, address requested, result, a request number) to run and protect the service.
          [Retention period of web-server and network logs, including network addresses: to be confirmed.]
        </p>
      </Section>
      <Section title="If you create an account">
        <Bullets
          items={[
            "Your e-mail address and the name you give us.",
            "A password hash. We never store your password itself.",
            "The listings you save.",
            "Sign-in records: when each session started and was last active, the browser and system family (for example “Chrome on Windows”) and a shortened network prefix, not your full address.",
            "Security records: sign-ins, failed sign-ins (with a one-way hash of the address and network), password changes, and account requests such as deletion.",
            "The e-mails we send you (confirmation, password reset, notices) and whether they were delivered.",
          ]}
        />
      </Section>
      <Section title="Why we use it">
        <Bullets
          items={[
            "To create and secure your account and let you save listings.",
            "To send the messages the service needs (confirming your address, resetting a password, security notices). We send no marketing.",
            "To protect the service and its users from abuse and to investigate problems.",
          ]}
        />
        <p>
          [Legal basis for each purpose, under the law that applies in Zimbabwe: to be completed after legal
          review.]
        </p>
      </Section>
      <Section title="Cookies">
        <p>We use only the cookies the service needs to work:</p>
        <Bullets
          items={[
            "A session cookie that keeps you signed in (not readable by scripts on the page). It ends after 7 days without use or 30 days in all.",
            "A security cookie that protects forms against forgery.",
          ]}
        />
        <p>There is nothing to accept or decline because nothing else is set.</p>
      </Section>
      <Section title="How long we keep it">
        <Bullets
          items={[
            "Sessions end after 7 days idle or 30 days in total, or when you sign out or change your password. Expired session records are removed.",
            "Confirmation and reset links work once and expire (24 hours and 60 minutes). Used and expired ones are removed after 7 days.",
            "The e-mail address on a sent message is removed from our outbox 30 days after sending.",
            "Saved listings and account details are kept until you ask us to delete your account.",
            "Security records keep only an opaque account number and one-way hashes. [How long they are kept: to be decided.]",
            "[Backups: how long deleted data remains in backups: to be confirmed.]",
          ]}
        />
      </Section>
      <Section title="Deleting your account">
        <p>
          You can ask us to delete your account from the account page. Your request waits 14 days so that you
          can change your mind, and you can cancel at any time before the end of that period. After that, your
          name and e-mail address are replaced, your saved listings, sessions and unused links are deleted,
          and you cannot sign in again. We send a confirmation. Accounts that also hold staff access must have
          that access removed by an administrator first.
        </p>
      </Section>
      <Section title="Changing your e-mail address">
        <p>
          When this is available you can ask to move your account to a new address from the account page. We
          ask for your password, send a link to the new address and tell the old address about the request.
          Nothing changes until the link is used, and once it is we tell the old address again. We keep the
          new address in the link record only until the link is used or expires.
        </p>
      </Section>
      <Section title="Backups">
        <p>
          We keep encrypted backups of the database so the service can be restored after a failure. A backup
          holds the personal data described above as it was on the day it was made, and is removed when its
          retention period ends. If a backup is ever restored, accounts that had already been deleted are
          deleted again. [Backup retention period and storage location: to be confirmed by the owner.]
        </p>
      </Section>
      <Section title="Sharing">
        <p>
          We do not sell your personal data. We use service providers to run NextJob: one to deliver e-mail,
          one to host the service and one to store encrypted backups. They receive only what they need to do
          that. [Names, locations and the terms they work under: to be added here when they are chosen. No
          e-mail provider has been chosen yet.] Listings we show come from public sources and contain no
          information about you.
        </p>
      </Section>
      <Section title="Your rights">
        <p>
          You can correct your name on the account page and delete your account as described above. [Access to
          a copy of your data, objection and complaint routes, and the supervisory authority: to be completed
          after legal review. A data export is not available yet.]
        </p>
      </Section>
      <Section title="Children, transfers and changes">
        <p>
          [Minimum age, transfers of data outside Zimbabwe, and how changes to this notice are announced: to
          be completed.]
        </p>
      </Section>
    </ProsePage>
  );
}
