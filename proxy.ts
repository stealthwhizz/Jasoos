import { type NextRequest, NextResponse } from "next/server";
import { readSession, SESSION_COOKIE } from "@/lib/worldid";

export async function proxy(request: NextRequest) {
  const user = readSession(request.cookies.get(SESSION_COOKIE)?.value);
  const { pathname } = request.nextUrl;

  const isPublic =
    pathname === "/login" ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico";

  // Pages: redirect unauthenticated users to login.
  if (!user && !isPublic && !pathname.startsWith("/api")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Signed-in users don't need the login page.
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except static assets and image optimization.
     * API routes are included; each one checks the session itself.
     */
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
