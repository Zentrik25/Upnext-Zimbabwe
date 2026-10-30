import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout";
import { PageHeader } from "@/components/content/blocks";
import { GUIDES } from "@/lib/guides";
import { socialFor } from "@/lib/brand";

const DESCRIPTION =
  "Guides to finding opportunities, applying safely and understanding how UPNEXT Careers checks listings.";
export const metadata: Metadata = {
  title: "Guides",
  description: DESCRIPTION,
  alternates: { canonical: "/guides" },
  ...socialFor("/guides", { title: "Guides", description: DESCRIPTION }),
};

const dateLong = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

export default function GuidesIndex() {
  return (
    <>
      <PageHeader title="Guides" intro="Short, practical guides written by the UPNEXT Careers team." />
      <Container className="pt-6 pb-[65px]">
        <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-3">
          {GUIDES.map((guide) => (
            <li key={guide.path}>
              <Link
                href={guide.path}
                className="flex h-full flex-col rounded-card border border-border-panel bg-surface p-4 hover:bg-row-hover"
              >
                <span className="text-title leading-title text-ink">{guide.title}</span>
                <span className="mt-2 text-ctl text-muted">{guide.description}</span>
                <span className="mt-auto pt-3 text-small text-muted">
                  Published <time dateTime={guide.datePublished}>{dateLong(guide.datePublished)}</time>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </>
  );
}
