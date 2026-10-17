import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader, SkipLink } from "@/components/layout";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: { default: "UPNEXT", template: "%s · UPNEXT" },
  description:
    "Opportunity discovery for Zimbabwe: jobs, internships, graduate programmes, scholarships, tenders and grants.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Reading request headers opts the tree into dynamic rendering so the per-request CSP nonce (proxy.ts)
  // is applied to Next.js' own scripts.
  await headers();
  return (
    <html lang="en">
      <body>
        <SkipLink />
        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
