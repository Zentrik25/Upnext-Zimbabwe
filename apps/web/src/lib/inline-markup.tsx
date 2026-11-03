import type { ReactNode } from "react";
import Link from "next/link";

const TOKEN = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|[A-Za-z0-9._+-]+@upnext\.co\.zw|https:\/\/upnext\.co\.zw)/g;
const LINK_CLASS = "text-accent underline underline-offset-2 hover:no-underline";

/** Tiny, safe inline renderer for legal text: **bold**, [label](/internal-path) and our own e-mail and web address. */
export function renderInline(text: string): ReactNode[] {
  return text.split(TOKEN).map((part, index) => {
    if (!part) return null;
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-strong">
          {renderInline(part.slice(2, -2))}
        </strong>
      );
    }
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      const href = link[2]!;
      return href.startsWith("/") ? (
        <Link key={index} href={href} className={LINK_CLASS}>
          {link[1]}
        </Link>
      ) : null;
    }
    if (/^[A-Za-z0-9._+-]+@upnext\.co\.zw$/.test(part)) {
      return (
        <a key={index} href={`mailto:${part}`} className={LINK_CLASS}>
          {part}
        </a>
      );
    }
    if (part === "https://upnext.co.zw") {
      return (
        <a key={index} href={part} className={LINK_CLASS}>
          upnext.co.zw
        </a>
      );
    }
    return part;
  });
}
