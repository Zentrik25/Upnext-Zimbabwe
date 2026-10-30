import Link from "next/link";
import type { ReactNode } from "react";
import { ProsePage, Section } from "@/components/content/prose";
import { JsonLd } from "@/components/seo/json-ld";
import { GUIDES, guideAt } from "@/lib/guides";
import { absolute } from "@/lib/site";
import { articleFor, breadcrumbFor } from "@/lib/structured-data";

const dateLong = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

/** One editorial guide: heading, intro, visible publication and update dates (the same dates the Article data
 *  carries), the body, and links to the other guides. */
export function GuidePage({
  path,
  intro,
  children,
}: {
  path: (typeof GUIDES)[number]["path"];
  intro: string;
  children: ReactNode;
}) {
  const guide = guideAt(path);
  const url = absolute(path);
  const others = GUIDES.filter((g) => g.path !== path);
  return (
    <>
      <JsonLd
        data={articleFor({
          headline: guide.title,
          description: guide.description,
          url,
          datePublished: guide.datePublished,
          dateModified: guide.dateModified,
        })}
      />
      <JsonLd
        data={breadcrumbFor([
          { name: "UPNEXT Careers", url: absolute("/") },
          { name: guide.title, url },
        ])}
      />
      <ProsePage title={guide.title} intro={intro}>
        <p className="text-small text-muted" data-testid="guide-dates">
          Published <time dateTime={guide.datePublished}>{dateLong(guide.datePublished)}</time>
          {guide.dateModified !== guide.datePublished ? (
            <>
              {" "}
              · Updated <time dateTime={guide.dateModified}>{dateLong(guide.dateModified)}</time>
            </>
          ) : null}
          . Written by the UPNEXT Careers team.
        </p>
        {children}
        <Section title="More guides">
          <ul className="m-0 list-disc pl-5">
            {others.map((g) => (
              <li key={g.path} className="mt-1">
                <Link href={g.path} className="text-accent underline">
                  {g.title}
                </Link>
              </li>
            ))}
            <li className="mt-1">
              <Link href="/opportunities" className="text-accent underline">
                Browse all opportunities
              </Link>
            </li>
          </ul>
        </Section>
      </ProsePage>
    </>
  );
}
