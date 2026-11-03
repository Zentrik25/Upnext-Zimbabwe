import { safeJson } from "@/lib/structured-data";

/**
 * The one place the app uses `dangerouslySetInnerHTML`: a JSON-LD data block. The input is `JSON.stringify`
 * output with `<`, `>` and `&` escaped (`safeJson`), so it cannot close the element or inject markup, and it is
 * a non-executable script type that the page's CSP does not treat as code. Never pass anything else here.
 */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJson(data) }} />;
}
