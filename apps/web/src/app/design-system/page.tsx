import type { Metadata } from "next";
import { Container } from "@/components/layout";
import {
  Button,
  Callout,
  Checkbox,
  EmptyState,
  Field,
  ListingRow,
  Notice,
  Panel,
  SaveButton,
  SearchGroup,
  Select,
  Tabs,
  Tag,
  TextInput,
} from "@/components/ui";
import tokens from "@/design/tokens.json";

export const metadata: Metadata = { title: "Design system", robots: { index: false, follow: false } };

const swatches = Object.entries(tokens.colors).filter(([, v]) => "dev" in v);

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-8">
      <h2 id={id} className="mb-3 text-section font-strong tracking-section">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function DesignSystemPage() {
  return (
    <Container className="pt-[22px] pb-[65px]">
      <h1 className="text-hero font-strong leading-hero tracking-hero">Design system</h1>
      <p className="mt-[7px] text-base text-muted">
        Primitives built from the approved flat reference. Listings and organisations below are fictional.
      </p>

      <Section id="tokens" title="Accessibility-corrected tokens">
        <ul className="m-0 grid list-none gap-1 p-0 text-ctl">
          {swatches.map(([name, v]) => (
            <li key={name} data-testid={`token-${name}`}>
              <code>{name}</code>: reference {v.ref} → production {"prod" in v ? v.prod : v.ref} (
              {"dev" in v ? v.dev : ""})
            </li>
          ))}
        </ul>
      </Section>

      <Section id="buttons" title="Buttons">
        <div className="flex gap-2">
          <Button data-testid="btn-primary">Create account</Button>
          <Button variant="secondary" data-testid="btn-secondary">
            Explore opportunities
          </Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section id="fields" title="Fields">
        <div className="grid max-w-[420px] gap-3">
          <Field id="ds-name" label="Full name" hint="As it should appear on your profile.">
            <TextInput id="ds-name" data-testid="field-input" autoComplete="name" />
          </Field>
          <Field id="ds-type" label="Opportunity type">
            <Select id="ds-type" data-testid="field-select" defaultValue="all">
              <option value="all">All types</option>
              <option value="internship">Internship</option>
            </Select>
          </Field>
          <Field
            id="ds-email"
            label="Email address"
            error="Enter an email address in the format name@example.org."
          >
            <TextInput id="ds-email" invalid defaultValue="not-an-email" data-testid="field-invalid" />
          </Field>
          <Checkbox id="ds-checked" label="Source checked" data-testid="checkbox" />
        </div>
      </Section>

      <Section id="search" title="Search group">
        <SearchGroup aria-label="Search opportunities" data-testid="search-group">
          <label htmlFor="ds-q" className="sr-only">
            Search opportunities
          </label>
          <SearchGroup.Input id="ds-q" placeholder="Job title, skills, organisation or keyword" />
          <label htmlFor="ds-loc" className="sr-only">
            Location
          </label>
          <SearchGroup.Select id="ds-loc" defaultValue="">
            <option value="">All locations</option>
            <option>Harare</option>
            <option>Bulawayo</option>
          </SearchGroup.Select>
          <Button size="search" type="submit">
            Find opportunities
          </Button>
        </SearchGroup>
      </Section>

      <Section id="tabs" title="Category tabs">
        <Tabs
          label="Opportunity categories"
          items={[
            { href: "#", label: "All", current: true },
            { href: "#", label: "Jobs" },
            { href: "#", label: "Internships" },
            { href: "#", label: "Scholarships" },
          ]}
        />
      </Section>

      <Section id="tags" title="Tags and save control">
        <div className="flex items-center gap-2">
          <Tag data-testid="tag-default">Harare</Tag>
          <Tag tone="good" data-testid="tag-good">
            ✓ Example source checked
          </Tag>
          <Tag tone="urgent" data-testid="tag-urgent">
            Closes in 3 days
          </Tag>
          <SaveButton title="Graduate Electrical Engineer" saved={false} data-testid="save-idle" />
          <SaveButton title="ICT Industrial Attachment" saved data-testid="save-on" />
        </div>
      </Section>

      <Section id="panels" title="Panels, notices and empty state">
        <div className="grid max-w-[560px] gap-3">
          <Notice>Interactive concept · All opportunities and organisations are fictional.</Notice>
          <Panel data-testid="panel">Filters panel</Panel>
          <Callout>Tell us what interests you to see a personalised discovery feed.</Callout>
          <EmptyState title="No opportunities match these settings.">
            Clear a filter or widen your search.
          </EmptyState>
        </div>
      </Section>

      <Section id="listing" title="Listing row">
        <div className="max-w-[700px] border-t border-line">
          <ListingRow
            organisation="Example Power Services"
            title="Graduate Electrical Engineer"
            href="#"
            facts={["Harare", "Full-time", "Jobs"]}
            tags={[{ label: "Closes 29 Oct 2026", tone: "urgent" }]}
            sourceNote="✓ Example source checked · Sample listing"
            saved={false}
          />
        </div>
      </Section>
    </Container>
  );
}
