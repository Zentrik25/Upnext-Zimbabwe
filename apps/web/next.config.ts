import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
// In local development without the Compose proxy, forward /api and /health to the Django API so the
// browser stays same-origin (production uses path routing at the edge: SECURITY_ARCHITECTURE §2).
const apiOrigin = process.env.API_INTERNAL_URL;

const config: NextConfig = {
  // Development containers point this at a tmpfs so the build cache never depends on file ownership.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // Every page's title, description, canonical and robots tags are sent in <head>, for every client. By default
  // Next.js streams metadata into <body> for clients it does not list as limited, and that list leaves out
  // Googlebot and unknown crawlers: on the list pages the canonical and robots tags then reached Googlebot only
  // inside <body>, where Google ignores rel=canonical (SEO audit 2026-11, SEO-B02). The cost is small: the list's
  // metadata request is the same cached request the results use.
  htmlLimitedBots: /.*/,
  async rewrites() {
    if (!isDev || !apiOrigin) return [];
    return [
      { source: "/api/:path*", destination: `${apiOrigin}/api/:path*` },
      { source: "/health/:path*", destination: `${apiOrigin}/health/:path*` },
      { source: "/static/:path*", destination: `${apiOrigin}/static/:path*` },
      { source: "/media/:path*", destination: `${apiOrigin}/media/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

export default config;
