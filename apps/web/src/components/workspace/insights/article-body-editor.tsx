"use client";

import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { useId, useState } from "react";
import { MediaDialog } from "@/components/workspace/media-dialog";
import type { MediaItem } from "@/lib/staff-types";
import { cn } from "@/lib/cn";

/**
 * The article body editor (D-78), built on Tiptap 3 (ProseMirror). It produces semantic HTML in exactly the
 * vocabulary the server keeps (paragraphs, h2/h3, bold, italic, underline, lists, quotes, links, images, tables);
 * code, strikethrough and rules are switched off. The server sanitises every save regardless (insights/sanitize.py),
 * so nothing here is a security boundary. The toolbar is a labelled toolbar of real buttons with pressed states,
 * wraps on narrow screens and stays above the text while scrolling.
 */
export function ArticleBodyEditor({
  id,
  value,
  onChange,
  labelledBy,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (html: string) => void;
  labelledBy: string;
  invalid?: boolean;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        strike: false,
        horizontalRule: false,
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
          protocols: ["https", "mailto"],
          HTMLAttributes: { rel: "noopener noreferrer", target: null },
        },
      }),
      Image.configure({ inline: false, allowBase64: false }),
      TableKit.configure({ table: { resizable: false } }),
    ],
    content: value || "<p></p>",
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": labelledBy,
        ...(invalid ? { "aria-invalid": "true", "aria-describedby": `${id}-error` } : {}),
        class: "insights-prose min-h-[320px] px-4 py-3 outline-none",
      },
      // Pasted content keeps structure but never styles or scripts; the server sanitises it again on save.
      transformPastedHTML: (html) => html.replace(/\sstyle="[^"]*"/gi, "").replace(/\sclass="[^"]*"/gi, ""),
    },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? "" : e.getHTML()),
  });

  return (
    <div
      className={cn(
        "rounded-control border bg-surface",
        invalid ? "border-danger" : "border-control-border",
        "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus",
      )}
    >
      {editor ? (
        <Toolbar editor={editor} />
      ) : (
        <div className="h-[46px] border-b border-line" aria-hidden="true" />
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      paragraph: e.isActive("paragraph"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      table: e.isActive("table"),
      undo: e.can().undo(),
      redo: e.can().redo(),
    }),
  });
  const [linkOpen, setLinkOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const chain = () => editor.chain().focus();

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="sticky top-[56px] z-10 flex flex-wrap items-center gap-1 border-b border-line bg-surface px-2 py-1.5"
    >
      <ToolButton
        label="Bold"
        shortcut="Ctrl+B"
        pressed={state.bold}
        onClick={() => chain().toggleBold().run()}
      >
        <strong aria-hidden="true">B</strong>
      </ToolButton>
      <ToolButton
        label="Italic"
        shortcut="Ctrl+I"
        pressed={state.italic}
        onClick={() => chain().toggleItalic().run()}
      >
        <em aria-hidden="true">I</em>
      </ToolButton>
      <ToolButton
        label="Underline"
        shortcut="Ctrl+U"
        pressed={state.underline}
        onClick={() => chain().toggleUnderline().run()}
      >
        <span aria-hidden="true" className="underline">
          U
        </span>
      </ToolButton>
      <Divider />
      <ToolButton
        label="H2 heading"
        pressed={state.h2}
        onClick={() => chain().toggleHeading({ level: 2 }).run()}
      >
        H2
      </ToolButton>
      <ToolButton
        label="H3 heading"
        pressed={state.h3}
        onClick={() => chain().toggleHeading({ level: 3 }).run()}
      >
        H3
      </ToolButton>
      <ToolButton label="Paragraph" pressed={state.paragraph} onClick={() => chain().setParagraph().run()}>
        ¶
      </ToolButton>
      <Divider />
      <ToolButton
        label="Bulleted list"
        pressed={state.bullet}
        onClick={() => chain().toggleBulletList().run()}
      >
        <span aria-hidden="true">• List</span>
      </ToolButton>
      <ToolButton
        label="1. Numbered list"
        pressed={state.ordered}
        onClick={() => chain().toggleOrderedList().run()}
      >
        1. Numbered
      </ToolButton>
      <ToolButton label="Quote" pressed={state.quote} onClick={() => chain().toggleBlockquote().run()}>
        “ ”
      </ToolButton>
      <Divider />
      <ToolButton label="Link" pressed={state.link} onClick={() => setLinkOpen((v) => !v)}>
        Link
      </ToolButton>
      <ToolButton label="Unlink" disabled={!state.link} onClick={() => chain().unsetLink().run()}>
        Unlink
      </ToolButton>
      <ToolButton label="Image" onClick={() => setMediaOpen(true)}>
        Image
      </ToolButton>
      <ToolButton
        label={state.table ? "Delete table" : "Table"}
        onClick={() =>
          state.table
            ? chain().deleteTable().run()
            : chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
      >
        {state.table ? "Delete table" : "Table"}
      </ToolButton>
      {state.table ? (
        <>
          <ToolButton label="Add row" onClick={() => chain().addRowAfter().run()}>
            Add row
          </ToolButton>
          <ToolButton label="Add column" onClick={() => chain().addColumnAfter().run()}>
            Add column
          </ToolButton>
        </>
      ) : null}
      <ToolButton label="Clear formatting" onClick={() => chain().unsetAllMarks().clearNodes().run()}>
        Clear
      </ToolButton>
      <Divider />
      <ToolButton label="Undo" shortcut="Ctrl+Z" disabled={!state.undo} onClick={() => chain().undo().run()}>
        ↶
      </ToolButton>
      <ToolButton
        label="Redo"
        shortcut="Ctrl+Shift+Z"
        disabled={!state.redo}
        onClick={() => chain().redo().run()}
      >
        ↷
      </ToolButton>
      {linkOpen ? <LinkForm editor={editor} onDone={() => setLinkOpen(false)} /> : null}
      <MediaDialog
        open={mediaOpen}
        onClose={() => setMediaOpen(false)}
        onUse={(item: MediaItem) => {
          setMediaOpen(false);
          const alt =
            window.prompt("Describe the picture for people who cannot see it (alt text):", item.title) ?? "";
          if (item.url) chain().setImage({ src: item.url, alt: alt.trim() }).run();
        }}
      />
    </div>
  );
}

function LinkForm({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const id = useId();
  const [href, setHref] = useState<string>(
    (editor.getAttributes("link").href as string | undefined) ?? "https://",
  );
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <form
      className="flex w-full flex-wrap items-center gap-2 pt-1"
      onSubmit={(e) => {
        e.preventDefault();
        const value = href.trim();
        const ok =
          /^https:\/\/[^\s]+\.[^\s]+/.test(value) ||
          /^mailto:[^\s@]+@[^\s@]+$/.test(value) ||
          value.startsWith("/");
        if (!ok)
          return setProblem(
            "Use a full https address, a mailto: address or an UPNEXT path such as /opportunities.",
          );
        editor.chain().focus().extendMarkRange("link").setLink({ href: value }).run();
        onDone();
      }}
    >
      <label htmlFor={id} className="text-small font-strong">
        Link address
      </label>
      <input
        id={id}
        value={href}
        autoFocus
        onChange={(e) => setHref(e.target.value)}
        className="min-h-[36px] min-w-0 flex-1 rounded-control border border-control-border px-2 text-ctl"
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? `${id}-error` : undefined}
      />
      <button type="submit" className="min-h-[36px] rounded-control bg-accent-solid px-3 text-ctl text-white">
        Apply
      </button>
      <button type="button" onClick={onDone} className="min-h-[36px] px-2 text-ctl text-accent underline">
        Cancel
      </button>
      {problem ? (
        <p id={`${id}-error`} role="alert" className="m-0 w-full text-small text-danger">
          {problem}
        </p>
      ) : null}
    </form>
  );
}

function Divider() {
  return <span aria-hidden="true" className="mx-0.5 h-6 w-px bg-line" />;
}

function ToolButton({
  label,
  shortcut,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed === undefined ? undefined : pressed}
      title={shortcut ? `${label} (${shortcut})` : label}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} // keep the text selection
      onClick={onClick}
      className={cn(
        "inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-control px-2 text-ctl text-ink",
        "hover:bg-surface-pale disabled:opacity-40",
        pressed ? "bg-match-bg text-accent" : "",
      )}
    >
      {children}
    </button>
  );
}
