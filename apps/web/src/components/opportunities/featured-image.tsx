"use client";

import { useRef } from "react";

function Glyph({ d }: { d: string }) {
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
      className="h-4 w-4"
    >
      <path d={d} />
    </svg>
  );
}

/**
 * The listing's featured picture, compact: 160px high on a phone and 200px from the tablet width up, in the
 * picture's own proportions (16:9 as uploaded). It is never stretched or cropped: a picture of another shape is
 * shown whole inside the box. Tap or click opens the whole picture in a viewer (a native modal dialog: focus is
 * kept inside, Escape and a click outside close it, and focus returns to the picture).
 */
export function FeaturedImage({ src, alt }: { src: string; alt: string | null }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const name = alt?.trim() ? `View full image: ${alt.trim()}` : "View full image";
  return (
    <figure className="m-0 mt-3" data-testid="featured-image">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={name}
        title="View full image"
        onClick={() => dialog.current?.showModal()}
        className="group relative block aspect-video h-[160px] max-w-full cursor-zoom-in overflow-hidden rounded-card border border-line bg-surface-pale p-0 sm:h-[200px]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- the listing's own picture from our media path */}
        <img
          src={src}
          alt={alt || ""}
          width={1280}
          height={720}
          fetchPriority="high"
          className="block h-full w-full object-contain"
        />
        <span
          aria-hidden="true"
          className="absolute right-1 bottom-1 grid h-7 w-7 place-items-center rounded-control border border-line bg-surface text-ink"
        >
          <Glyph d="M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5" />
        </span>
      </button>
      <dialog
        ref={dialog}
        aria-label={alt?.trim() || "Featured image"}
        data-testid="image-viewer"
        className="m-auto max-h-[96vh] w-auto max-w-[96vw] overflow-hidden rounded-card border border-line bg-surface p-0 backdrop:bg-ink/70"
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close(); // a click on the backdrop
        }}
      >
        <div className="relative">
          <button
            type="button"
            autoFocus
            aria-label="Close image"
            onClick={() => dialog.current?.close()}
            className="absolute top-2 right-2 grid h-11 w-11 cursor-pointer place-items-center rounded-control border border-line bg-surface text-ink hover:bg-surface-pale"
          >
            <Glyph d="M6 6l12 12M18 6 6 18" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- the same picture, shown whole */}
          <img
            src={src}
            alt={alt || ""}
            loading="lazy"
            className="block max-h-[96vh] w-auto max-w-[96vw] object-contain"
          />
        </div>
      </dialog>
    </figure>
  );
}
