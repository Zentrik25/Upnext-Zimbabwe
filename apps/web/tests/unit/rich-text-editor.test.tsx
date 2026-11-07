import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RichTextEditor } from "@/components/ui/rich-text-editor";

const exec = vi.fn((...args: [string, boolean?, string?]) => args.length > 0);

beforeEach(() => {
  exec.mockClear();
  document.execCommand = exec as unknown as typeof document.execCommand;
});
afterEach(cleanup);

function Harness({ initial = "", onValue }: { initial?: string; onValue?: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <RichTextEditor
        id="resp"
        title="Key responsibilities"
        hint="Use the toolbar."
        value={value}
        onChange={(v) => {
          setValue(v);
          onValue?.(v);
        }}
      />
    </form>
  );
}

const box = () => screen.getByRole("textbox", { name: /Key responsibilities/ });
const type = (html: string) => {
  box().innerHTML = html;
  fireEvent.input(box());
};

describe("the visual editor", () => {
  it("is a labelled text box with a hint, and never shows markup to the editor", () => {
    render(<Harness initial={"**Bold** and [a link](https://example.org)\n\n- one\n- two"} />);
    expect(box()).toHaveAttribute("contenteditable", "true");
    expect(box()).toHaveAttribute("aria-multiline", "true");
    expect(box()).toHaveAccessibleDescription("Use the toolbar.");
    expect(box().querySelector("strong")?.textContent).toBe("Bold");
    expect(box().querySelector("a")).toHaveAttribute("href", "https://example.org");
    expect(box().querySelectorAll("li")).toHaveLength(2);
    expect(box().textContent).not.toMatch(/\*\*|\]\(|^- /);
  });

  it("offers every required control by name: bold, italic, underline, lists, link, remove link, undo, redo", () => {
    render(<Harness />);
    const bar = screen.getByRole("toolbar", { name: "Text formatting" });
    for (const name of [
      "Bold",
      "Italic",
      "Underline",
      "Bulleted list",
      "Numbered list",
      "Insert link",
      "Remove link",
      "Undo",
      "Redo",
    ])
      expect(within(bar).getByRole("button", { name })).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Bold" })).toHaveAttribute("title", "Bold (Ctrl+B)");
    expect(within(bar).getByRole("button", { name: "Insert link" })).toHaveAttribute(
      "title",
      "Insert link (Ctrl+K)",
    );
  });

  it("sizes the buttons for touch (44px) on phones", () => {
    render(<Harness />);
    for (const b of within(screen.getByRole("toolbar")).getAllByRole("button"))
      expect(b.className).toContain("h-11 w-11");
  });

  it("runs the matching command for each button, without taking focus from the text", () => {
    render(<Harness />);
    const bar = within(screen.getByRole("toolbar"));
    for (const [name, command] of [
      ["Bold", "bold"],
      ["Italic", "italic"],
      ["Underline", "underline"],
      ["Bulleted list", "insertUnorderedList"],
      ["Numbered list", "insertOrderedList"],
      ["Undo", "undo"],
      ["Redo", "redo"],
    ] as const) {
      const button = bar.getByRole("button", { name });
      expect(fireEvent.mouseDown(button)).toBe(false); // default prevented: the caret and the keyboard stay
      fireEvent.click(button);
      expect(exec).toHaveBeenLastCalledWith(command, false, undefined);
    }
  });

  it("answers Ctrl+B, Ctrl+I, Ctrl+U and Ctrl+K (and ⌘ on a Mac)", () => {
    render(<Harness />);
    fireEvent.keyDown(box(), { key: "b", ctrlKey: true });
    expect(exec).toHaveBeenLastCalledWith("bold", false, undefined);
    fireEvent.keyDown(box(), { key: "i", metaKey: true });
    expect(exec).toHaveBeenLastCalledWith("italic", false, undefined);
    fireEvent.keyDown(box(), { key: "u", ctrlKey: true });
    expect(exec).toHaveBeenLastCalledWith("underline", false, undefined);
    fireEvent.keyDown(box(), { key: "k", ctrlKey: true });
    expect(screen.getByRole("group", { name: "Link" })).toBeInTheDocument();
  });

  it("reports what is typed as the stored Markdown", () => {
    const seen: string[] = [];
    render(<Harness onValue={(v) => seen.push(v)} />);
    type("<p>Hello <b>world</b></p><ul><li>one</li></ul>");
    expect(seen.at(-1)).toBe("Hello **world**\n\n- one");
  });

  it("does not reset the text while it is being typed", () => {
    render(<Harness initial="start" />);
    type("<p>start and more</p>");
    expect(box().textContent).toBe("start and more");
  });

  it("takes pasted and dropped content as plain words, never markup", () => {
    render(<Harness />);
    const data = {
      getData: (t: string) => (t === "text/plain" ? "plain words" : "<img src=x onerror=alert(1)>"),
    };
    const prevented = !fireEvent.paste(box(), { clipboardData: data });
    expect(prevented).toBe(true);
    expect(exec).toHaveBeenLastCalledWith("insertText", false, "plain words");
    expect(fireEvent.drop(box(), { dataTransfer: data })).toBe(false);
    expect(box().querySelector("img")).toBeNull();
  });

  it("strips anything that is not allowed from what is saved (XSS)", () => {
    const seen: string[] = [];
    render(<Harness onValue={(v) => seen.push(v)} />);
    type(
      '<p onclick="x()">ok <a href="javascript:alert(1)">bad</a> <img src=x onerror="alert(1)"><script>alert(1)</script></p>',
    );
    expect(seen.at(-1)).toBe("ok bad");
  });

  it("shows an error in words with the field and marks it invalid", () => {
    render(<RichTextEditor id="q" title="Qualifications" value="" onChange={() => {}} error="Too long." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Error: Too long.");
    expect(screen.getByRole("textbox", { name: "Qualifications" })).toHaveAttribute("aria-invalid", "true");
  });

  it("marks an optional field", () => {
    render(<RichTextEditor id="q" title="Qualifications" optional value="" onChange={() => {}} />);
    expect(screen.getByText("(optional)")).toBeInTheDocument();
  });
});

describe("links", () => {
  function open(name = "Insert link") {
    fireEvent.click(screen.getByRole("button", { name }));
    return within(screen.getByRole("group", { name: "Link" }));
  }

  it("adds a link to the selected words with createLink, after adding https:// to a bare address", () => {
    render(<Harness initial="Apply here" />);
    const select = document.createRange();
    select.selectNodeContents(box().firstChild!);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(select);
    fireEvent(document, new Event("selectionchange"));
    const link = open();
    expect(link.queryByLabelText("Text to show")).toBeNull(); // the words are already chosen
    fireEvent.change(link.getByLabelText("Link address"), { target: { value: "careers.example.org/apply" } });
    fireEvent.click(link.getByRole("button", { name: "Add link" }));
    expect(exec).toHaveBeenLastCalledWith("createLink", false, "https://careers.example.org/apply");
  });

  it("asks for the words to show when nothing is selected, and inserts an escaped link", () => {
    render(<Harness />);
    const link = open();
    fireEvent.change(link.getByLabelText("Text to show"), { target: { value: 'Apply <now> & "go"' } });
    fireEvent.change(link.getByLabelText("Link address"), {
      target: { value: "https://example.org/a?x=1&y=2" },
    });
    fireEvent.click(link.getByRole("button", { name: "Add link" }));
    const [command, , html] = exec.mock.calls.at(-1)!;
    expect(command).toBe("insertHTML");
    expect(html).toContain('href="https://example.org/a?x=1&#38;y=2"');
    expect(html).not.toMatch(/<now>|"go"/);
    expect(html).toContain("&#60;now&#62;");
  });

  it("refuses an address that is not https, in words, and adds nothing", () => {
    render(<Harness />);
    const link = open();
    for (const bad of ["javascript:alert(1)", "http://example.org", "mailto:a@b.example", "not a url"]) {
      fireEvent.change(link.getByLabelText("Link address"), { target: { value: bad } });
      fireEvent.click(link.getByRole("button", { name: "Add link" }));
      expect(screen.getByRole("alert")).toHaveTextContent("https://");
    }
    expect(exec).not.toHaveBeenCalledWith("createLink", expect.anything(), expect.anything());
    expect(exec).not.toHaveBeenCalledWith("insertHTML", expect.anything(), expect.anything());
  });

  it("Enter in the link box applies it and does not submit the listing form", () => {
    const submit = vi.fn((e: Event) => e.preventDefault());
    render(<Harness />);
    document.querySelector("form")!.addEventListener("submit", submit);
    const link = open();
    fireEvent.change(link.getByLabelText("Text to show"), { target: { value: "site" } });
    fireEvent.change(link.getByLabelText("Link address"), { target: { value: "https://example.org" } });
    fireEvent.keyDown(link.getByLabelText("Link address"), { key: "Enter" });
    expect(exec).toHaveBeenLastCalledWith("insertHTML", false, expect.stringContaining("example.org"));
    expect(submit).not.toHaveBeenCalled();
  });

  it("Escape closes the box", () => {
    render(<Harness />);
    const link = open();
    fireEvent.keyDown(link.getByLabelText("Link address"), { key: "Escape" });
    expect(screen.queryByRole("group", { name: "Link" })).toBeNull();
  });

  it("edits an existing link: the box shows its address and updating changes it in place", () => {
    const seen: string[] = [];
    render(<Harness initial="See [our site](https://old.example.org) now" onValue={(v) => seen.push(v)} />);
    const anchor = box().querySelector("a")!;
    const caret = document.createRange();
    caret.setStart(anchor.firstChild!, 2);
    caret.collapse(true);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(caret);
    fireEvent(document, new Event("selectionchange"));
    const link = open("Edit link");
    expect(link.getByLabelText("Link address")).toHaveValue("https://old.example.org");
    fireEvent.change(link.getByLabelText("Link address"), { target: { value: "https://new.example.org" } });
    fireEvent.click(link.getByRole("button", { name: "Update link" }));
    expect(box().querySelector("a")).toHaveAttribute("href", "https://new.example.org");
    expect(seen.at(-1)).toBe("See [our site](https://new.example.org) now");
  });

  it("removes a link with the toolbar button, which is only enabled inside a link", () => {
    render(<Harness initial="See [our site](https://old.example.org) now" />);
    expect(screen.getByRole("button", { name: "Remove link" })).toBeDisabled();
    const anchor = box().querySelector("a")!;
    const caret = document.createRange();
    caret.setStart(anchor.firstChild!, 1);
    caret.collapse(true);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(caret);
    fireEvent(document, new Event("selectionchange"));
    const remove = screen.getByRole("button", { name: "Remove link" });
    expect(remove).toBeEnabled();
    fireEvent.click(remove);
    expect(exec).toHaveBeenLastCalledWith("unlink", false, undefined);
  });
});
