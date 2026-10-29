import { cn } from "@/lib/cn";

const SOURCES = {
  hero: { src: "/illustrations/job-seeker.webp", width: 560, height: 409 },
  form: { src: "/illustrations/job-seeker-form.webp", width: 320, height: 234 },
} as const;

/** Decorative illustration (supplied by the owner, 2026-10-29): transparent background so it sits directly on the
 *  page, never in a box. A plain image on purpose: `next/image` writes an inline style attribute, which the
 *  nonce-only Content-Security-Policy blocks. Two sizes keep the mobile transfer budget (P5-08): the hero version
 *  is 22 KB, the form version 12 KB. The text around it carries the meaning. */
export function JobSeekerArt({
  className,
  priority = false,
  size = "hero",
}: {
  className?: string;
  priority?: boolean;
  size?: keyof typeof SOURCES;
}) {
  const { src, width, height } = SOURCES[size];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={width}
      height={height}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
      className={cn("block h-auto w-full", className)}
    />
  );
}
