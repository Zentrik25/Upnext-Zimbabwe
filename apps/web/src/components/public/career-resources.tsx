import Link from "next/link";
import { guidesFor } from "@/lib/category-resources";

/**
 * "Career resources" under a list of opportunities (D-74): the published guides that help with this kind of
 * opportunity, as plain links in the first HTML. Nothing is generated: each entry is an existing guide's own title and
 * description.
 */
export function CareerResources({ category }: { category: string | null }) {
  const guides = guidesFor(category);
  return (
    <section
      aria-labelledby="resources-title"
      className="mt-8 border-t border-line pt-5"
      data-testid="career-resources"
    >
      <h2 id="resources-title" className="m-0 mb-3 text-title font-strong text-ink">
        Career resources
      </h2>
      <ul className="m-0 grid list-none gap-3 p-0">
        {guides.map((g) => (
          <li key={g.path}>
            <Link href={g.path} className="text-ctl font-strong text-accent underline">
              {g.title}
            </Link>
            <p className="m-0 mt-0.5 text-small text-muted">{g.description}</p>
          </li>
        ))}
      </ul>
      <p className="m-0 mt-3 text-small">
        <Link href="/guides" className="text-accent underline">
          All career guides
        </Link>
      </p>
    </section>
  );
}
