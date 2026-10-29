import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader, SkipLink } from "@/components/layout";
import { BRAND, openGraphFor } from "@/lib/brand";
import { siteUrl } from "@/lib/site";
import "@/styles/globals.css";

// Inter (weights 300 and 400) and Source Code Pro, Latin subsets, served from this origin (no third-party font
// request). Inter stands in for the Stripe system's commercial Söhne (D-45).
const inter = localFont({
  src: [
    { path: "../fonts/inter-latin-300.woff2", weight: "300", style: "normal" },
    { path: "../fonts/inter-latin-400.woff2", weight: "400", style: "normal" },
  ],
  variable: "--font-inter",
  display: "swap",
});
// One weight (500, the design system's code and label weight) and no preload: pages that show no mono label
// never fetch it (mobile transfer budget, P5-08).
const sourceCode = localFont({
  src: [{ path: "../fonts/source-code-pro-latin-500.woff2", weight: "500", style: "normal" }],
  variable: "--font-source-code",
  display: "swap",
  preload: false,
});

// Applies a remembered Light or Dark choice before the first paint (no flash). Auto leaves the attribute off.
const THEME_SCRIPT = `try{var t=localStorage.getItem("upnext-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: BRAND.name, template: `%s | ${BRAND.name}` },
  description: BRAND.description,
  applicationName: BRAND.name,
  icons: {
    icon: [
      { url: BRAND.assets.favicon32, sizes: "32x32", type: "image/png" },
      { url: BRAND.assets.favicon16, sizes: "16x16", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: BRAND.assets.appleTouchIcon, sizes: "180x180", type: "image/png" }],
  },
  openGraph: openGraphFor("/", { title: BRAND.name, description: BRAND.description }),
  twitter: {
    card: "summary_large_image",
    title: BRAND.name,
    description: BRAND.description,
    images: [BRAND.assets.ogImage],
  },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff", // light is the default theme; an explicit dark choice does not change the browser chrome colour
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Reading request headers opts the tree into dynamic rendering so the per-request CSP nonce (proxy.ts)
  // is applied to Next.js' own scripts.
  const requestHeaders = await headers();
  const nonce = requestHeaders.get("x-nonce") ?? undefined;
  // The staff workspace (D-46) has its own shell: no public header, footer or skip link from the site.
  const workspace = (requestHeaders.get("x-pathname") ?? "").startsWith("/workspace");
  return (
    // data-theme is set before first paint by the script below, so the server and client markup differ on purpose.
    <html lang="en" className={`${inter.variable} ${sourceCode.variable}`} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        {workspace ? (
          children
        ) : (
          <>
            <SkipLink />
            <SiteHeader />
            <main id="main">{children}</main>
            <SiteFooter />
          </>
        )}
      </body>
    </html>
  );
}
