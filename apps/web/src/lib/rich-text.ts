/**
 * The visual editor's two conversions. Listings are stored in the approved Markdown subset
 * (`apps/api/catalog/markdown.py`); editors never see it. `markdownToHtml` turns stored text into the HTML the
 * editing surface shows, and `htmlToMarkdown` turns the surface back into the subset. Both are allow-lists:
 *
 *  - `markdownToHtml` escapes every piece of text first and only ever emits the tags below, the same way the API
 *    renderer does, so stored text cannot become markup in the editor.
 *  - `htmlToMarkdown` reads the DOM and keeps only paragraphs, line breaks, headings, bold, italic, underline,
 *    lists, quotes, code and https links. Scripts, styles, attributes, event handlers, images, tables and every
 *    other tag are dropped (their text is kept), whatever was pasted or dropped into the surface.
 *
 * Plain-text listings are valid Markdown, so an older listing opens and saves unchanged: its lines stay lines.
 */

const ENTITY: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
};
const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (c) => ENTITY[c]!);

const LINK = /\[([^\]\n]{1,200})\]\(([^\s)]{1,2048})\)/g;
const CODE = /`([^`\n]+)`/g;
const BOLD = /(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g;
const UNDERLINE = /\+\+(?=\S)(.+?)(?<=\S)\+\+/g;
const ITALIC = /(?<![\w*])\*(?=\S)([^*]+?)(?<=\S)\*(?![\w*])|(?<![\w_])_(?=\S)([^_]+?)(?<=\S)_(?![\w_])/g;
const HEADING = /^(#{3,5})\s+(.+)$/;
const UL = /^[-*]\s+(.+)$/;
const OL = /^\d{1,3}[.)]\s+(.+)$/;

/** Links are https only, in the editor as on the page and in the API. */
export function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * What a person typed into the link box, made into an address the API accepts, or `null`. A bare address
 * ("example.org/apply") gets https://; any other scheme (http:, mailto:, javascript:, data:) is refused.
 */
export function normaliseLinkUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw || /\s/.test(raw)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw.replace(/^\/\//, "")}`;
  if (!isHttpsUrl(withScheme)) return null;
  const url = new URL(withScheme);
  if (!url.hostname.includes(".") || url.username || url.password) return null;
  return url.toString().length > 2048 ? null : withScheme;
}

function emphasis(escaped: string): string {
  let out = escaped.replace(BOLD, (_m, _d, inner: string) => `<strong>${inner}</strong>`);
  out = out.replace(UNDERLINE, (_m, inner: string) => `<u>${inner}</u>`);
  return out.replace(
    ITALIC,
    (_m, star: string | undefined, under: string | undefined) => `<em>${star ?? under ?? ""}</em>`,
  );
}

function inlineNoLinks(text: string): string {
  let out = "";
  let pos = 0;
  for (const match of text.matchAll(CODE)) {
    out += emphasis(escapeHtml(text.slice(pos, match.index)));
    out += `<code>${escapeHtml(match[1]!)}</code>`;
    pos = match.index + match[0].length;
  }
  return out + emphasis(escapeHtml(text.slice(pos)));
}

function inline(text: string): string {
  let out = "";
  let pos = 0;
  for (const match of text.matchAll(LINK)) {
    const target = match[2]!;
    if (!isHttpsUrl(target)) continue; // not a link: shown as the text it is
    out += inlineNoLinks(text.slice(pos, match.index));
    out += `<a href="${escapeHtml(target)}">${inlineNoLinks(match[1]!)}</a>`;
    pos = match.index + match[0].length;
  }
  return out + inlineNoLinks(text.slice(pos));
}

/** Stored Markdown to the editing surface's HTML. An empty value is one empty line. */
export function markdownToHtml(source: string | null | undefined): string {
  const lines = (source ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks: string[] = [];
  let para: string[] = [];
  let items: string[] = [];
  let listTag = "";
  let quote: string[] = [];

  const flush = () => {
    if (para.length) blocks.push(`<p>${para.map(inline).join("<br>")}</p>`);
    if (items.length)
      blocks.push(`<${listTag}>${items.map((i) => `<li>${inline(i)}</li>`).join("")}</${listTag}>`);
    if (quote.length) blocks.push(`<blockquote><p>${quote.map(inline).join("<br>")}</p></blockquote>`);
    para = [];
    items = [];
    quote = [];
    listTag = "";
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = HEADING.exec(line);
    const ul = UL.exec(line);
    const ol = OL.exec(line);
    if (heading) {
      flush();
      const level = heading[1]!.length;
      blocks.push(`<h${level}>${inline(heading[2]!)}</h${level}>`);
    } else if (ul || ol) {
      const tag = ul ? "ul" : "ol";
      if (items.length && tag !== listTag) flush();
      if (para.length || quote.length) flush();
      listTag = tag;
      items.push((ul ?? ol)![1]!);
    } else if (line.startsWith(">")) {
      if (para.length || items.length) flush();
      quote.push(line.slice(1).trim());
    } else {
      if (items.length || quote.length) flush();
      para.push(line);
    }
  }
  flush();
  return blocks.length ? blocks.join("") : "<p><br></p>";
}

// ---------------------------------------------------------------------------------------------------------------

const ELEMENT = 1;
const TEXT = 3;

/** Whitespace around a mark goes outside it: the subset's emphasis cannot start or end on a space. */
function mark(inner: string, marker: string): string {
  // The renderer reads one line at a time, so a mark never runs across a line break.
  return inner
    .split("\n")
    .map((line) => {
      const parts = /^(\s*)([\s\S]*?)(\s*)$/.exec(line)!;
      return parts[2] ? `${parts[1]}${marker}${parts[2]}${marker}${parts[3]}` : line;
    })
    .join("\n");
}

function styleOf(el: HTMLElement) {
  const css = el.getAttribute("style") ?? "";
  const weight = /font-weight:\s*([^;]+)/i.exec(css)?.[1]?.trim().toLowerCase();
  return {
    bold: weight === "bold" || weight === "bolder" || (weight ? Number(weight) >= 600 : false),
    italic: /font-style:\s*italic/i.test(css),
    underline: /text-decoration[^;]*underline/i.test(css),
  };
}

function inlineOf(node: Node): string {
  if (node.nodeType === TEXT)
    return (node.textContent ?? "").replace(/[ ​\r\n]/g, (c) => (c === " " ? " " : c === "​" ? "" : " "));
  if (node.nodeType !== ELEMENT) return "";
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (tag === "br") return "\n";
  if (tag === "script" || tag === "style" || tag === "template") return "";
  const children = (): string => Array.from(el.childNodes).map(inlineOf).join("");
  switch (tag) {
    case "b":
    case "strong":
      return mark(children(), "**");
    case "i":
    case "em": {
      const inner = children();
      return mark(inner, inner.includes("_") ? "*" : "_");
    }
    case "u":
      return mark(children(), "++");
    case "code":
      return el.textContent?.trim() && !el.textContent.includes("`")
        ? `\`${el.textContent.trim()}\``
        : children();
    case "a": {
      const href = el.getAttribute("href") ?? "";
      const text = children().replace(/[[\]]/g, "").replace(/\s+/g, " ").trim();
      if (!text) return "";
      if (!isHttpsUrl(href)) return text;
      return `[${text.slice(0, 200)}](${href.replace(/\s/g, "%20").replace(/\)/g, "%29")})`;
    }
    case "span":
    case "font": {
      let out = children();
      const style = styleOf(el);
      if (style.bold) out = mark(out, "**");
      if (style.italic) out = mark(out, out.includes("_") ? "*" : "_");
      if (style.underline) out = mark(out, "++");
      return out;
    }
    default:
      return children();
  }
}

const BLOCKS = new Set([
  "p",
  "div",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "pre",
]);

function oneLine(text: string): string {
  return text
    .replace(/\s*\n\s*/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function paragraphLines(text: string): string {
  return text
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function listItems(list: HTMLElement, ordered: boolean, out: string[]): void {
  let n = 0;
  for (const child of Array.from(list.children)) {
    const tag = child.tagName.toLowerCase();
    if (tag === "ul" || tag === "ol") {
      listItems(child as HTMLElement, tag === "ol", out); // the subset has no nesting: flattened
      continue;
    }
    const own = Array.from(child.childNodes).filter(
      (c) => !(c.nodeType === ELEMENT && ["ul", "ol"].includes((c as HTMLElement).tagName.toLowerCase())),
    );
    const text = oneLine(own.map(inlineOf).join(""));
    if (text) out.push(`${ordered ? `${++n}.` : "-"} ${text}`);
    for (const nested of Array.from(child.children))
      if (["ul", "ol"].includes(nested.tagName.toLowerCase()))
        listItems(nested as HTMLElement, nested.tagName.toLowerCase() === "ol", out);
  }
}

function blocksOf(parent: Node, out: string[]): void {
  let run = ""; // loose inline content between blocks
  const endRun = () => {
    const text = paragraphLines(run);
    if (text) out.push(text);
    run = "";
  };
  for (const node of Array.from(parent.childNodes)) {
    const el = node.nodeType === ELEMENT ? (node as HTMLElement) : null;
    const tag = el?.tagName.toLowerCase() ?? "";
    if (!el || !BLOCKS.has(tag)) {
      run += inlineOf(node);
      continue;
    }
    endRun();
    if (tag === "ul" || tag === "ol") {
      const items: string[] = [];
      listItems(el, tag === "ol", items);
      if (items.length) out.push(items.join("\n"));
    } else if (/^h[1-6]$/.test(tag)) {
      const text = oneLine(inlineOf(el));
      if (text) out.push(`${"#".repeat(Math.min(5, Math.max(3, Number(tag[1]))))} ${text}`);
    } else if (tag === "blockquote") {
      const inner: string[] = [];
      blocksOf(el, inner);
      const text = oneLine(inner.join(" "));
      if (text) out.push(`> ${text}`);
    } else if (tag === "li") {
      const text = oneLine(inlineOf(el));
      if (text) out.push(`- ${text}`);
    } else if (Array.from(el.children).some((c) => BLOCKS.has(c.tagName.toLowerCase()))) {
      // A wrapper around blocks: a div, or the `<p><ul>…</ul></p>` a browser makes when a list is started in a
      // paragraph (the DOM allows what HTML does not).
      blocksOf(el, out);
    } else {
      const text = paragraphLines(inlineOf(el));
      if (text) out.push(text);
    }
  }
  endRun();
}

/** The editing surface back to the stored subset. Empty surface, empty string. */
export function htmlToMarkdown(root: Node): string {
  const out: string[] = [];
  blocksOf(root, out);
  return out.join("\n\n");
}

/** Text only, for counting and for "is there anything here". */
export function markdownToText(source: string): string {
  return source
    .replace(LINK, "$1")
    .replace(/(\*\*|__|\+\+|`)/g, "")
    .replace(/^(#{3,5}\s+|[-*]\s+|\d{1,3}[.)]\s+|>\s*)/gm, "")
    .trim();
}
