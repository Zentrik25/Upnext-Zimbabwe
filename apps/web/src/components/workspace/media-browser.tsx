"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, TextInput } from "@/components/ui";
import { SkeletonMediaGrid } from "./skeleton-media";
import { apiFetch, describeFailure } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import type { MediaItem } from "@/lib/staff-types";
import { dateText } from "./badges";
import { mediaUrl } from "./image-upload";

type PageInfo = { page: number; page_size: number; total: number; pages: number };
type Listing = { data: MediaItem[]; page: PageInfo };

const kilobytes = (bytes: number | null) =>
  bytes === null
    ? "-"
    : bytes >= 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
      : `${Math.round(bytes / 1024)} KB`;

/**
 * Browse and search the Media Library. With `onUse` it is a picker (choose a picture, see it large, press
 * "Use this image"); without it, it is the library page, where a picture can be previewed and its details read.
 * `refreshKey` reloads the list after an upload made elsewhere on the page.
 */
export function MediaBrowser({
  onUse,
  currentName,
  refreshKey = 0,
  pageSize = 24,
}: {
  onUse?: (item: MediaItem) => void;
  /** The picture the listing uses now, marked in the grid. */
  currentName?: string;
  refreshKey?: number;
  pageSize?: number;
}) {
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");
  // What the last answer said, and which search and refresh it answered; a different key means "still loading".
  const [view, setView] = useState<{
    key: string;
    items: MediaItem[];
    info: PageInfo | null;
    problem: string | null;
  } | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const [chosen, setChosen] = useState<MediaItem | null>(null);
  const [retry, setRetry] = useState(0);
  const key = `${query}|${refreshKey}|${retry}`;

  // Typing waits a moment before it searches, so each key press is not a request.
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(term.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [term]);

  const path = useCallback(
    (page: number) => {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (query) params.set("q", query);
      return `staff/media?${params.toString()}`;
    },
    [query, pageSize],
  );

  // Every state change here happens when an answer arrives; an answer to an older search is dropped.
  useEffect(() => {
    let current = true;
    void apiFetch<Listing>("GET", path(1)).then((result) => {
      if (!current) return;
      setView(
        result.ok
          ? { key, items: result.data.data, info: result.data.page, problem: null }
          : { key, items: [], info: null, problem: describeFailure(result) },
      );
    });
    return () => {
      current = false;
    };
  }, [key, path]);

  async function showMore() {
    if (!view?.info) return;
    setMoreBusy(true);
    const result = await apiFetch<Listing>("GET", path(view.info.page + 1));
    setMoreBusy(false);
    setView((now) =>
      now && result.ok
        ? { ...now, items: [...now.items, ...result.data.data], info: result.data.page }
        : now && { ...now, problem: result.ok ? null : describeFailure(result) },
    );
  }

  const loading = view?.key !== key;
  const items = view?.items ?? [];
  const info = view?.info ?? null;
  const problem = view?.problem ?? null;
  const shown = chosen;
  const more = info !== null && info.page < info.pages;

  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_260px]">
      <div className="grid content-start gap-3">
        <div className="grid gap-1">
          <label htmlFor="media-search" className="text-ctl font-medium text-check-text">
            Search the library
          </label>
          <TextInput
            id="media-search"
            type="search"
            value={term}
            placeholder="Title or file name"
            onChange={(event) => setTerm(event.target.value)}
          />
        </div>

        {problem ? (
          <p role="alert" className="m-0 text-ctl text-danger">
            <span className="font-strong">Error:</span> {problem}{" "}
            <Button variant="secondary" onClick={() => setRetry((n) => n + 1)}>
              Try again
            </Button>
          </p>
        ) : null}

        {loading && !view ? (
          <SkeletonMediaGrid />
        ) : items.length ? (
          <>
            <ul
              className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-4"
              aria-label="Pictures in the library"
            >
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setChosen(item)}
                    aria-pressed={shown?.id === item.id}
                    aria-label={`${item.title || item.original_filename}${currentName === item.name ? " (in use on this listing)" : ""}`}
                    className={cn(
                      "grid w-full cursor-pointer gap-1 rounded-card border bg-surface p-1 text-left hover:bg-accent/5",
                      shown?.id === item.id ? "border-accent ring-1 ring-accent" : "border-border-panel",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- a small staff thumbnail of an uploaded file */}
                    <img
                      src={mediaUrl(item.thumb)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="block aspect-[16/10] w-full rounded-control bg-surface-pale object-cover"
                    />
                    <span className="truncate px-1 text-small text-ink">
                      {item.title || item.original_filename}
                    </span>
                    {currentName === item.name ? (
                      <span className="px-1 text-small text-accent">In use here</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
            <p className="m-0 text-small text-muted" role="status">
              Showing {items.length} of {info?.total ?? items.length}
            </p>
            {more ? (
              <div>
                <Button variant="secondary" disabled={moreBusy} onClick={() => void showMore()}>
                  {moreBusy ? "Loading…" : "Show more"}
                </Button>
              </div>
            ) : null}
          </>
        ) : !problem ? (
          <p className="m-0 text-ctl text-muted">
            {query
              ? `Nothing in the library matches “${query}”.`
              : "The library is empty. Upload the first picture."}
          </p>
        ) : null}
      </div>

      <aside
        aria-label="Preview"
        className="grid content-start gap-2 rounded-card border border-border-panel p-2"
      >
        {shown ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- a staff preview of an uploaded file */}
            <img
              src={mediaUrl(shown.name)}
              alt={shown.title || "Selected picture"}
              className="block aspect-[16/10] w-full rounded-control bg-surface-pale object-cover"
            />
            <p className="m-0 text-base font-medium [overflow-wrap:anywhere]">{shown.title || "Untitled"}</p>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-small text-muted">
              <dt>Size</dt>
              <dd className="m-0">
                {shown.width && shown.height ? `${shown.width} × ${shown.height}` : "-"},{" "}
                {kilobytes(shown.bytes)}
              </dd>
              <dt>Added</dt>
              <dd className="m-0">
                {dateText(shown.created_at)}
                {shown.uploaded_by ? ` by ${shown.uploaded_by}` : ""}
              </dd>
              <dt>Used by</dt>
              <dd className="m-0">
                {shown.used_in === null
                  ? "-"
                  : shown.used_in === 1
                    ? "1 listing"
                    : `${shown.used_in} listings`}
              </dd>
            </dl>
            {onUse ? <Button onClick={() => onUse(shown)}>Use this image</Button> : null}
          </>
        ) : (
          <p className="m-0 text-ctl text-muted">Select a picture to preview it.</p>
        )}
      </aside>
    </div>
  );
}
