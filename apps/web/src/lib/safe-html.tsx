import { Fragment, type ReactNode } from "react";

/**
 * Renders the HTML the API produces from its Markdown subset as React elements, without
 * `dangerouslySetInnerHTML` (VALIDATION_SPEC §5: the client never injects user-derived HTML).
 *
 * The API already escapes everything and only emits the tags below, but this renderer does not trust
 * that: anything outside the allow-list becomes plain text, links must be https, and attributes other
 * than `href` are ignored.
 */
const BLOCK = new Set(["p", "h3", "h4", "h5", "ul", "ol", "li", "blockquote"]);
const INLINE = new Set(["strong", "em", "code", "a", "br"]);
const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#x27;": "'",
  "&#39;": "'",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|#x27|#39);/g, (m) => ENTITIES[m] ?? m);
}

export type Token =
  { type: "text"; value: string } | { type: "open" | "close" | "void"; tag: string; href?: string };

export function tokenise(html: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /<(\/?)([a-z0-9]+)((?:\s+[a-z-]+="[^"]*")*)\s*(\/?)>/gi;
  let last = 0;
  for (const match of html.matchAll(pattern)) {
    const [whole, closing, rawTag, attrs] = match;
    const tag = (rawTag ?? "").toLowerCase();
    if (match.index > last) tokens.push({ type: "text", value: html.slice(last, match.index) });
    last = match.index + whole.length;
    if (!BLOCK.has(tag) && !INLINE.has(tag)) {
      tokens.push({ type: "text", value: whole }); // unknown tag: shown as text, never interpreted
      continue;
    }
    if (tag === "br") tokens.push({ type: "void", tag });
    else if (closing) tokens.push({ type: "close", tag });
    else {
      const href = /href="([^"]*)"/i.exec(attrs ?? "")?.[1];
      tokens.push({ type: "open", tag, href: href === undefined ? undefined : decodeEntities(href) });
    }
  }
  if (last < html.length) tokens.push({ type: "text", value: html.slice(last) });
  return tokens;
}

const CLASSES: Record<string, string> = {
  p: "mt-[10px] text-base",
  h3: "mt-5 text-title font-strong",
  h4: "mt-4 text-base font-strong",
  h5: "mt-4 text-ctl font-strong",
  ul: "mt-[10px] list-disc pl-5 text-base",
  ol: "mt-[10px] list-decimal pl-5 text-base",
  li: "mt-1",
  blockquote: "mt-[10px] border-l-2 border-line pl-3 text-muted",
};

type Node =
  | { kind: "text"; value: string }
  | { kind: "br" }
  | { kind: "el"; tag: string; href?: string; children: Node[] };

/** Builds a tree from the token stream (pure; unbalanced input is repaired, never executed). */
export function buildTree(tokens: Token[]): Node[] {
  const root: Node[] = [];
  const stack: { tag: string; children: Node[] }[] = [{ tag: "", children: root }];
  for (const token of tokens) {
    const top = stack[stack.length - 1]!;
    if (token.type === "text") top.children.push({ kind: "text", value: decodeEntities(token.value) });
    else if (token.type === "void") top.children.push({ kind: "br" });
    else if (token.type === "open") {
      const el: Node = { kind: "el", tag: token.tag, href: token.href, children: [] };
      top.children.push(el);
      stack.push({ tag: token.tag, children: el.children });
    } else {
      const at = stack.map((frame) => frame.tag).lastIndexOf(token.tag);
      if (at > 0) stack.length = at; // close the matching element; a stray close tag is ignored
    }
  }
  return root;
}

function render(nodes: Node[]): ReactNode[] {
  return nodes.map((node, i) => {
    if (node.kind === "text") return <Fragment key={i}>{node.value}</Fragment>;
    if (node.kind === "br") return <br key={i} />;
    const children = render(node.children);
    const cls = CLASSES[node.tag];
    switch (node.tag) {
      case "p":
        return (
          <p key={i} className={cls}>
            {children}
          </p>
        );
      case "h3":
        return (
          <h3 key={i} className={cls}>
            {children}
          </h3>
        );
      case "h4":
        return (
          <h4 key={i} className={cls}>
            {children}
          </h4>
        );
      case "h5":
        return (
          <h5 key={i} className={cls}>
            {children}
          </h5>
        );
      case "ul":
        return (
          <ul key={i} className={cls}>
            {children}
          </ul>
        );
      case "ol":
        return (
          <ol key={i} className={cls}>
            {children}
          </ol>
        );
      case "li":
        return (
          <li key={i} className={cls}>
            {children}
          </li>
        );
      case "blockquote":
        return (
          <blockquote key={i} className={cls}>
            {children}
          </blockquote>
        );
      case "strong":
        return <strong key={i}>{children}</strong>;
      case "em":
        return <em key={i}>{children}</em>;
      case "code":
        return <code key={i}>{children}</code>;
      case "a":
        return node.href !== undefined && /^https:\/\//i.test(node.href) ? (
          <a
            key={i}
            href={node.href}
            rel="noopener noreferrer nofollow ugc"
            target="_blank"
            className="text-accent underline"
          >
            {children}
          </a>
        ) : (
          <Fragment key={i}>{children}</Fragment>
        );
      default:
        return <Fragment key={i}>{children}</Fragment>;
    }
  });
}

export function SafeHtml({ html }: { html: string }): ReactNode {
  return <>{render(buildTree(tokenise(html)))}</>;
}
