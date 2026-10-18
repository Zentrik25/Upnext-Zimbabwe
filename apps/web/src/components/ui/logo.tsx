import { cn } from "@/lib/cn";

/** Wordmark: "nextjob" with an accent-coloured full stop (same form as the approved reference header). */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("text-logo font-logo tracking-logo", className)}>
      nextjob<span className="text-accent">.</span>
    </span>
  );
}
