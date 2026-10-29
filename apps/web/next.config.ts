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
  async rewrites() {
    if (!isDev || !apiOrigin) return [];
    return [
      { source: "/api/:path*", destination: `${apiOrigin}/api/:path*` },
      { source: "/health/:path*", destination: `${apiOrigin}/health/:path*` },
      { source: "/django-admin/:path*", destination: `${apiOrigin}/django-admin/:path*` },
      { source: "/static/:path*", destination: `${apiOrigin}/static/:path*` },
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
