import { Fragment, type ReactNode } from "react";
import { decodeEntities } from "./safe-html";

/**
 * Renders a Career Insights article body (D-78) as React elements, without `dangerouslySetInnerHTML`
 * (VALIDATION_SPEC §5: the client never injects user-derived HTML).
 *
 * The API stores bodies already sanitised by nh3 (insights/sanitize.py), but this renderer does not trust that
 * either: only the elements and attributes below are built; any other tag becomes plain text; links must be https,
 * mailto or a same-site path; pictures must be https or Media Library paths; table spans are bounded numbers. It is
 * a separate renderer from `SafeHtml` (listings), whose narrower vocabulary stays unchanged.
 */
const ELEMENTS = new Set([
  "p",
  "br",
  "h2",
  "h3",
  "strong",
  "em",
  "u",
  "ul",
  "ol",
  "li",
  "blockquote",
  "a",
  "img",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
]);
const VOID = new Set(["br", "img"]);

type Attrs = Record<string, string>;
type Token = { type: "text"; value: string } | { type: "open" | "close" | "void"; tag: string; attrs: Attrs };
type Node = { kind: "text"; value: string } | { kind: "el"; tag: string; attrs: Attrs; children: Node[] };

function attributes(raw: string): Attrs {
  const out: Attrs = {};
  for (const m of raw.matchAll(/([a-z-]+)="([^"]*)"/gi)) out[m[1]!.toLowerCase()] = decodeEntities(m[2]!);
  return out;
}

export function tokeniseArticle(html: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /<(\/?)([a-z0-9]+)((?:\s+[a-z-]+="[^"]*")*)\s*(\/?)>/gi;
  let last = 0;
  for (const match of html.matchAll(pattern)) {
    const [whole, closing, rawTag, rawAttrs] = match;
    const tag = (rawTag ?? "").toLowerCase();
    if (match.index > last) tokens.push({ type: "text", value: html.slice(last, match.index) });
    last = match.index + whole.length;
    if (!ELEMENTS.has(tag)) {
      tokens.push({ type: "text", value: whole }); // unknown tag: shown as text, never interpreted
      continue;
    }
    if (VOID.has(tag)) tokens.push({ type: "void", tag, attrs: attributes(rawAttrs ?? "") });
    else if (closing) tokens.push({ type: "close", tag, attrs: {} });
    else tokens.push({ type: "open", tag, attrs: attributes(rawAttrs ?? "") });
  }
  if (last < html.length) tokens.push({ type: "text", value: html.slice(last) });
  return tokens;
}

function tree(tokens: Token[]): Node[] {
  const root: Node[] = [];
  const stack: { tag: string; children: Node[] }[] = [{ tag: "", children: root }];
  for (const token of tokens) {
    const top = stack[stack.length - 1]!;
    if (token.type === "text") top.children.push({ kind: "text", value: decodeEntities(token.value) });
    else if (token.type === "void")
      top.children.push({ kind: "el", tag: token.tag, attrs: token.attrs, children: [] });
    else if (token.type === "open") {
      const el: Node = { kind: "el", tag: token.tag, attrs: token.attrs, children: [] };
      top.children.push(el);
      stack.push({ tag: token.tag, children: el.children });
    } else {
      const at = stack.map((f) => f.tag).lastIndexOf(token.tag);
      if (at > 0) stack.length = at;
    }
  }
  return root;
}

/** A link target the page may use: https, mailto or a same-site path (never javascript:, data: or http:). */
export function safeHref(href: string | undefined): string | null {
  if (!href) return null;
  if (/^https:\/\/[^\s]+$/i.test(href) || /^mailto:[^\s]+$/i.test(href)) return href;
  if (/^\/(?!\/)[^\s]*$/.test(href)) return href;
  return null;
}

export function safeSrc(src: string | undefined): string | null {
  if (!src) return null;
  return /^https:\/\/[^\s]+$/i.test(src) || /^\/media\/[^\s]+$/.test(src) ? src : null;
}

function span(value: string | undefined): number | undefined {
  const n = Number(value);
  return Number.isInteger(n) && n > 1 && n <= 20 ? n : undefined;
}

function render(nodes: Node[]): ReactNode[] {
  return nodes.map((node, i) => {
    if (node.kind === "text") return <Fragment key={i}>{node.value}</Fragment>;
    const children = render(node.children);
    const { tag, attrs } = node;
    switch (tag) {
      case "br":
        return <br key={i} />;
      case "img": {
        const src = safeSrc(attrs.src);
        // eslint-disable-next-line @next/next/no-img-element -- Media Library pictures are already optimised.
        return src ? <img key={i} src={src} alt={attrs.alt ?? ""} loading="lazy" decoding="async" /> : null;
      }
      case "a": {
        const href = safeHref(attrs.href);
        if (!href) return <Fragment key={i}>{children}</Fragment>;
        const external = href.startsWith("https://") || href.startsWith("mailto:");
        return (
          <a key={i} href={href} {...(external ? { rel: "noopener noreferrer", target: "_blank" } : {})}>
            {children}
          </a>
        );
      }
      case "th":
        return (
          <th
            key={i}
            colSpan={span(attrs.colspan)}
            rowSpan={span(attrs.rowspan)}
            scope={attrs.scope === "row" || attrs.scope === "col" ? attrs.scope : undefined}
          >
            {children}
          </th>
        );
      case "td":
        return (
          <td key={i} colSpan={span(attrs.colspan)} rowSpan={span(attrs.rowspan)}>
            {children}
          </td>
        );
      case "table":
        // A wide table scrolls inside its own box instead of widening the page on a phone.
        return (
          <div key={i} className="insights-table" role="region" aria-label="Table" tabIndex={0}>
            <table>{children}</table>
          </div>
        );
      default: {
        const Tag = tag as "p";
        return <Tag key={i}>{children}</Tag>;
      }
    }
  });
}

export function ArticleHtml({ html }: { html: string }): ReactNode {
  return <>{render(tree(tokeniseArticle(html)))}</>;
}
