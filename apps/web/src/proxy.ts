import { NextResponse, type NextRequest } from "next/server";
import { isAdEligiblePath } from "@/lib/ad-rules";
import { adsCspExtra } from "@/lib/adsense";

/**
 * Per-request Content-Security-Policy with a nonce (SECURITY_ARCHITECTURE §6.1). Next.js applies the
 * nonce to its own scripts when it finds it in the request's CSP header; pages are therefore rendered
 * dynamically. Static assets and prefetches are excluded by the matcher.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV !== "production";
  // Advertising hosts are added only in `live` mode and only on a path that may show an ad; everywhere else the
  // policy is unchanged (lib/adsense.ts, lib/ad-rules.ts).
  const ads = adsCspExtra(request.nextUrl.pathname, isAdEligiblePath);
  const extra = (directive: string) => (ads[directive] ?? []).map((source) => ` ${source}`).join("");
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}${extra("script-src")}`,
    `style-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-inline'" : ""}`,
    `img-src 'self' data: blob:${extra("img-src")}`, // blob: is the staff image-upload preview (D-58)
    "font-src 'self'",
    `connect-src 'self'${extra("connect-src")}`,
    ...(ads["frame-src"] ? [`frame-src${extra("frame-src")}`] : []),
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("x-pathname", request.nextUrl.pathname); // lets the root layout drop the public header on /workspace
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  // HSTS only where the request really arrived over https (the front sets X-Forwarded-Proto) and the
  // operator turned it on; never includeSubDomains or preload without approval.
  const hsts = Number.parseInt(process.env.UPNEXT_HSTS_SECONDS ?? "0", 10);
  if (hsts > 0 && request.headers.get("x-forwarded-proto") === "https") {
    response.headers.set("Strict-Transport-Security", `max-age=${hsts}`);
  }
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api/|health/|django-admin/|static/|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
