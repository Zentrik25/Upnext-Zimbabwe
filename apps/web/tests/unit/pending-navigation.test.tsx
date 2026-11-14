/**
 * O-12 (owner decision 2026-11-14, D-75): the discovery pages' first HTML is complete, and a skeleton appears only
 * while a client-side transition to one of them is pending.
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const link = vi.hoisted(() => ({ pending: false }));
vi.mock("next/link", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useLinkStatus: () => ({ pending: link.pending }),
}));

import {
  discoveryDestination,
  PendingMain,
  PendingNavigationProvider,
  PendingSignal,
} from "@/components/navigation/pending-navigation";
import { readRepoFile } from "./helpers";

afterEach(() => {
  cleanup();
  link.pending = false;
});

function Page({ href }: { href: string }) {
  return (
    <PendingNavigationProvider>
      <PendingSignal href={href} />
      <main>
        <PendingMain>
          <h1>Current page</h1>
        </PendingMain>
      </main>
    </PendingNavigationProvider>
  );
}

describe("client-side transition skeletons", () => {
  it("the server HTML is always the page, never a skeleton", () => {
    link.pending = true; // even if a link were somehow pending, effects do not run on the server
    const html = renderToString(<Page href="/opportunities" />);
    expect(html).toContain("Current page");
    expect(html).not.toContain("Loading");
  });

  it("shows the destination's skeleton while a link to a discovery page is pending, then the page again", () => {
    const { rerender } = render(<Page href="/opportunities?category=jobs" />);
    expect(screen.getByRole("heading", { name: "Current page" })).toBeInTheDocument();
    link.pending = true;
    rerender(<Page href="/opportunities?category=jobs" />);
    expect(screen.getAllByTestId("loading")[0]).toHaveTextContent("Loading opportunities");
    expect(screen.queryByRole("heading", { name: "Current page" })).toBeNull();
    link.pending = false;
    rerender(<Page href="/opportunities?category=jobs" />);
    expect(screen.getByRole("heading", { name: "Current page" })).toBeInTheDocument();
    expect(screen.queryByTestId("loading")).toBeNull();
  });

  it("does nothing for links to other pages (they have their own loading files or none)", () => {
    const { rerender } = render(<Page href="/saved" />);
    link.pending = true;
    rerender(<Page href="/saved" />);
    expect(screen.getByRole("heading", { name: "Current page" })).toBeInTheDocument();
  });

  it("a link that unmounts mid-navigation does not leave the skeleton behind", () => {
    function Toggle({ show }: { show: boolean }) {
      return (
        <PendingNavigationProvider>
          {show ? <PendingSignal href="/" /> : null}
          <PendingMain>
            <h1>Current page</h1>
          </PendingMain>
        </PendingNavigationProvider>
      );
    }
    link.pending = true;
    const { rerender } = render(<Toggle show />);
    expect(screen.getAllByTestId("loading").length).toBeGreaterThan(0);
    act(() => rerender(<Toggle show={false} />));
    expect(screen.getByRole("heading", { name: "Current page" })).toBeInTheDocument();
  });

  it("knows which destinations are discovery pages", () => {
    expect(discoveryDestination("/")).toBe("home");
    expect(discoveryDestination("/opportunities?q=x")).toBe("opportunities");
    expect(discoveryDestination("/jobs/harare")).toBe("opportunities");
    expect(discoveryDestination("/categories")).toBe("directory");
    expect(discoveryDestination("/guides")).toBe("directory");
    expect(discoveryDestination("/guides/how-to-prepare-a-cv")).toBeNull();
    expect(discoveryDestination("/account")).toBeNull();
    expect(discoveryDestination(null)).toBeNull();
  });

  it("the public layout and the site navigation are wired to it; private routes keep their loading files", () => {
    const layout = readRepoFile("apps/web/src/app/layout.tsx");
    expect(layout).toContain("<PendingMain>{children}</PendingMain>");
    for (const nav of ["site-header.tsx", "bottom-nav.tsx", "mobile-menu.tsx"])
      expect(readRepoFile(`apps/web/src/components/layout/${nav}`), nav).toContain("<PendingSignal");
    expect(readRepoFile("apps/web/src/app/account/loading.tsx")).toBeTruthy();
  });
});
