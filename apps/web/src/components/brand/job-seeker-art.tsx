import { cn } from "@/lib/cn";

/** Decorative illustration (supplied by the owner, 2026-10-29): transparent background so it sits directly on the
 *  page, never in a box. A plain image on purpose: `next/image` writes an inline style attribute, which the
 *  staff-grade Content-Security-Policy (nonce-only styles) blocks. 39 KB WebP; the text around it carries the
 *  meaning. */
export function JobSeekerArt({ className, priority = false }: { className?: string; priority?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/illustrations/job-seeker.webp"
      alt=""
      width={640}
      height={467}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
      className={cn("block h-auto w-full", className)}
    />
  );
}
