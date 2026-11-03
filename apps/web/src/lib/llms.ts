import "server-only";
import { BRAND } from "./brand";
import { CATEGORY_SEO } from "./category-seo";
import { GUIDES } from "./guides";
import { absolute } from "./site";

/**
 * /llms.txt: a plain-text, human-readable summary of the site for assistants that choose to read it. It is an
 * experimental, unofficial convention: no search engine or assistant is known to require it, and it does not
 * guarantee that any page is crawled, cited or ranked. It repeats only what the site itself says elsewhere.
 */
export function llmsTxt(): string {
  const lines = [
    `# ${BRAND.name}`,
    "",
    `> ${BRAND.tagline} ${BRAND.description}`,
    "",
    `${BRAND.name} (${absolute("/")}) publishes opportunities issued by other organisations. A listing is reviewed by a second person before it is public, names its source, and carries a label that says whether it has been marked verified. ${BRAND.short} does not receive applications: each listing says how to apply with the issuer. Closed or withdrawn listings stay readable, are marked as closed or withdrawn, and are not offered to search engines.`,
    "",
    "## Browse",
    `- [All opportunities](${absolute("/opportunities")})`,
    ...Object.entries(CATEGORY_SEO).map(
      ([code, copy]) => `- [${copy.heading}](${absolute(`/opportunities?category=${code}`)})`,
    ),
    `- [Remote jobs](${absolute("/remote-jobs")})`,
    `- [Employers](${absolute("/employers")})`,
    "",
    "## Guides",
    ...GUIDES.map((g) => `- [${g.title}](${absolute(g.path)}): ${g.description}`),
    "",
    "## About",
    `- [About ${BRAND.name}](${absolute("/about")})`,
    `- [Contact](${absolute("/contact")}): ${BRAND.email}`,
    `- [Sitemap](${absolute("/sitemap.xml")})`,
    "",
  ];
  return lines.join("\n");
}
