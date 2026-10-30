import type { Metadata } from "next";
import Link from "next/link";
import { Bullets, Section } from "@/components/content/prose";
import { GuidePage } from "@/components/content/guide-page";
import { socialFor } from "@/lib/brand";
import { guideAt } from "@/lib/guides";

const PATH = "/guides/apply-safely-and-avoid-scams" as const;
const guide = guideAt(PATH);

export const metadata: Metadata = {
  title: guide.title,
  description: guide.description,
  alternates: { canonical: PATH },
  ...socialFor(PATH, { title: guide.title, description: guide.description }),
};

const a = "text-accent underline";

export default function ApplySafelyGuide() {
  return (
    <GuidePage
      path={PATH}
      intro="Fake vacancies exist everywhere, online and offline. A few checks take a few minutes and protect your money and your personal details."
    >
      <Section title="Warning signs">
        <Bullets
          items={[
            "You are asked to pay anything to apply, to be interviewed, to start work or for training, a uniform, a visa or a “processing” fee.",
            "You are asked for banking details, card numbers, PINs or one-time codes before you have a confirmed job.",
            "The contact is a personal e-mail address or a messaging account, but the organisation's own website shows different contact details.",
            "The message pressures you to act today, or promises a pay far above what the role normally offers.",
            "The role, the employer or the location is vague, and the organisation cannot be found on its own website.",
            "The details differ from what the organisation itself publishes.",
          ]}
        />
      </Section>
      <Section title="Checks to make before you apply">
        <Bullets
          items={[
            "Look at the source named on the listing, and the verification label. A listing that is not verified still names its source, and you can check that source yourself.",
            "Open the organisation's own website by typing its address yourself, not by following a link in a message, and look for the same vacancy there.",
            "Compare the contact details and the way to apply with the ones on the organisation's own website.",
            "Apply only through the channel the issuer states. UPNEXT does not receive applications.",
            "Send only what the application needs. Keep copies of what you send and of the replies.",
          ]}
        />
      </Section>
      <Section title="If something looks wrong">
        <p>
          Every listing has a <strong>Report this opportunity</strong> link. A report is read by staff; it
          does not remove a listing by itself. You can also write to us on the{" "}
          <Link href="/contact" className={a}>
            contact page
          </Link>
          .
        </p>
        <p>
          If you have already paid or shared bank or identity details, tell your bank or mobile-money provider
          straight away and consider reporting it to the police.
        </p>
      </Section>
      <Section title="What UPNEXT does about it">
        <p>
          Every listing names its source, and the label shows what was checked.{" "}
          <Link href="/guides/how-listings-are-verified" className={a}>
            How listings are checked
          </Link>{" "}
          explains the review and what a label does not mean.
        </p>
      </Section>
    </GuidePage>
  );
}
