import type { Metadata } from "next";
import { openGraphFor } from "@/lib/brand";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/layout";
import { JsonLd } from "@/components/seo/json-ld";
import { ButtonLink, EmptyState, Tag } from "@/components/ui";
import { getEmployerProfile } from "@/lib/catalog";
import { absolute } from "@/lib/site";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const result = await getEmployerProfile(slug);
  if (!result.ok || result.data === null) return { title: "Employer not found", robots: { index: false } };
  const profile = result.data;
  const description = profile.tagline || `${profile.organisation.name} on NextJob Zimbabwe.`;
  return {
    title: profile.organisation.name,
    description,
    alternates: { canonical: `/employers/${profile.slug}` },
    openGraph: openGraphFor(`/employers/${profile.slug}`, { title: profile.organisation.name, description }),
  };
}

export default async function EmployerProfilePage({ params }: Props) {
  const { slug } = await params;
  const result = await getEmployerProfile(slug);
  if (!result.ok) {
    return (
      <Container className="py-10" role="alert">
        <EmptyState as="h1" title="This page is unavailable">
          {result.reason === "rate-limited"
            ? "Too many requests. Wait a minute and try again."
            : "The service could not be reached. Try again shortly."}
        </EmptyState>
      </Container>
    );
  }
  if (result.data === null) notFound();
  const p = result.data;
  const facts = [
    p.sector ? ["Sector", p.sector.name] : null,
    p.size_band ? ["Employees", p.size_band] : null,
    p.founded_year ? ["Founded", String(p.founded_year)] : null,
    p.location_text ? ["Based in", p.location_text] : null,
  ].filter((row): row is string[] => row !== null);
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name: p.organisation.name,
          url: absolute(`/employers/${p.slug}`),
          ...(p.tagline ? { description: p.tagline } : {}),
        }}
      />
      <Container className="pt-8 pb-[65px]">
        <article className="max-w-[720px]" aria-labelledby="employer-title">
          <p className="text-micro font-semi uppercase tracking-eyebrow text-eyebrow">Employer</p>
          <h1 id="employer-title" className="mt-1 text-section font-strong tracking-section">
            {p.organisation.name}
          </h1>
          {p.tagline ? <p className="mt-1 text-title text-company">{p.tagline}</p> : null}
          <p className="mt-2">
            <Tag tone="good">Verified organisation</Tag>
          </p>
          <p className="mt-3 text-small text-muted">
            This organisation was checked by NextJob editors. The text below is written by the organisation
            and was reviewed before it was published. Verification of the organisation is separate from the
            labels on its listings.
          </p>
          <div className="mt-4 whitespace-pre-line text-base">{p.about}</div>
          {facts.length > 0 ? (
            <dl className="mt-4 grid gap-1 text-base">
              {facts.map(([label, value]) => (
                <div key={label}>
                  <dt className="inline text-muted">{label}: </dt>
                  <dd className="ml-0 inline">{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {p.organisation.website_url ? (
            <p className="mt-3 text-base">
              Website:{" "}
              <a
                href={p.organisation.website_url}
                rel="noopener noreferrer nofollow"
                className="text-accent underline"
              >
                {new URL(p.organisation.website_url).hostname}
              </a>
            </p>
          ) : null}
          <p className="mt-5">
            {p.open_listings > 0 ? (
              <ButtonLink href={`/opportunities?organisation_id=${p.organisation.id}`}>
                See {p.open_listings} open {p.open_listings === 1 ? "listing" : "listings"}
              </ButtonLink>
            ) : (
              <span className="text-base text-muted">No open listings right now.</span>
            )}
          </p>
          <p className="mt-4 text-ctl">
            <Link href="/opportunities" className="text-accent underline">
              ← All opportunities
            </Link>
          </p>
        </article>
      </Container>
    </>
  );
}
