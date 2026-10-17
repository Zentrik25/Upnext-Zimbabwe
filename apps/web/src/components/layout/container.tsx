import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** Page-width container: 1190px max, 24px gutters (14px on narrow screens). */
export function Container({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mx-auto w-full max-w-page px-6 max-sm:px-[14px]", className)} {...props} />;
}
