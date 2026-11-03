"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Logo } from "@/components/ui";
import { Icon, type IconName } from "@/components/ui/icons";
import { SignOutButton } from "@/components/account/sign-out-button";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/cn";

export type MenuItem = { href: string; label: string; icon: IconName };

/** Below the `sm` breakpoint (650px) the header shows only the logo and a menu button; everything the header bar
 * holds on a wider screen is inside the full-screen menu this opens. */
const PHONE_QUERY = "(max-width: 650px)";
const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      {open ? (
        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      ) : (
        <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      )}
    </svg>
  );
}

/** `groups` are shown in order with a thin rule between them. */
export function MobileMenu({ groups, signedIn }: { groups: MenuItem[][]; signedIn: boolean }) {
  // The menu is open for one page only: navigating (or any change of address) closes it without an effect.
  const pathname = usePathname();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const close = useCallback((returnFocus = true) => {
    setOpenAt(null);
    if (returnFocus) button.current?.focus();
  }, []);

  // Close if the window becomes wide enough for the normal header bar (rotation, resize).
  useEffect(() => {
    const query = window.matchMedia(PHONE_QUERY);
    const onChange = () => {
      if (!query.matches) setOpenAt(null);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // Lock page scroll while open, move focus into the menu, and keep Tab inside it.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("[data-menu-close]")?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;
      const nodes = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      root.style.overflow = previous;
    };
  }, [open, close]);

  const row = "flex min-h-[52px] items-center gap-4 rounded-control px-4 text-base";

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpenAt(pathname)}
        className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-control bg-match-bg text-ink sm:hidden"
        data-testid="menu-button"
      >
        <MenuIcon open={false} />
      </button>
      {open
        ? createPortal(
            <div
              id="mobile-menu"
              ref={panel}
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-surface text-ink sm:hidden"
              data-testid="menu-panel"
            >
              <div className="flex min-h-[56px] items-center justify-between px-[16px] pt-2">
                <Link
                  href="/"
                  aria-label={`${BRAND.name} home`}
                  className="inline-flex min-h-[44px] items-center"
                  onClick={() => close(false)}
                >
                  <Logo />
                </Link>
                <button
                  type="button"
                  data-menu-close
                  aria-label="Close menu"
                  onClick={() => close()}
                  className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-control bg-match-bg text-ink"
                >
                  <MenuIcon open />
                </button>
              </div>
              <nav aria-label="Menu" className="mt-4 px-[16px]">
                {groups.map((group, index) => (
                  <ul
                    key={index}
                    className={cn("m-0 list-none p-0", index > 0 && "mt-2 border-t border-line pt-2")}
                  >
                    {group.map((item) => {
                      const current = pathname === item.href;
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            aria-current={current ? "page" : undefined}
                            className={cn(
                              row,
                              current ? "bg-match-bg text-accent" : "text-ink hover:bg-row-hover",
                            )}
                            onClick={() => close(false)}
                          >
                            <Icon
                              name={item.icon}
                              className="h-6 w-6 shrink-0"
                              {...(current ? { fill: "currentColor" } : {})}
                            />
                            {item.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ))}
              </nav>
              <div className="mt-auto grid grid-cols-2 gap-3 px-[16px] pt-8 pb-[max(24px,env(safe-area-inset-bottom))]">
                {signedIn ? (
                  <div className="col-span-2">
                    <SignOutButton variant="secondary" />
                  </div>
                ) : (
                  <>
                    <Link
                      href="/register"
                      onClick={() => close(false)}
                      className={cn(
                        "inline-flex min-h-[48px] items-center justify-center rounded-control border border-accent-solid bg-accent-solid px-3 text-ctl font-medium text-on-accent hover:border-accent-solid-hover hover:bg-accent-solid-hover",
                      )}
                    >
                      Register
                    </Link>
                    <Link
                      href="/sign-in"
                      onClick={() => close(false)}
                      className="inline-flex min-h-[48px] items-center justify-center rounded-control border border-control-border bg-surface px-3 text-ctl font-medium text-ink hover:bg-row-hover"
                    >
                      Sign in
                    </Link>
                  </>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
