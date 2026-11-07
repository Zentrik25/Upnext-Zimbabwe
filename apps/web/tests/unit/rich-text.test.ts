import { describe, expect, it } from "vitest";
import { htmlToMarkdown, markdownToHtml, normaliseLinkUrl } from "@/lib/rich-text";

function surface(html: string): HTMLElement {
  const el = document.createElement("div");
  el.append(...Array.from(new DOMParser().parseFromString(html, "text/html").body.childNodes));
  return el;
}
const toMd = (html: string) => htmlToMarkdown(surface(html));
const roundTrip = (md: string) => toMd(markdownToHtml(md));

describe("stored Markdown to the editing surface", () => {
  it("renders the whole subset", () => {
    const html = markdownToHtml(
      "### Duties\n- **Bold**, _italic_ and ++underlined++\n- [Apply](https://example.org/a?x=1&y=2)\n\n1. one\n2. two\n\n> quoted\n\nline1\nline2",
    );
    expect(html).toContain("<h3>Duties</h3>");
    expect(html).toContain("<ul><li><strong>Bold</strong>, <em>italic</em> and <u>underlined</u></li>");
    expect(html).toContain('<a href="https://example.org/a?x=1&amp;y=2">Apply</a>');
    expect(html).toContain("<ol><li>one</li><li>two</li></ol>");
    expect(html).toContain("<blockquote><p>quoted</p></blockquote>");
    expect(html).toContain("<p>line1<br>line2</p>");
  });

  it("shows an empty value as one empty line", () => {
    expect(markdownToHtml("")).toBe("<p><br></p>");
    expect(markdownToHtml(null)).toBe("<p><br></p>");
  });

  it("escapes everything: stored text never becomes markup", () => {
    const html = markdownToHtml('<img src=x onerror="alert(1)"> **<b>x</b>** [x](javascript:alert(1))');
    expect(html).not.toMatch(/<img|<b>|onerror="|href="javascript/i);
    expect(html).toContain("&lt;img");
  });

  it("does not link anything but https", () => {
    expect(markdownToHtml("[x](http://example.org)")).not.toContain("<a ");
    expect(markdownToHtml("[x](https://example.org)")).toContain('<a href="https://example.org">x</a>');
  });

  it("leaves plain plus signs alone", () => {
    expect(markdownToHtml("C++ and C++ again")).toBe("<p>C++ and C++ again</p>");
  });
});

describe("the editing surface back to stored Markdown", () => {
  it.each([
    ["bold, italic, underline", "<p><b>a</b> <i>b</i> <u>c</u></p>", "**a** _b_ ++c++"],
    ["strong and em", "<p><strong>a</strong> <em>b</em></p>", "**a** _b_"],
    ["marks nest in either order", "<p><b><i>x</i></b> <i><b>y</b></i></p>", "**_x_** _**y**_"],
    ["bulleted list", "<ul><li>one</li><li>two</li></ul>", "- one\n- two"],
    ["numbered list", "<ol><li>one</li><li>two</li></ol>", "1. one\n2. two"],
    ["a link", '<p><a href="https://example.org/a">site</a></p>', "[site](https://example.org/a)"],
    ["two paragraphs", "<p>a</p><p>b</p>", "a\n\nb"],
    ["a line break inside a paragraph", "<p>a<br>b</p>", "a\nb"],
    ["loose divs (what a browser makes of Enter)", "<div>a</div><div>b</div>", "a\n\nb"],
    ["a heading", "<h3>Duties</h3><p>x</p>", "### Duties\n\nx"],
    ["a quote", "<blockquote><p>q</p></blockquote>", "> q"],
    ["no-break spaces", "<p>a&nbsp;b</p>", "a b"],
  ] as [string, string, string][])("%s", (_name, html, md) => {
    expect(toMd(html)).toBe(md);
  });

  it("keeps the space outside a mark, because the subset cannot end emphasis on one", () => {
    expect(toMd("<p><b>bold </b>next</p>")).toBe("**bold** next");
    expect(toMd("<p>a<b> b</b></p>")).toBe("a **b**");
  });

  it("never lets a mark run across a line break", () => {
    expect(toMd("<p><b>a<br>b</b></p>")).toBe("**a**\n**b**");
  });

  it("reads inline styles a phone keyboard or a paste may leave behind", () => {
    expect(
      toMd(
        '<p><span style="font-weight: 700">a</span> <span style="font-style: italic">b</span> <span style="text-decoration: underline">c</span></p>',
      ),
    ).toBe("**a** _b_ ++c++");
  });

  it("reads the list a browser puts inside a paragraph (<p><ul>), and text around it", () => {
    expect(toMd("<p>Intro</p><p><ul><li>first</li><li>second</li></ul></p>")).toBe(
      "Intro\n\n- first\n- second",
    );
    expect(toMd("<p>Intro<ul><li>a</li></ul>After</p>")).toBe("Intro\n\n- a\n\nAfter");
    expect(toMd("<div><div>a</div><div><ol><li>b</li></ol></div></div>")).toBe("a\n\n1. b");
  });

  it("flattens a nested list, which the subset does not have", () => {
    expect(toMd("<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>")).toBe("- a\n- b\n- c");
  });

  it("drops a link that is not https and keeps its words", () => {
    expect(toMd('<p><a href="http://example.org">x</a></p>')).toBe("x");
    expect(toMd('<p><a href="javascript:alert(1)">x</a></p>')).toBe("x");
    expect(toMd('<p><a href="mailto:a@b.example">x</a></p>')).toBe("x");
    expect(toMd('<p><a href="data:text/html;base64,AAAA">x</a></p>')).toBe("x");
  });

  it("encodes characters that would end a link early", () => {
    expect(toMd('<p><a href="https://example.org/a (b)">x</a></p>')).toBe(
      "[x](https://example.org/a%20(b%29)",
    );
  });

  it("removes everything that is not in the allow-list (XSS)", () => {
    const md = toMd(
      '<p onclick="x()">safe</p><script>alert(1)</script><style>p{}</style><img src=x onerror="alert(1)"><iframe src="https://evil.example"></iframe><table><tr><td>cell</td></tr></table><svg onload="alert(1)"></svg>',
    );
    expect(md).not.toMatch(/script|alert|onerror|onload|onclick|iframe|<|>/);
    expect(md).toContain("safe");
  });

  it("is empty for an empty surface", () => {
    expect(toMd("<p><br></p>")).toBe("");
    expect(toMd("")).toBe("");
  });
});

describe("saving, editing and publishing keep the formatting", () => {
  it.each([
    "Plain old text on one line.",
    "Line one\nLine two\nLine three",
    "Paragraph one.\n\nParagraph two.",
    "- a\n- b\n- c",
    "1. first\n2. second",
    "**bold** _italic_ ++underline++",
    "**_both_** and **++strong underline++**",
    "Apply at [our site](https://example.org/apply?ref=1&x=2) today.",
    "### Duties\n\n- Count stock\n- Keep records\n\n#### Hours\n\nMonday to Friday",
    "Intro\n\n- a\n- b\n\nClosing words\n\n1. one\n2. two",
    "> a quote",
    "Send your CV to the Director.\nBox 1760, Harare",
  ])("round-trips %j unchanged", (md) => {
    expect(roundTrip(md)).toBe(md);
    expect(roundTrip(roundTrip(md))).toBe(md); // and stays stable
  });

  it("normalises list syntax without losing it", () => {
    expect(roundTrip("* a\n* b")).toBe("- a\n- b");
    expect(roundTrip("1) a\n2) b")).toBe("1. a\n2. b");
  });
});

describe("the link box", () => {
  it.each([
    ["https://example.org/apply", "https://example.org/apply"],
    ["  https://example.org  ", "https://example.org"],
    ["example.org/apply", "https://example.org/apply"],
    ["www.example.org", "https://www.example.org"],
    ["//example.org", "https://example.org"],
  ])("accepts %j", (input, out) => {
    expect(normaliseLinkUrl(input)).toBe(out);
  });

  it.each([
    "",
    "   ",
    "http://example.org",
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "data:text/html;base64,AAAA",
    "mailto:a@b.example",
    "ftp://example.org",
    "https://user:pass@example.org",
    "https://localhost",
    "two words.org",
    "https://",
  ])("refuses %j", (input) => {
    expect(normaliseLinkUrl(input)).toBeNull();
  });
});
