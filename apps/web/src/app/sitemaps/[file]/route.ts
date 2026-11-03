import { buildSitemaps, renderUrlset, XML_HEADERS } from "@/lib/sitemap";

export const dynamic = "force-dynamic";

/** One sitemap file (pages.xml, employers.xml, jobs-N.xml, opportunities-N.xml). Anything else is a real 404. */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const entries = (await buildSitemaps()).get(file);
  if (!entries) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain" } });
  return new Response(renderUrlset(entries), { headers: XML_HEADERS });
}
