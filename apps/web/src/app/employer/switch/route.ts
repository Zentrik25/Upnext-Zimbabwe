import { NextResponse, type NextRequest } from "next/server";
import { ACTIVE_ORG_COOKIE } from "@/lib/employer-context";
import { safeNext } from "@/lib/safe-next";

/**
 * Chooses the organisation the employer pages work for. The cookie is only a preference: the id is checked
 * against the format here, and every page and API call still resolves the organisation through the caller's own
 * memberships (an id that is not theirs is ignored and the first of theirs is used).
 */
export function GET(request: NextRequest) {
  const org = request.nextUrl.searchParams.get("org") ?? "";
  const next = safeNext(request.nextUrl.searchParams.get("next"), "/employer");
  const target = new URL(next.startsWith("/employer") ? next : "/employer", request.nextUrl.origin);
  const response = NextResponse.redirect(target, 303);
  if (/^[0-9a-f-]{36}$/i.test(org)) {
    response.cookies.set(ACTIVE_ORG_COOKIE, org, {
      path: "/employer",
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      maxAge: 60 * 60 * 24 * 90,
    });
  }
  return response;
}
