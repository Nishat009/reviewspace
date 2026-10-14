import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { LAST_WORKSPACE_COOKIE } from "@/lib/constants";

const PUBLIC_PREFIXES = ["/sign-in", "/sign-up", "/forgot-password", "/reset-password", "/verify-email", "/invite", "/s"];

function isPublic(pathname: string) {
  return pathname === "/" || PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Optimistic gate only: bounces requests without a valid session cookie to
 * sign-in and remembers where they were going. Real authorization happens in
 * the data access layer on every page, action and route handler.
 */
export default auth((request) => {
  const { pathname, search } = request.nextUrl;

  if (!request.auth && !isPublic(pathname)) {
    const url = new URL("/sign-in", request.nextUrl);
    url.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-rs-pathname", `${pathname}${search}`);
  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Remember the last workspace visited so /dashboard can return to it.
  // Only a hint: /dashboard re-checks membership before using it.
  const workspaceSlug = /^\/w\/([a-z0-9-]{1,64})(?:\/|$)/.exec(pathname)?.[1];
  if (workspaceSlug) {
    response.cookies.set(LAST_WORKSPACE_COOKIE, workspaceSlug, {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      maxAge: 60 * 60 * 24 * 180,
      path: "/",
    });
  }
  return response;
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
