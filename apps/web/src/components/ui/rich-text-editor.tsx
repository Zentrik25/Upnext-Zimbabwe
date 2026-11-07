"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { htmlToMarkdown, markdownToHtml, normaliseLinkUrl } from "@/lib/rich-text";

/**
 * A visual editor for the three long fields of a listing: bold, italic, underline, bulleted and numbered
 * lists, links (add, edit, remove) and undo/redo, on a phone and on a desktop. Editors never see or type markup.
 *
 * The value in and out is the stored Markdown subset (`lib/rich-text`), so older plain-text listings open and save
 * unchanged. Safety does not depend on the browser: the surface is only ever filled from escaped, allow-listed HTML,
 * pasted and dropped content is taken as plain text, and what is saved is rebuilt from the DOM through an allow-list
 * (https links only; no scripts, styles, attributes or other tags survive).
 *
 * Phones: 44px buttons; the toolbar and the link box are lifted above the on-screen keyboard (visualViewport) so
 * they stay in reach while typing; every part wraps, so the page never scrolls sideways.
 */

/** The toolbar's own icons (kept here, not in the shared icon set, so pages without the editor do not carry them). */
const GLYPHS = {
  listBullet: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
  listNumber: "M10 6h10M10 12h10M10 18h10M4 4.5 5.5 4v5M4 9h3M4 14h3l-3 4h3",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  unlink:
    "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1M3 3l18 18",
  undo: "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  redo: "m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3",
} as const;

function Icon({ name }: { name: keyof typeof GLYPHS }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="h-5 w-5"
    >
      <path d={GLYPHS[name]} />
    </svg>
  );
}

type Marks = { bold: boolean; italic: boolean; underline: boolean; ul: boolean; ol: boolean; link: boolean };
const NO_MARKS: Marks = { bold: false, italic: false, underline: false, ul: false, ol: false, link: false };

type LinkBox = {
  anchor: HTMLAnchorElement | null;
  url: string;
  text: string;
  needsText: boolean;
  error: string;
};

const label = "text-ctl font-medium text-check-text";
const button =
  "inline-grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-control border border-transparent text-ink hover:bg-accent/5 disabled:cursor-not-allowed disabled:opacity-40 aria-pressed:border-border-strong aria-pressed:bg-match-bg aria-pressed:text-accent md:h-9 md:w-9";

function ToolButton({
  name,
  shortcut,
  pressed,
  disabled,
  onRun,
  children,
}: {
  name: string;
  shortcut?: string;
  pressed?: boolean;
  disabled?: boolean;
  onRun: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={button}
      aria-label={name}
      title={shortcut ? `${name} (${shortcut})` : name}
      aria-pressed={pressed}
      disabled={disabled}
      // Keep the caret and the selection where they are, and the keyboard open: a tap must not take focus.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onRun}
    >
      {children}
    </button>
  );
}

const glyph = "text-[17px] leading-none text-current";

function anchorAround(node: Node | null, root: HTMLElement): HTMLAnchorElement | null {
  for (let n: Node | null = node; n && n !== root; n = n.parentNode)
    if (n.nodeType === 1 && (n as HTMLElement).tagName === "A") return n as HTMLAnchorElement;
  return null;
}

/*
 * The design's "bold" is weight 400 (only 300 and 400 are loaded), and a browser decides whether text is bold from its
 * computed weight (600 or more), so with the site's weights the Bold button would wrap bold text again instead of
 * un-bolding it. Inside the editor, b and strong therefore compute to 700, with synthesis off so the glyphs are still
 * the loaded 400 face, exactly as on the published page.
 */

/** Fills the surface from stored text without `innerHTML`: parsed inertly, from escaped allow-listed HTML. */
function fill(el: HTMLElement, markdown: string): void {
  const doc = new DOMParser().parseFromString(markdownToHtml(markdown), "text/html");
  el.replaceChildren(...Array.from(doc.body.childNodes));
}

export function RichTextEditor({
  id,
  title,
  hint,
  value,
  onChange,
  error,
  optional,
  minHeight = 140,
}: {
  id: string;
  title: string;
  hint?: string;
  value: string;
  onChange: (markdown: string) => void;
  error?: string;
  optional?: boolean;
  /** Height of the writing area in px before it grows; it scrolls inside itself past 60% of the screen. */
  minHeight?: number;
}) {
  const labelId = `${id}-label`;
  const linkId = useId();
  const surface = useRef<HTMLDivElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const emitted = useRef<string | null>(null);
  const saved = useRef<Range | null>(null);
  const [marks, setMarks] = useState<Marks>(NO_MARKS);
  const [box, setBox] = useState<LinkBox | null>(null);
  const [focused, setFocused] = useState(false);
  const [lift, setLift] = useState<number | null>(null);
  const [barHeight, setBarHeight] = useState(0);

  // Show the stored value; only again if it is changed from outside (a different listing), never for our own echo.
  useLayoutEffect(() => {
    const el = surface.current;
    if (!el || value === emitted.current) return;
    fill(el, value);
    emitted.current = value;
  }, [value]);

  const emit = useCallback(() => {
    const el = surface.current;
    if (!el) return;
    const next = htmlToMarkdown(el);
    if (next === emitted.current) return;
    emitted.current = next;
    onChange(next);
  }, [onChange]);

  const readMarks = useCallback(() => {
    const el = surface.current;
    const selection = document.getSelection();
    if (!el || !selection?.rangeCount || !el.contains(selection.getRangeAt(0).commonAncestorContainer))
      return;
    saved.current = selection.getRangeAt(0).cloneRange();
    const state = (command: string) => {
      try {
        return typeof document.queryCommandState === "function" && document.queryCommandState(command);
      } catch {
        return false;
      }
    };
    setMarks({
      bold: state("bold"),
      italic: state("italic"),
      underline: state("underline"),
      ul: state("insertUnorderedList"),
      ol: state("insertOrderedList"),
      link: Boolean(anchorAround(selection.getRangeAt(0).startContainer, el)),
    });
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", readMarks);
    return () => document.removeEventListener("selectionchange", readMarks);
  }, [readMarks]);

  // Lift the toolbar above the on-screen keyboard while the person is writing.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!focused || !viewport) return;
    const update = () => {
      const covered = window.innerHeight - viewport.height - viewport.offsetTop;
      setLift(covered > 80 ? Math.max(0, covered) : null);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, [focused]);

  const docked = focused && lift !== null;
  useLayoutEffect(() => {
    if (docked && bar.current) setBarHeight(bar.current.offsetHeight);
  }, [docked, box]);

  /** Remembers the live selection (the `selectionchange` event lags behind typing, so never trust only that). */
  function capture() {
    const el = surface.current;
    const selection = document.getSelection();
    if (el && selection?.rangeCount && el.contains(selection.getRangeAt(0).commonAncestorContainer))
      saved.current = selection.getRangeAt(0).cloneRange();
  }

  /**
   * Gets the editor ready for a command. While it still has focus the selection is already right and is left alone
   * (re-applying one would also drop a pending bold or italic). Only if focus went elsewhere (the link box) is the
   * remembered selection put back.
   */
  function restore() {
    const el = surface.current;
    if (!el) return;
    if (document.activeElement === el) {
      capture();
      return;
    }
    el.focus({ preventScroll: true });
    const selection = document.getSelection();
    if (saved.current && selection) {
      selection.removeAllRanges();
      selection.addRange(saved.current);
    }
  }

  function exec(command: string, argument?: string): boolean {
    restore();
    let done = false;
    try {
      done = typeof document.execCommand === "function" && document.execCommand(command, false, argument);
    } catch {
      done = false;
    }
    emit();
    readMarks();
    return done;
  }

  function insertText(text: string) {
    restore();
    if (typeof document.execCommand === "function" && document.execCommand("insertText", false, text)) {
      emit();
      return;
    }
    const range = document.getSelection()?.getRangeAt(0);
    if (range) {
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
      range.collapse(false);
    }
    emit();
  }

  function openLink() {
    const el = surface.current;
    if (!el) return;
    restore();
    const range = document.getSelection()?.rangeCount ? document.getSelection()!.getRangeAt(0) : null;
    const anchor = range ? anchorAround(range.startContainer, el) : null;
    setBox({
      anchor,
      url: anchor?.getAttribute("href") ?? "",
      text: "",
      needsText: !anchor && (range?.collapsed ?? true),
      error: "",
    });
    window.setTimeout(() => document.getElementById(`${linkId}-url`)?.focus(), 0);
  }

  function closeLink() {
    setBox(null);
    restore();
  }

  function applyLink() {
    if (!box) return;
    const url = normaliseLinkUrl(box.url);
    if (!url) {
      setBox({ ...box, error: "Enter a web address that starts with https://" });
      return;
    }
    if (box.anchor) {
      box.anchor.setAttribute("href", url);
      setBox(null);
      restore();
      emit();
      return;
    }
    const words = box.text.trim() || url;
    setBox(null);
    restore();
    if (box.needsText) {
      const safe = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
      exec("insertHTML", `<a href="${safe(url)}">${safe(words)}</a>`);
    } else exec("createLink", url);
  }

  function removeLink() {
    const el = surface.current;
    if (!el) return;
    setBox(null);
    restore();
    const range = document.getSelection()?.rangeCount ? document.getSelection()!.getRangeAt(0) : null;
    const anchor = range ? anchorAround(range.startContainer, el) : null;
    if (anchor && range?.collapsed) {
      const whole = document.createRange();
      whole.selectNodeContents(anchor);
      document.getSelection()?.removeAllRanges();
      document.getSelection()?.addRange(whole);
      saved.current = whole;
    }
    exec("unlink");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const key = e.key.toLowerCase();
    const command = { b: "bold", i: "italic", u: "underline" }[key];
    if (command && !e.shiftKey) {
      e.preventDefault();
      exec(command);
    } else if (key === "k" && !e.shiftKey) {
      e.preventDefault();
      openLink();
    }
  }

  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="grid min-w-0 gap-1">
      <span id={labelId} className={label}>
        {title}
        {optional ? <span className="font-light text-muted"> (optional)</span> : null}
      </span>
      <div
        ref={wrapper}
        className={cn(
          "min-w-0 rounded-control border border-control-border bg-surface focus-within:border-focus focus-within:ring-1 focus-within:ring-focus",
          error && "border-danger ring-1 ring-danger",
        )}
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          if (!wrapper.current?.contains(e.relatedTarget as Node | null)) setFocused(false);
        }}
      >
        {docked ? <div aria-hidden="true" style={{ height: barHeight }} /> : null}
        <div
          ref={bar}
          className={cn(
            "bg-surface",
            docked ? "fixed inset-x-0 z-50 border-t border-line px-1 py-1" : "border-b border-line px-1 py-1",
          )}
          style={docked ? { bottom: lift ?? 0 } : undefined}
          data-docked={docked || undefined}
        >
          <div
            role="toolbar"
            aria-label="Text formatting"
            aria-controls={id}
            className="flex flex-wrap gap-x-0.5"
          >
            <ToolButton name="Bold" shortcut="Ctrl+B" pressed={marks.bold} onRun={() => exec("bold")}>
              <span aria-hidden="true" className={cn(glyph, "font-bold")}>
                B
              </span>
            </ToolButton>
            <ToolButton name="Italic" shortcut="Ctrl+I" pressed={marks.italic} onRun={() => exec("italic")}>
              <span aria-hidden="true" className={cn(glyph, "font-serif italic")}>
                I
              </span>
            </ToolButton>
            <ToolButton
              name="Underline"
              shortcut="Ctrl+U"
              pressed={marks.underline}
              onRun={() => exec("underline")}
            >
              <span aria-hidden="true" className={cn(glyph, "underline")}>
                U
              </span>
            </ToolButton>
            <ToolButton name="Bulleted list" pressed={marks.ul} onRun={() => exec("insertUnorderedList")}>
              <Icon name="listBullet" />
            </ToolButton>
            <ToolButton name="Numbered list" pressed={marks.ol} onRun={() => exec("insertOrderedList")}>
              <Icon name="listNumber" />
            </ToolButton>
            <ToolButton
              name={marks.link ? "Edit link" : "Insert link"}
              shortcut="Ctrl+K"
              pressed={marks.link}
              onRun={openLink}
            >
              <Icon name="link" />
            </ToolButton>
            <ToolButton name="Remove link" disabled={!marks.link} onRun={removeLink}>
              <Icon name="unlink" />
            </ToolButton>
            <ToolButton name="Undo" shortcut="Ctrl+Z" onRun={() => exec("undo")}>
              <Icon name="undo" />
            </ToolButton>
            <ToolButton name="Redo" shortcut="Ctrl+Y" onRun={() => exec("redo")}>
              <Icon name="redo" />
            </ToolButton>
          </div>
          {box ? (
            <div
              role="group"
              aria-label="Link"
              className="mt-1 grid min-w-0 gap-2 border-t border-line p-2"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault(); // inside a form: Enter must not save the whole listing
                  applyLink();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  closeLink();
                }
              }}
            >
              {box.needsText ? (
                <label className="grid gap-1 text-small text-check-text" htmlFor={`${linkId}-text`}>
                  Text to show
                  <input
                    id={`${linkId}-text`}
                    type="text"
                    value={box.text}
                    onChange={(e) => setBox({ ...box, text: e.target.value })}
                    className="min-h-field w-full min-w-0 rounded-control border border-control-border bg-surface px-3 text-ctl text-ink"
                  />
                </label>
              ) : null}
              <label className="grid gap-1 text-small text-check-text" htmlFor={`${linkId}-url`}>
                Link address
                <input
                  id={`${linkId}-url`}
                  type="url"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="https://"
                  value={box.url}
                  aria-invalid={box.error ? true : undefined}
                  aria-describedby={box.error ? `${linkId}-error` : undefined}
                  onChange={(e) => setBox({ ...box, url: e.target.value, error: "" })}
                  className="min-h-field w-full min-w-0 rounded-control border border-control-border bg-surface px-3 text-ctl text-ink aria-[invalid=true]:border-danger"
                />
              </label>
              {box.error ? (
                <p id={`${linkId}-error`} role="alert" className="m-0 text-small text-danger">
                  <span className="font-strong">Error:</span> {box.error}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={applyLink}
                  className="min-h-[44px] cursor-pointer rounded-control border border-accent-solid bg-accent-solid px-4 text-ctl font-medium text-on-accent hover:bg-accent-solid-hover"
                >
                  {box.anchor ? "Update link" : "Add link"}
                </button>
                {box.anchor ? (
                  <button
                    type="button"
                    onClick={removeLink}
                    className="min-h-[44px] cursor-pointer rounded-control border border-border-strong px-4 text-ctl font-medium text-secondary-text hover:bg-accent/5"
                  >
                    Remove link
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={closeLink}
                  className="min-h-[44px] cursor-pointer rounded-control border border-border-strong px-4 text-ctl font-medium text-secondary-text hover:bg-accent/5"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <div
          ref={surface}
          id={id}
          role="textbox"
          aria-multiline="true"
          aria-labelledby={labelId}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          contentEditable
          suppressContentEditableWarning
          spellCheck
          tabIndex={0}
          data-rich-text
          style={{ minHeight }}
          className="max-h-[60vh] min-w-0 overflow-y-auto px-3 py-[10px] text-ctl font-light text-ink outline-none [overflow-wrap:anywhere] [font-synthesis-weight:none] [&_b]:[font-weight:700] [&_strong]:[font-weight:700] [&_a]:text-link [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_blockquote]:text-muted [&_h3]:font-strong [&_h4]:font-strong [&_h5]:font-strong [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:m-0 [&_p+p]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul+p]:mt-2 [&_ol+p]:mt-2 [&_p+ul]:mt-2 [&_p+ol]:mt-2"
          onInput={emit}
          onKeyDown={onKeyDown}
          onFocus={() => {
            try {
              document.execCommand("defaultParagraphSeparator", false, "p");
            } catch {
              /* a browser without it keeps its own separator: the saved text is the same */
            }
          }}
          onPaste={(e) => {
            e.preventDefault(); // formatted pastes carry markup from elsewhere: only the words are taken
            insertText(e.clipboardData.getData("text/plain"));
          }}
          onDrop={(e) => {
            e.preventDefault();
            insertText(e.dataTransfer.getData("text/plain"));
          }}
        />
      </div>
      {hint && !error ? (
        <p id={`${id}-hint`} className="m-0 text-small text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="m-0 text-small text-danger">
          <span className="font-strong">Error:</span> {error}
        </p>
      ) : null}
    </div>
  );
}
