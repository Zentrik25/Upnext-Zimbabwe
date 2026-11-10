import type { Metadata } from "next";
import { GuideCard } from "@/components/public/cards";
import { Container } from "@/components/layout";
import { JsonLd } from "@/components/seo/json-ld";
import { socialFor } from "@/lib/brand";
import { GUIDES } from "@/lib/guides";
import { absolute } from "@/lib/site";
import { breadcrumbFor } from "@/lib/structured-data";

const TITLE = "Career guides for Zimbabwe";
const DESCRIPTION =
  "Practical guides on finding jobs, applying safely, preparing a CV, graduate programmes and internships in Zimbabwe, written by UPNEXT Careers.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/guides" },
  ...socialFor("/guides", { title: TITLE, description: DESCRIPTION }),
};

export default function GuidesIndex() {
  return (
    <Container className="py-10 max-sm:py-6">
      <JsonLd
        data={breadcrumbFor([
          { name: "UPNEXT Careers", url: absolute("/") },
          { name: "Career guides", url: absolute("/guides") },
        ])}
      />
      <h1 className="m-0 text-display">{TITLE}</h1>
      <p className="mt-3 max-w-[62ch] text-lead text-muted">{DESCRIPTION}</p>
      <ul className="m-0 mt-8 grid list-none grid-cols-2 gap-4 p-0 max-sm:grid-cols-1">
        {GUIDES.map((g) => (
          <li key={g.path}>
            <GuideCard guide={g} />
          </li>
        ))}
      </ul>
    </Container>
  );
}
