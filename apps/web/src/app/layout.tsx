import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader, SkipLink } from "@/components/layout";
import { BRAND } from "@/lib/brand";
import { siteUrl } from "@/lib/site";
import "@/styles/globals.css";

// Applies a remembered Light or Dark choice before the first paint (no flash). Auto leaves the attribute off.
const THEME_SCRIPT = `try{var t=localStorage.getItem("upnext-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: BRAND.name, template: `%s · ${BRAND.name}` },
  description: BRAND.description,
  applicationName: BRAND.name,
  openGraph: {
    siteName: BRAND.name,
    type: "website",
    locale: "en",
    title: BRAND.name,
    description: BRAND.description,
  },
  twitter: { card: "summary" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Reading request headers opts the tree into dynamic rendering so the per-request CSP nonce (proxy.ts)
  // is applied to Next.js' own scripts.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    // data-theme is set before first paint by the script below, so the server and client markup differ on purpose.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <SkipLink />
        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
