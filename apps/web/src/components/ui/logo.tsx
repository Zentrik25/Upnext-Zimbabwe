import { cn } from "@/lib/cn";

/** Wordmark: "upnext" with an accent-coloured full stop (reference header). */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("text-logo font-logo tracking-logo", className)}>
      upnext<span className="text-accent">.</span>
    </span>
  );
}
