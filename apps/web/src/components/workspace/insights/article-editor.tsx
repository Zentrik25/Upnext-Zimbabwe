"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, Checkbox, Select, Textarea, TextInput } from "@/components/ui";
import { MediaDialog } from "@/components/workspace/media-dialog";
import { Row } from "@/components/workspace/job-editor-parts";
import { StatusBadge } from "@/components/workspace/badges";
import { apiFetch, describeFailure, type FieldErrors } from "@/lib/client-api";
import {
  STATUS_LABEL,
  type ArticleAction,
  type ArticleSource,
  type InsightsMeta,
  type StaffArticle,
} from "@/lib/insights-types";
import type { MediaItem, StatusTone } from "@/lib/staff-types";
import { ArticleHtml } from "@/lib/article-html";
import { ArticleBodyEditor } from "./article-body-editor";

/**
 * The Career Insights article editor (D-78). Everything is saved through the staff API, which enforces every rule
 * (permissions, the row version, sanitising, approval invalidation); the editor only offers what the server says the
 * person may do (`article.actions`). Draft protection: an unsaved-changes indicator, a warning before leaving with
 * unsaved changes, Ctrl/Cmd+S to save, a debounced autosave of drafts, and a conflict message instead of ever
 * overwriting someone else's save.
 */

type Form = {
  headline: string;
  summary: string;
  body_html: string;
  in_short: string[];
  why_it_matters: string;
  category: string;
  tags: string;
  author_id: string;
  featured_image: string | null;
  featured_image_url: string | null;
  image_alt: string;
  image_caption: string;
  image_credit: string;
  opportunity_categories: string[];
  slug: string;
  canonical_url: string;
  search_title: string;
  search_description: string;
  social_title: string;
  social_description: string;
  social_image: string | null;
  social_image_url: string | null;
  sources: ArticleSource[];
};

const TONE: Record<string, StatusTone> = {
  draft: "neutral",
  submitted: "info",
  in_review: "info",
  approved: "warning",
  published: "success",
  archived: "muted",
};
const AUTOSAVE_MS = 15_000;

function fromArticle(a: StaffArticle): Form {
  return {
    headline: a.headline,
    summary: a.summary,
    body_html: a.body_html,
    in_short: a.in_short,
    why_it_matters: a.why_it_matters,
    category: a.category?.slug ?? "",
    tags: a.tags.join(", "),
    author_id: a.author?.id ?? "",
    featured_image: a.featured_image,
    featured_image_url: a.featured_image_url,
    image_alt: a.image_alt,
    image_caption: a.image_caption,
    image_credit: a.image_credit,
    opportunity_categories: a.opportunity_categories,
    slug: a.slug,
    canonical_url: a.canonical_url,
    search_title: a.search_title,
    search_description: a.search_description,
    social_title: a.social_title,
    social_description: a.social_description,
    social_image: a.social_image,
    social_image_url: a.social_image_url,
    sources: a.sources,
  };
}

/** What is sent to the API: the form without display-only addresses. */
export function payload(form: Form, original: StaffArticle, confirmSlug: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    headline: form.headline,
    summary: form.summary,
    body_html: form.body_html,
    in_short: form.in_short.map((t) => t.trim()).filter(Boolean),
    why_it_matters: form.why_it_matters,
    category: form.category || null,
    tags: form.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    featured_image: form.featured_image ?? "",
    image_alt: form.image_alt,
    image_caption: form.image_caption,
    image_credit: form.image_credit,
    opportunity_categories: form.opportunity_categories,
    canonical_url: form.canonical_url,
    search_title: form.search_title,
    search_description: form.search_description,
    social_title: form.social_title,
    social_description: form.social_description,
    social_image: form.social_image ?? "",
    sources: form.sources.filter((s) => s.title.trim() || s.url.trim()),
  };
  if (form.slug !== original.slug) {
    body.slug = form.slug;
    if (confirmSlug) body.confirm_slug_change = true;
  }
  if (form.author_id && form.author_id !== original.author?.id) body.author_id = form.author_id;
  return body;
}

export function ArticleEditor({ initial, meta }: { initial: StaffArticle; meta: InsightsMeta }) {
  const router = useRouter();
  const [article, setArticle] = useState(initial);
  const [form, setForm] = useState(() => fromArticle(initial));
  const [saved, setSaved] = useState(() => JSON.stringify(fromArticle(initial)));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [conflict, setConflict] = useState(false);
  const [confirmSlug, setConfirmSlug] = useState(false);
  const [panel, setPanel] = useState<"approve" | "reject" | "return" | null>(null);
  const dirty = JSON.stringify(form) !== saved;
  const can = (action: ArticleAction) => article.actions.includes(action);
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  const adopt = useCallback((fresh: StaffArticle) => {
    setArticle(fresh);
    const next = fromArticle(fresh);
    setForm(next);
    setSaved(JSON.stringify(next));
    setConfirmSlug(false);
  }, []);

  const save = useCallback(
    async (quiet = false): Promise<boolean> => {
      if (!can("save")) return true;
      setBusy("save");
      setErrors({});
      if (!quiet) setMessage(null);
      const result = await apiFetch<StaffArticle>("PATCH", `staff/insights/articles/${article.id}`, {
        ...payload(form, article, confirmSlug),
        expected_row_version: article.row_version,
      });
      setBusy(null);
      if (!result.ok) {
        if (result.code === "state_conflict") setConflict(true);
        setErrors(result.fields);
        setMessage({ tone: "error", text: describeFailure(result) });
        return false;
      }
      adopt(result.data);
      setMessage({ tone: "ok", text: quiet ? "Draft saved automatically." : "Saved." });
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [article, form, confirmSlug, adopt],
  );

  async function act(action: ArticleAction, body?: Record<string, unknown>) {
    if (dirty && !(await save())) return;
    setBusy(action);
    setMessage(null);
    setErrors({});
    const result = await apiFetch<StaffArticle>(
      "POST",
      `staff/insights/articles/${article.id}/actions/${action}`,
      body,
    );
    setBusy(null);
    if (!result.ok) {
      setErrors(result.fields);
      setMessage({ tone: "error", text: describeFailure(result) });
      return;
    }
    adopt(result.data);
    setPanel(null);
    setMessage({ tone: "ok", text: DONE[action] ?? "Done." });
    router.refresh();
  }

  async function place(flags: Record<string, boolean>) {
    setBusy("placement");
    const result = await apiFetch<StaffArticle>(
      "PUT",
      `staff/insights/articles/${article.id}/placement`,
      flags,
    );
    setBusy(null);
    if (!result.ok) return setMessage({ tone: "error", text: describeFailure(result) });
    setArticle((a) => ({ ...a, ...pick(result.data) }));
    setMessage({ tone: "ok", text: "Placement saved." });
  }

  // Ctrl/Cmd+S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  // A warning before leaving the page with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  // Debounced autosave of drafts only (never of an approved or published article: those changes need a decision).
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!dirty || article.status !== "draft" || !can("save") || conflict || busy) return;
    timer.current = setTimeout(() => void save(true), AUTOSAVE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, article.status, conflict, busy]);

  const locked = !can("save");
  const e = (key: string) => errors[key]?.join(" ");
  const ids = useId();

  return (
    <div className="grid gap-4">
      <header className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2 md:-mx-6 md:px-6">
        <Link href="/workspace/insights" className="text-ctl text-accent underline">
          ← Back to Articles
        </Link>
        <StatusBadge tone={TONE[article.status] ?? "neutral"}>{STATUS_LABEL[article.status]}</StatusBadge>
        {article.live ? <StatusBadge tone="success">Live</StatusBadge> : null}
        <span aria-live="polite" className="text-small text-muted" data-testid="save-state">
          {busy === "save" ? "Saving…" : dirty ? "Unsaved changes" : "All changes saved"}
        </span>
        <span className="ml-auto flex flex-wrap gap-2">
          <Link
            href={`/workspace/insights/${article.id}/preview`}
            className="inline-flex min-h-[40px] items-center px-2 text-ctl text-accent underline"
          >
            Preview
          </Link>
          {can("save") ? (
            <Button
              variant="secondary"
              onClick={() => void save()}
              disabled={!!busy}
              aria-busy={busy === "save"}
            >
              Save draft
            </Button>
          ) : null}
          {can("submit") ? (
            <Button onClick={() => void act("submit")} disabled={!!busy}>
              Submit for review
            </Button>
          ) : null}
          {can("publish") ? (
            <Button onClick={() => void act("publish")} disabled={!!busy}>
              Publish
            </Button>
          ) : null}
        </span>
      </header>

      {message ? (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`m-0 rounded-card px-3 py-2 text-ctl ${message.tone === "error" ? "bg-danger-bg text-danger" : "bg-match-bg text-ink"}`}
        >
          {message.text}
          {conflict ? (
            <>
              {" "}
              <button
                type="button"
                className="text-accent underline"
                onClick={() => window.location.reload()}
              >
                Reload the latest version
              </button>{" "}
              (your unsaved text will be lost; copy it first if you need it).
            </>
          ) : null}
        </p>
      ) : null}

      {article.last_review && article.status === "draft" && article.last_review.decision !== "approved" ? (
        <p className="m-0 rounded-card border border-line px-3 py-2 text-ctl" data-testid="review-note">
          <strong>{article.last_review.decision === "rejected" ? "Rejected" : "Returned"}</strong> by{" "}
          {article.last_review.by}: {article.last_review.note}
        </p>
      ) : null}

      <ReviewActions
        article={article}
        meta={meta}
        busy={busy}
        panel={panel}
        setPanel={setPanel}
        onAct={(action, body) => void act(action, body)}
        error={e("checklist") ?? e("note")}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="grid gap-4">
          <Row id="headline" title="Headline" error={e("headline")}>
            <TextInput
              id="headline"
              value={form.headline}
              maxLength={160}
              disabled={locked}
              invalid={!!e("headline")}
              onChange={(ev) => set({ headline: ev.target.value })}
              className="text-title"
            />
          </Row>
          <Row
            id="summary"
            title="Summary"
            hint="One or two plain sentences: what the reader will learn."
            error={e("summary")}
          >
            <Textarea
              id="summary"
              rows={3}
              maxLength={400}
              disabled={locked}
              value={form.summary}
              invalid={!!e("summary")}
              onChange={(ev) => set({ summary: ev.target.value })}
            />
          </Row>
          <div className="grid gap-1">
            <span id={`${ids}-body`} className="text-ctl font-strong">
              Body
            </span>
            {locked ? (
              <div className="insights-prose rounded-control border border-line bg-surface-pale px-4 py-3">
                <ArticleHtml html={article.body_html} />
              </div>
            ) : (
              <ArticleBodyEditor
                id="body"
                labelledBy={`${ids}-body`}
                value={form.body_html}
                invalid={!!e("body_html")}
                onChange={(html) => set({ body_html: html })}
              />
            )}
            {e("body_html") ? (
              <p id="body-error" role="alert" className="m-0 text-small text-danger">
                {e("body_html")}
              </p>
            ) : (
              <p className="m-0 text-small text-muted">
                {article.word_count} words · about {article.reading_minutes} min read (as last saved)
              </p>
            )}
          </div>
          <Section title="Sources and references" open={form.sources.length > 0}>
            <SourcesEditor
              sources={form.sources}
              locked={locked}
              onChange={(sources) => set({ sources })}
              error={e("sources")}
            />
          </Section>
        </div>

        <aside className="grid gap-3" aria-label="Article settings">
          <Section title="Reader Aids" open>
            <TakeawaysEditor
              items={form.in_short}
              locked={locked}
              onChange={(in_short) => set({ in_short })}
              error={e("in_short")}
            />
            <Row id="why" title="Why it matters" optional error={e("why_it_matters")}>
              <Textarea
                id="why"
                rows={3}
                maxLength={600}
                disabled={locked}
                value={form.why_it_matters}
                onChange={(ev) => set({ why_it_matters: ev.target.value })}
              />
            </Row>
          </Section>

          <Section title="Publishing" open>
            <p className="m-0 text-ctl">
              Status: <strong>{STATUS_LABEL[article.status]}</strong>
              {article.approved_by && article.approval_valid ? (
                <> · approved by {article.approved_by.name}</>
              ) : null}
            </p>
            <Row id="category" title="Category" error={e("category")}>
              <Select
                id="category"
                value={form.category}
                disabled={locked}
                invalid={!!e("category")}
                onChange={(ev) => set({ category: ev.target.value })}
              >
                <option value="">Choose a category</option>
                {meta.categories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Row>
            <Row
              id="tags"
              title="Tags"
              optional
              hint="Separate with commas. “CV”, “cv” and “Cv” are one tag."
              error={e("tags")}
            >
              <TextInput
                id="tags"
                value={form.tags}
                disabled={locked}
                onChange={(ev) => set({ tags: ev.target.value })}
              />
            </Row>
            {meta.permissions.publish && meta.writers.length ? (
              <Row id="author" title="Author" error={e("author_id")}>
                <Select
                  id="author"
                  value={form.author_id}
                  disabled={locked}
                  onChange={(ev) => set({ author_id: ev.target.value })}
                >
                  {meta.writers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </Select>
              </Row>
            ) : (
              <p className="m-0 text-ctl">Author: {article.author?.name}</p>
            )}
            <fieldset className="m-0 grid gap-1 border-0 p-0">
              <legend className="mb-1 text-ctl font-strong">Related job categories</legend>
              <p className="m-0 mb-1 text-small text-muted">
                The article is suggested on these opportunity lists and job pages.
              </p>
              {meta.opportunity_categories.map((c) => (
                <Checkbox
                  key={c.code}
                  id={`opp-${c.code}`}
                  label={c.name}
                  disabled={locked}
                  checked={form.opportunity_categories.includes(c.code)}
                  onChange={(ev) =>
                    set({
                      opportunity_categories: ev.target.checked
                        ? [...form.opportunity_categories, c.code]
                        : form.opportunity_categories.filter((x) => x !== c.code),
                    })
                  }
                />
              ))}
            </fieldset>
          </Section>

          <Section title="Featured Image" open={!!form.featured_image}>
            <ImageField
              label="Featured image"
              url={form.featured_image_url}
              locked={locked}
              error={e("featured_image")}
              onPick={(item) =>
                set({ featured_image: item?.name ?? null, featured_image_url: item?.url ?? null })
              }
            />
            <Row
              id="alt"
              title="Alt text"
              hint="Describe what the picture shows; not the headline."
              error={e("image_alt")}
            >
              <TextInput
                id="alt"
                maxLength={250}
                value={form.image_alt}
                disabled={locked}
                onChange={(ev) => set({ image_alt: ev.target.value })}
              />
            </Row>
            <Row id="caption" title="Caption" optional>
              <TextInput
                id="caption"
                maxLength={300}
                value={form.image_caption}
                disabled={locked}
                onChange={(ev) => set({ image_caption: ev.target.value })}
              />
            </Row>
            <Row
              id="credit"
              title="Credit"
              optional
              hint="Who took or owns the picture. Leave empty if unknown."
            >
              <TextInput
                id="credit"
                maxLength={200}
                value={form.image_credit}
                disabled={locked}
                onChange={(ev) => set({ image_credit: ev.target.value })}
              />
            </Row>
          </Section>

          <Section title="Placement and Access" open={false}>
            {can("placement") ? (
              <>
                <Checkbox
                  id="featured"
                  label="Featured article (top of Career Insights)"
                  checked={article.is_featured}
                  disabled={!!busy}
                  onChange={(ev) => void place({ is_featured: ev.target.checked })}
                />
                <Checkbox
                  id="carousel"
                  label="Featured in the homepage carousel"
                  checked={article.is_carousel}
                  disabled={!!busy}
                  onChange={(ev) => void place({ is_carousel: ev.target.checked })}
                />
                <Checkbox
                  id="top"
                  label="Top story (first on the UPNEXT home page)"
                  checked={article.is_top_story}
                  disabled={!!busy}
                  onChange={(ev) => void place({ is_top_story: ev.target.checked })}
                />
              </>
            ) : (
              <p className="m-0 text-small text-muted">
                Placement can be set by an editor once the article is published.
              </p>
            )}
            <p className="m-0 text-small text-muted">All Career Insights articles are free to read.</p>
          </Section>

          <Section title="URL" open={false}>
            <Row
              id="slug"
              title="Address"
              hint={
                article.live
                  ? "This article is public: changing the address redirects the old one."
                  : "Suggested from the headline; change it before publishing."
              }
              error={e("slug")}
            >
              <TextInput
                id="slug"
                value={form.slug}
                disabled={locked}
                onChange={(ev) => set({ slug: ev.target.value })}
              />
            </Row>
            {article.live && form.slug !== article.slug ? (
              <Checkbox
                id="confirm-slug"
                label="Change the public address and redirect the old one"
                checked={confirmSlug}
                onChange={(ev) => setConfirmSlug(ev.target.checked)}
              />
            ) : null}
            <Row
              id="canonical"
              title="Canonical URL"
              optional
              hint="Leave empty: the article's own address is used. Only point elsewhere when this article republishes another."
              error={e("canonical_url")}
            >
              <TextInput
                id="canonical"
                value={form.canonical_url}
                disabled={locked}
                onChange={(ev) => set({ canonical_url: ev.target.value })}
              />
            </Row>
          </Section>

          <Section title="Search & Social" open={false}>
            <Counted
              id="search-title"
              title="Search title"
              value={form.search_title}
              max={meta.limits.search_title ?? 70}
              fallback="the headline"
              locked={locked}
              error={e("search_title")}
              onChange={(v) => set({ search_title: v })}
            />
            <Counted
              id="search-description"
              title="Search description"
              value={form.search_description}
              max={meta.limits.search_description ?? 170}
              fallback="the summary"
              multiline
              locked={locked}
              error={e("search_description")}
              onChange={(v) => set({ search_description: v })}
            />
            <Counted
              id="social-title"
              title="Social title"
              value={form.social_title}
              max={meta.limits.social_title ?? 95}
              fallback="the headline"
              locked={locked}
              error={e("social_title")}
              onChange={(v) => set({ social_title: v })}
            />
            <Counted
              id="social-description"
              title="Social description"
              value={form.social_description}
              max={meta.limits.social_description ?? 200}
              fallback="the summary"
              multiline
              locked={locked}
              error={e("social_description")}
              onChange={(v) => set({ social_description: v })}
            />
            <ImageField
              label="Social image (falls back to the featured image)"
              url={form.social_image_url}
              locked={locked}
              error={e("social_image")}
              onPick={(item) =>
                set({ social_image: item?.name ?? null, social_image_url: item?.url ?? null })
              }
            />
          </Section>

          {can("archive") ? (
            <Section title="Archive" open={false}>
              <p className="m-0 text-small text-muted">
                Archiving takes the article off the site. It can be edited and published again later.
              </p>
              <Button
                variant="secondary"
                disabled={!!busy}
                onClick={() => {
                  if (window.confirm("Take this article off the site?")) void act("archive");
                }}
              >
                Archive article
              </Button>
            </Section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

const DONE: Partial<Record<ArticleAction, string>> = {
  submit: "Submitted for review.",
  start_review: "You are reviewing this article.",
  approve: "Approved. An editor can now publish it.",
  reject: "Rejected and returned to the author.",
  return: "Returned to the author for revision.",
  publish: "Published.",
  archive: "Archived.",
};

function pick(a: StaffArticle) {
  return {
    is_featured: a.is_featured,
    is_carousel: a.is_carousel,
    is_top_story: a.is_top_story,
    row_version: a.row_version,
  };
}

function Section({ title, open, children }: { title: string; open: boolean; children: ReactNode }) {
  return (
    <details open={open} className="rounded-card border border-line bg-surface">
      <summary className="flex min-h-[44px] cursor-pointer items-center px-3 text-ctl font-strong">
        {title}
      </summary>
      <div className="grid gap-3 border-t border-line px-3 py-3">{children}</div>
    </details>
  );
}

function Counted(props: {
  id: string;
  title: string;
  value: string;
  max: number;
  fallback: string;
  multiline?: boolean;
  locked: boolean;
  error?: string;
  onChange: (v: string) => void;
}) {
  const left = props.max - props.value.length;
  const hint = `${props.value.length}/${props.max} characters. Empty uses ${props.fallback}.`;
  return (
    <Row id={props.id} title={props.title} optional hint={hint} error={props.error}>
      {props.multiline ? (
        <Textarea
          id={props.id}
          rows={3}
          maxLength={props.max}
          disabled={props.locked}
          value={props.value}
          onChange={(ev) => props.onChange(ev.target.value)}
          aria-describedby={`${props.id}-hint`}
        />
      ) : (
        <TextInput
          id={props.id}
          maxLength={props.max}
          disabled={props.locked}
          value={props.value}
          onChange={(ev) => props.onChange(ev.target.value)}
          aria-describedby={`${props.id}-hint`}
        />
      )}
      {left < 10 ? (
        <span className="sr-only" aria-live="polite">
          {left} characters left
        </span>
      ) : null}
    </Row>
  );
}

function ImageField({
  label,
  url,
  locked,
  error,
  onPick,
}: {
  label: string;
  url: string | null;
  locked: boolean;
  error?: string;
  onPick: (item: MediaItem | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="grid gap-2">
      <span className="text-ctl font-strong">{label}</span>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          className="max-h-[160px] w-auto rounded-control border border-line object-contain"
        />
      ) : (
        <p className="m-0 text-small text-muted">No picture chosen.</p>
      )}
      {url ? <p className="m-0 break-all text-small text-muted">Image URL: {url}</p> : null}
      {!locked ? (
        <span className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setOpen(true)}>
            Browse or upload
          </Button>
          {url ? (
            <Button variant="secondary" onClick={() => onPick(null)}>
              Remove
            </Button>
          ) : null}
        </span>
      ) : null}
      {error ? (
        <p role="alert" className="m-0 text-small text-danger">
          {error}
        </p>
      ) : null}
      <MediaDialog
        open={open}
        onClose={() => setOpen(false)}
        onUse={(item) => {
          setOpen(false);
          onPick(item);
        }}
      />
    </div>
  );
}

function TakeawaysEditor({
  items,
  locked,
  onChange,
  error,
}: {
  items: string[];
  locked: boolean;
  onChange: (items: string[]) => void;
  error?: string;
}) {
  return (
    <fieldset className="m-0 grid gap-2 border-0 p-0">
      <legend className="mb-1 text-ctl font-strong">
        In short <span className="font-light text-muted">(optional, up to 6 takeaways)</span>
      </legend>
      {items.map((item, i) => (
        <span key={i} className="flex gap-2">
          <TextInput
            id={`takeaway-${i}`}
            aria-label={`Takeaway ${i + 1}`}
            maxLength={200}
            value={item}
            disabled={locked}
            onChange={(ev) => onChange(items.map((x, j) => (j === i ? ev.target.value : x)))}
          />
          {!locked ? (
            <Button
              variant="secondary"
              aria-label={`Remove takeaway ${i + 1}`}
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            >
              ✕
            </Button>
          ) : null}
        </span>
      ))}
      {!locked && items.length < 6 ? (
        <Button variant="secondary" onClick={() => onChange([...items, ""])}>
          Add a takeaway
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="m-0 text-small text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

function SourcesEditor({
  sources,
  locked,
  onChange,
  error,
}: {
  sources: ArticleSource[];
  locked: boolean;
  onChange: (sources: ArticleSource[]) => void;
  error?: string;
}) {
  const update = (i: number, patch: Partial<ArticleSource>) =>
    onChange(sources.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  return (
    <div className="grid gap-3">
      <p className="m-0 text-small text-muted">
        Every fact from outside UPNEXT needs its source. Use the original publisher, not a repost.
      </p>
      {sources.map((s, i) => (
        <fieldset key={i} className="m-0 grid gap-2 rounded-card border border-line p-3 sm:grid-cols-2">
          <legend className="px-1 text-small font-strong">Source {i + 1}</legend>
          <Row id={`src-title-${i}`} title="Title">
            <TextInput
              id={`src-title-${i}`}
              value={s.title}
              disabled={locked}
              onChange={(ev) => update(i, { title: ev.target.value })}
            />
          </Row>
          <Row id={`src-pub-${i}`} title="Organisation or publisher" optional>
            <TextInput
              id={`src-pub-${i}`}
              value={s.publisher}
              disabled={locked}
              onChange={(ev) => update(i, { publisher: ev.target.value })}
            />
          </Row>
          <Row id={`src-url-${i}`} title="URL (https)" optional className="sm:col-span-2">
            <TextInput
              id={`src-url-${i}`}
              type="url"
              value={s.url}
              disabled={locked}
              onChange={(ev) => update(i, { url: ev.target.value })}
            />
          </Row>
          <Row id={`src-pubdate-${i}`} title="Published" optional>
            <TextInput
              id={`src-pubdate-${i}`}
              type="date"
              value={s.published_on ?? ""}
              disabled={locked}
              onChange={(ev) => update(i, { published_on: ev.target.value || null })}
            />
          </Row>
          <Row id={`src-accessed-${i}`} title="Accessed" optional>
            <TextInput
              id={`src-accessed-${i}`}
              type="date"
              value={s.accessed_on ?? ""}
              disabled={locked}
              onChange={(ev) => update(i, { accessed_on: ev.target.value || null })}
            />
          </Row>
          {!locked ? (
            <Button
              variant="secondary"
              className="sm:col-span-2"
              onClick={() => onChange(sources.filter((_, j) => j !== i))}
            >
              Remove source {i + 1}
            </Button>
          ) : null}
        </fieldset>
      ))}
      {!locked && sources.length < 20 ? (
        <Button
          variant="secondary"
          onClick={() =>
            onChange([
              ...sources,
              { title: "", publisher: "", url: "", published_on: null, accessed_on: null },
            ])
          }
        >
          Add a source
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="m-0 text-small text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ReviewActions({
  article,
  meta,
  busy,
  panel,
  setPanel,
  onAct,
  error,
}: {
  article: StaffArticle;
  meta: InsightsMeta;
  busy: string | null;
  panel: "approve" | "reject" | "return" | null;
  setPanel: (p: "approve" | "reject" | "return" | null) => void;
  onAct: (action: ArticleAction, body?: Record<string, unknown>) => void;
  error?: string;
}) {
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const allChecked = useMemo(() => meta.checklist.every((c) => checks[c.key]), [checks, meta.checklist]);
  const has = (a: ArticleAction) => article.actions.includes(a);
  if (!has("start_review") && !has("approve")) return null;
  return (
    <section
      aria-labelledby="review-title"
      className="rounded-card border border-line bg-surface-pale px-3 py-3"
    >
      <h2 id="review-title" className="m-0 mb-2 text-ctl font-strong">
        Editorial review
      </h2>
      <span className="flex flex-wrap gap-2">
        {has("start_review") ? (
          <Button variant="secondary" disabled={!!busy} onClick={() => onAct("start_review")}>
            Start review
          </Button>
        ) : null}
        {has("approve") ? (
          <Button variant="secondary" onClick={() => setPanel(panel === "approve" ? null : "approve")}>
            Approve…
          </Button>
        ) : null}
        {has("return") ? (
          <Button variant="secondary" onClick={() => setPanel(panel === "return" ? null : "return")}>
            Return for revision…
          </Button>
        ) : null}
        {has("reject") ? (
          <Button variant="secondary" onClick={() => setPanel(panel === "reject" ? null : "reject")}>
            Reject…
          </Button>
        ) : null}
      </span>
      {panel === "approve" ? (
        <form
          className="mt-3 grid gap-2"
          onSubmit={(ev) => {
            ev.preventDefault();
            onAct("approve", { checklist: checks, note });
          }}
        >
          <fieldset className="m-0 grid gap-1 border-0 p-0">
            <legend className="mb-1 text-ctl font-strong">Confirm every item before approving</legend>
            {meta.checklist.map((c) => (
              <Checkbox
                key={c.key}
                id={`check-${c.key}`}
                label={c.label}
                checked={!!checks[c.key]}
                onChange={(ev) => setChecks({ ...checks, [c.key]: ev.target.checked })}
              />
            ))}
          </fieldset>
          <Row id="approve-note" title="Note for the record" optional>
            <Textarea id="approve-note" rows={2} value={note} onChange={(ev) => setNote(ev.target.value)} />
          </Row>
          <Button type="submit" disabled={!allChecked || !!busy}>
            Approve this version
          </Button>
        </form>
      ) : null}
      {panel === "reject" || panel === "return" ? (
        <form
          className="mt-3 grid gap-2"
          onSubmit={(ev) => {
            ev.preventDefault();
            onAct(panel, { note });
          }}
        >
          <Row
            id="send-back-note"
            title={panel === "reject" ? "Why is it rejected?" : "What needs to change?"}
          >
            <Textarea
              id="send-back-note"
              rows={3}
              required
              value={note}
              onChange={(ev) => setNote(ev.target.value)}
            />
          </Row>
          <Button type="submit" disabled={!note.trim() || !!busy}>
            {panel === "reject" ? "Reject" : "Return to the author"}
          </Button>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="m-0 mt-2 text-small text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
