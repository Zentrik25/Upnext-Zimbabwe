"use client";

import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui";
import { csrfToken } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { MediaDialog } from "./media-dialog";

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Where a stored picture is served from (same origin: the proxy serves `/media/`). */
export const mediaUrl = (name: string): string => `/media/${name}`;

export type UploadResult = {
  name: string;
  url: string;
  width: number;
  height: number;
  bytes: number;
  /** True when the same picture was already in the library and nothing new was stored. */
  reused?: boolean;
};

/** The mistakes that can be caught before anything is sent. The server checks the real content again. */
export function precheck(file: { type: string; size: number }): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return "Use a JPEG, PNG or WebP image.";
  if (file.size > MAX_IMAGE_BYTES) return "The image is larger than 5 MB. Choose a smaller one.";
  if (file.size === 0) return "That file is empty.";
  return null;
}

/** POST the file with progress (fetch cannot report upload progress). Resolves to the stored picture or a message. */
export async function uploadImage(
  file: File,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<{ ok: true; image: UploadResult } | { ok: false; message: string }> {
  const token = await csrfToken();
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    const body = new FormData();
    body.append("file", file);
    xhr.open("POST", "/api/v1/staff/media");
    xhr.setRequestHeader("X-CSRFToken", token);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.withCredentials = true;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onerror = () =>
      resolve({ ok: false, message: "The upload did not go through. Check your connection and try again." });
    xhr.onabort = () => resolve({ ok: false, message: "The upload was cancelled." });
    xhr.onload = () => {
      let parsed: { error?: { message?: string } } & Partial<UploadResult> = {};
      try {
        parsed = JSON.parse(xhr.responseText) as typeof parsed;
      } catch {
        /* a non-JSON answer from a proxy */
      }
      if ((xhr.status === 201 || xhr.status === 200) && parsed.name)
        return resolve({ ok: true, image: parsed as UploadResult });
      if (xhr.status === 413)
        return resolve({ ok: false, message: "The image is larger than 5 MB. Choose a smaller one." });
      if (xhr.status === 429)
        return resolve({ ok: false, message: "Too many uploads. Wait a few minutes and try again." });
      if (xhr.status === 403)
        return resolve({ ok: false, message: "You do not have permission to upload images." });
      resolve({ ok: false, message: parsed.error?.message || "The image could not be uploaded. Try again." });
    };
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(body);
  });
}

/**
 * One picture slot: choose a file (the phone's gallery or camera roll too), drop one on desktop, see the preview
 * at once, replace or remove it. The file is uploaded to the Media Library as soon as it is chosen; the editor
 * then saves the stored name with the draft like any other field, so an upload that is never saved leaves
 * nothing attached. With `library`, the slot offers "Choose from Library | Upload New": a picture already in the
 * library is reused by name, and removing it from this listing never deletes it from the library.
 */
export function ImageUpload({
  id,
  value,
  onChange,
  alt,
  onAltChange,
  ratio = "16 / 9",
  buttonLabel = "Upload image",
  describedBy,
  error,
  library = false,
  libraryLabel = "Choose from Library",
}: {
  id: string;
  /** The stored name ("" for none). */
  value: string;
  onChange: (name: string) => void;
  /** When given, a description input is shown for the picture (screen readers and failed loads). */
  alt?: string;
  onAltChange?: (alt: string) => void;
  ratio?: string;
  buttonLabel?: string;
  describedBy?: string;
  error?: string;
  /** Offer the Media Library beside the upload. */
  library?: boolean;
  libraryLabel?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const status = useId();
  const [local, setLocal] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = progress !== null;
  const shown = local ?? (value ? mediaUrl(value) : null);

  // Leaving the page cancels an upload in flight; a preview address is released when it is replaced.
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => () => (local ? URL.revokeObjectURL(local) : undefined), [local]);

  async function take(file: File | undefined) {
    if (!file || busy) return;
    const early = precheck(file);
    if (early) return setProblem(early);
    setProblem(null);
    setNotice(null);
    setConfirming(false);
    setLocal(URL.createObjectURL(file));
    setProgress(0);
    abort.current = new AbortController();
    const result = await uploadImage(file, setProgress, abort.current.signal);
    setProgress(null);
    if (result.ok) {
      if (result.image.reused)
        setNotice("That picture was already in the library, so the existing one is used.");
      onChange(result.image.name);
    } else {
      setProblem(result.message);
    }
    setLocal(null);
    if (input.current) input.current.value = "";
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    setOver(false);
    void take(event.dataTransfer.files[0]);
  }

  return (
    <div className="grid gap-2">
      <div
        onDragOver={(ev) => {
          ev.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        style={{ aspectRatio: ratio }}
        className={cn(
          "relative grid w-full max-w-[480px] place-items-center overflow-hidden rounded-card border bg-surface-pale",
          shown ? "border-border-panel" : "border-dashed border-border-strong",
          over && "border-accent bg-accent/5",
          error || problem ? "border-danger" : "",
        )}
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- a staff preview of a just-uploaded file
          <img
            src={shown}
            alt={alt || "Selected featured image preview"}
            className={cn("h-full w-full object-cover", busy && "opacity-60")}
          />
        ) : (
          <p className="m-0 max-w-[30ch] px-3 text-center text-ctl text-muted">
            {library
              ? "Choose a picture from the library, or upload a new one."
              : "Drop an image here, or use the button."}
            <span className="mt-1 block text-small">JPEG, PNG or WebP, up to 5 MB</span>
          </p>
        )}
        {busy ? (
          <div className="absolute inset-x-0 bottom-0 bg-surface/90 px-3 py-2">
            <div
              role="progressbar"
              aria-label="Upload progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress ?? 0}
              className="h-1 w-full overflow-hidden rounded-control bg-line"
            >
              <div className="h-full bg-accent transition-[width]" style={{ width: `${progress ?? 0}%` }} />
            </div>
            <p className="m-0 mt-1 text-small text-muted">Uploading… {progress}%</p>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(ev) => void take(ev.target.files?.[0])}
        />
        {library ? (
          <Button
            id={id}
            variant="secondary"
            disabled={busy}
            aria-haspopup="dialog"
            aria-describedby={[describedBy, status].filter(Boolean).join(" ") || undefined}
            onClick={() => setBrowsing(true)}
          >
            {libraryLabel}
          </Button>
        ) : null}
        <Button
          id={library ? undefined : id}
          variant="secondary"
          disabled={busy}
          aria-describedby={[describedBy, status].filter(Boolean).join(" ") || undefined}
          onClick={() => input.current?.click()}
        >
          {library ? "Upload New" : value || local ? "Replace image" : buttonLabel}
        </Button>
        {busy ? (
          <Button variant="secondary" onClick={() => abort.current?.abort()}>
            Cancel
          </Button>
        ) : null}
        {value && !busy ? (
          confirming ? (
            <>
              <span className="text-ctl text-muted">
                Remove this image?{library ? " It stays in the library." : ""}
              </span>
              <Button
                variant="secondary"
                onClick={() => {
                  setConfirming(false);
                  onChange("");
                }}
              >
                Yes, remove
              </Button>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Keep it
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setConfirming(true)}>
              Remove
            </Button>
          )
        ) : null}
      </div>

      <p
        id={status}
        role="status"
        aria-live="polite"
        className={cn("m-0 text-small", problem ? "text-danger" : "text-muted")}
      >
        {problem ? (
          <>
            <span className="font-strong">Error:</span> {problem}
          </>
        ) : busy ? (
          "Uploading the image."
        ) : notice ? (
          notice
        ) : value ? (
          "The image is saved with the draft."
        ) : (
          ""
        )}
      </p>

      {onAltChange && value ? (
        <label className="grid gap-1 text-ctl">
          <span className="font-medium text-check-text">
            Image description <span className="font-light text-muted">(optional)</span>
          </span>
          <input
            type="text"
            value={alt ?? ""}
            maxLength={125}
            onChange={(ev) => onAltChange(ev.target.value)}
            className="min-h-control w-full max-w-[480px] rounded-control border border-border-strong bg-surface px-3 py-2 text-base text-ink"
          />
          <span className="text-small text-muted">
            Describe what the picture shows, for people who cannot see it. Do not claim anything the listing
            does not say.
          </span>
        </label>
      ) : null}
      {library ? (
        <MediaDialog
          open={browsing}
          onClose={() => setBrowsing(false)}
          currentName={value || undefined}
          onUse={(item) => {
            setProblem(null);
            setNotice(null);
            onChange(item.name);
          }}
        />
      ) : null}
    </div>
  );
}
