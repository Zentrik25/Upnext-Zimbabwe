import { NavLogo } from "@/components/brand/logo";
import { cn } from "@/lib/cn";

/** The navigation logo: the UN monogram and UPNEXT. The name for assistive technology is "UPNEXT Careers". */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      <NavLogo className="h-[26px] w-auto" />
      <span className="sr-only">UPNEXT Careers</span>
    </span>
  );
}
