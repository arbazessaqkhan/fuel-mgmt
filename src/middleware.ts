import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session-edge";

const PUBLIC_PATHS = ["/login", "/api/auth/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(token);
  const isApi = pathname.startsWith("/api");

  if (!session) {
    if (isApi) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === "/login") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  // Protect pages + APIs; skip Next internals and static assets.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|eng.traineddata|.*\\.(?:svg|ico|png|jpg|jpeg|webp|css|js|map|woff|woff2|txt|gz)$).*)",
  ],
};
