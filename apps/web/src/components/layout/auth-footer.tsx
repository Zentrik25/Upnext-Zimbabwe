import Link from "next/link";
import { BRAND } from "@/lib/brand";

/** One slim line under the one-screen forms: the page's footer landmark, with the two legal documents. */
export function AuthFooter() {
  const link = "inline-flex min-h-[24px] items-center";
  return (
    <footer className="border-t border-line bg-surface text-small text-muted">
      <div className="mx-auto flex min-h-[32px] w-full max-w-page flex-wrap items-center justify-between gap-x-4 px-6 max-sm:px-4">
        <p>
          © {new Date().getFullYear()} {BRAND.name}
        </p>
        <nav aria-label="Legal" className="flex gap-4">
          <Link href="/terms" className={link}>
            Terms
          </Link>
          <Link href="/privacy" className={link}>
            Privacy
          </Link>
        </nav>
      </div>
    </footer>
  );
}
