import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

import { MobileMenu } from "@/components/layout/mobile-menu";

const ITEMS = [
  { href: "/opportunities", label: "Opportunities" },
  { href: "/employers", label: "For employers" },
];

describe("MobileMenu (hamburger on phones)", () => {
  beforeEach(() => {
    pathname = "/";
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
      onchange: null,
    })) as typeof window.matchMedia;
  });
  afterEach(() => {
    cleanup();
    document.documentElement.style.overflow = "";
  });

  it("starts closed: only the button exists, labelled, collapsed and controlling the menu", () => {
    render(<MobileMenu items={ITEMS} signedIn={false} />);
    const button = screen.getByRole("button", { name: "Open menu" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("aria-controls")).toBe("mobile-menu");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens a modal menu with the header links, Register and Sign in, locks scrolling and focuses Close", () => {
    render(<MobileMenu items={ITEMS} signedIn={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const dialog = screen.getByRole("dialog", { name: "Menu" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByRole("link", { name: "Opportunities" }).getAttribute("href")).toBe("/opportunities");
    expect(screen.getByRole("link", { name: "For employers" }).getAttribute("href")).toBe("/employers");
    expect(screen.getByRole("link", { name: "Register" }).getAttribute("href")).toBe("/register");
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/sign-in");
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close menu" }));
  });

  it("Escape and Close shut it, restore scrolling and return focus to the menu button", () => {
    render(<MobileMenu items={ITEMS} signedIn={false} />);
    const open = screen.getByRole("button", { name: "Open menu" });
    fireEvent.click(open);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.documentElement.style.overflow).toBe("");
    expect(document.activeElement).toBe(open);
    fireEvent.click(open);
    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps Tab inside the open menu", () => {
    render(<MobileMenu items={ITEMS} signedIn={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const first = screen.getByRole("link", { name: /home$/ });
    const last = screen.getByRole("link", { name: "Sign in" });
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("closes when a link is chosen", () => {
    render(<MobileMenu items={ITEMS} signedIn={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    fireEvent.click(screen.getByRole("link", { name: "Opportunities" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("signed in: shows the account destinations and a Sign out button instead of Register", () => {
    render(
      <MobileMenu
        items={[...ITEMS, { href: "/for-you", label: "For you" }, { href: "/saved", label: "Saved" }]}
        signedIn
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("link", { name: "For you" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Saved" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Register" })).toBeNull();
  });
});
