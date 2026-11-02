"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui";
import { MediaBrowser } from "./media-browser";
import { precheck, uploadImage } from "./image-upload";

/**
 * The Media Library page: upload pictures (one or several), then browse, search and preview them. A picture is
 * attached to a listing from the job editor ("Choose from Library"); here it can be seen and checked for use.
 */
export function MediaLibrary() {
  const input = useRef<HTMLInputElement>(null);
  const [refresh, setRefresh] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [problems, setProblems] = useState<string[]>([]);

  async function take(files: FileList | null) {
    if (!files?.length || progress !== null) return;
    const done: string[] = [];
    const failed: string[] = [];
    for (const file of Array.from(files)) {
      const early = precheck(file);
      if (early) {
        failed.push(`${file.name}: ${early}`);
        continue;
      }
      setProgress(0);
      const result = await uploadImage(file, setProgress);
      if (result.ok)
        done.push(result.image.reused ? `${file.name} was already in the library.` : `${file.name} added.`);
      else failed.push(`${file.name}: ${result.message}`);
    }
    setProgress(null);
    setMessages(done);
    setProblems(failed);
    if (input.current) input.current.value = "";
    if (done.length) setRefresh((n) => n + 1);
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-card border border-border-panel p-3">
        <input
          ref={input}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => void take(event.target.files)}
        />
        <Button disabled={progress !== null} onClick={() => input.current?.click()}>
          {progress === null ? "Upload images" : `Uploading… ${progress}%`}
        </Button>
        <p className="m-0 text-small text-muted">
          JPEG, PNG or WebP, up to 5 MB each. A picture already in the library is not stored twice.
        </p>
      </div>
      <div role="status" aria-live="polite" className="grid gap-1">
        {messages.map((m) => (
          <p key={m} className="m-0 text-ctl text-muted">
            {m}
          </p>
        ))}
        {problems.map((p) => (
          <p key={p} role="alert" className="m-0 text-ctl text-danger">
            <span className="font-strong">Error:</span> {p}
          </p>
        ))}
      </div>
      <MediaBrowser refreshKey={refresh} />
    </div>
  );
}
