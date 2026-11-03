import type { LegalDocument as Doc } from "@/content/legal/types";
import { Container } from "@/components/layout/container";
import { renderInline } from "@/lib/inline-markup";
import { OPERATOR } from "@/content/legal/operator";

function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Keyboard focus uses the site-wide :focus-visible outline (globals.css).
function Toc({ doc, label }: { doc: Doc; label: string }) {
  return (
    <nav aria-label={label}>
      <ol className="m-0 grid list-none gap-1 p-0 text-small">
        {doc.sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className={`inline-flex min-h-[24px] items-center text-muted underline-offset-2 hover:text-ink hover:underline`}
            >
              {section.title}
            </a>
          </li>
        ))}
        <li>
          <a
            href="#versions"
            className={`inline-flex min-h-[24px] items-center text-muted underline-offset-2 hover:text-ink hover:underline`}
          >
            Version history
          </a>
        </li>
      </ol>
    </nav>
  );
}

/** A reading page for a legal document: title, dates, contents (sticky on desktop, collapsible on mobile), anchored sections. */
export function LegalDocument({ doc }: { doc: Doc }) {
  return (
    <Container className="pt-8 pb-[65px]">
      <header className="max-w-[720px]">
        <h1 className="text-section font-strong tracking-section">{doc.title}</h1>
        <p className="mt-2 text-base text-muted">{doc.intro}</p>
        <dl
          className="mt-3 grid gap-x-4 gap-y-1 text-small text-muted sm:grid-cols-[auto_1fr]"
          data-testid="legal-meta"
        >
          <dt className="font-strong text-ink">Effective</dt>
          <dd className="m-0">
            <time dateTime={doc.effective}>{longDate(doc.effective)}</time>
          </dd>
          <dt className="font-strong text-ink">Last updated</dt>
          <dd className="m-0">
            <time dateTime={doc.updated}>{longDate(doc.updated)}</time>
          </dd>
          <dt className="font-strong text-ink">Version</dt>
          <dd className="m-0">{doc.version}</dd>
          <dt className="font-strong text-ink">Operator</dt>
          <dd className="m-0">{OPERATOR.legalName}, Zimbabwe</dd>
          <dt className="font-strong text-ink">Contact</dt>
          <dd className="m-0">
            {renderInline(OPERATOR.privacyEmail)} · {renderInline(OPERATOR.generalEmail)}
          </dd>
        </dl>
      </header>

      <details
        className="mt-4 rounded-card border border-line p-3 md:hidden print:hidden"
        data-testid="toc-mobile"
      >
        <summary className={`cursor-pointer text-base font-strong`}>On this page</summary>
        <div className="mt-2">
          <Toc doc={doc} label="Sections (mobile)" />
        </div>
      </details>

      <div className="mt-6 grid gap-8 md:grid-cols-[240px_minmax(0,720px)] md:gap-12">
        <aside className="hidden md:block print:hidden" data-testid="toc-desktop">
          <div className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto pr-2">
            <p className="mb-2 text-small font-strong uppercase text-muted">On this page</p>
            <Toc doc={doc} label="Sections" />
          </div>
        </aside>

        <article className="min-w-0">
          {doc.sections.map((section) => (
            <section
              key={section.id}
              aria-labelledby={`h-${section.id}`}
              className="mb-8 scroll-mt-6"
              id={section.id}
            >
              <h2 id={`h-${section.id}`} className="group border-b border-line pb-1 text-title font-strong">
                {section.title}{" "}
                <a
                  href={`#${section.id}`}
                  aria-label={`Link to section: ${section.title}`}
                  className={`inline-flex min-h-[24px] min-w-[24px] items-center justify-center text-muted opacity-0 hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100 print:hidden`}
                >
                  #
                </a>
              </h2>
              <div className="mt-3 grid gap-3 text-base">
                {section.blocks.map((block, index) => {
                  if (block.t === "p")
                    return (
                      <p key={index} className="m-0">
                        {renderInline(block.text)}
                      </p>
                    );
                  if (block.t === "ul")
                    return (
                      <ul key={index} className="m-0 grid list-disc gap-2 pl-5">
                        {block.items.map((item, i) => (
                          <li key={i}>{renderInline(item)}</li>
                        ))}
                      </ul>
                    );
                  if (block.t === "ol")
                    return (
                      <ol key={index} className="m-0 grid list-decimal gap-2 pl-5">
                        {block.items.map((item, i) => (
                          <li key={i}>{renderInline(item)}</li>
                        ))}
                      </ol>
                    );
                  return (
                    <table key={index} className="w-full border-collapse text-small max-md:block">
                      <caption className="sr-only">{block.caption}</caption>
                      <thead className="max-md:sr-only">
                        <tr className="border-b border-line text-left">
                          {block.head.map((h) => (
                            <th key={h} scope="col" className="py-2 pr-3 align-bottom font-strong">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="max-md:block">
                        {block.rows.map((row, r) => (
                          <tr key={r} className="border-b border-line align-top max-md:block max-md:py-2">
                            {row.map((cell, c) => (
                              <td
                                key={c}
                                data-label={block.head[c]}
                                className={`py-2 pr-3 ${c === 0 ? "font-strong" : ""} max-md:block max-md:py-1 max-md:before:block max-md:before:text-micro max-md:before:font-strong max-md:before:uppercase max-md:before:text-muted max-md:before:content-[attr(data-label)]`}
                              >
                                {renderInline(cell)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })}
              </div>
            </section>
          ))}

          <section id="versions" aria-labelledby="h-versions" className="mb-8 scroll-mt-6">
            <h2 id="h-versions" className="border-b border-line pb-1 text-title font-strong">
              Version history
            </h2>
            <ul className="m-0 mt-3 grid list-none gap-2 p-0 text-base">
              {doc.history.map((v) => (
                <li key={v.version}>
                  <strong className="font-strong">Version {v.version}</strong>, effective{" "}
                  <time dateTime={v.effective}>{longDate(v.effective)}</time>: {v.summary}
                </li>
              ))}
            </ul>
          </section>
        </article>
      </div>
    </Container>
  );
}
