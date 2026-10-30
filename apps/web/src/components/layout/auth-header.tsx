import Link from "next/link";
import { Logo } from "@/components/ui";
import { BRAND } from "@/lib/brand";

/** The only chrome on sign-in and registration (as on Stripe's own sign-in): the logo on a hairline-bottomed bar.
 *  No menu, footer or tab bar, so the whole form fits one screen, phone included. */
export function AuthHeader() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex min-h-[48px] w-full max-w-page items-center px-6 max-sm:px-4">
        <Link href="/" aria-label={`${BRAND.name} home`} className="inline-flex min-h-[44px] items-center">
          <Logo />
        </Link>
      </div>
    </header>
  );
}
