import { buildIndex, renderIndex, XML_HEADERS } from "@/lib/sitemap";

export const dynamic = "force-dynamic";

/** The sitemap index named in robots.txt (ADR-0027); the lists themselves are under /sitemaps/. */
export async function GET() {
  return new Response(renderIndex(await buildIndex()), { headers: XML_HEADERS });
}
