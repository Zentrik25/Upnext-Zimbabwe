import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request Content-Security-Policy with a nonce (SECURITY_ARCHITECTURE §6.1). Next.js applies the
 * nonce to its own scripts when it finds it in the request's CSP header; pages are therefore rendered
 * dynamically. Static assets and prefetches are excluded by the matcher.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-inline'" : ""}`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("x-pathname", request.nextUrl.pathname); // the root layout drops the public chrome on /staff
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
