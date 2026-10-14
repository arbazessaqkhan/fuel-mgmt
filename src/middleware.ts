import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session-edge";

// Paths that never require authentication and never redirect authenticated users.
const PUBLIC_PATHS = [
  "/api/auth/login",
  "/manifest.json",
  "/sw.js",
  "/.well-known",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow unconditional public paths (APIs, static manifests, etc.)
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(token);
  const isApi = pathname.startsWith("/api");
  const isLogin = pathname === "/login" || pathname.startsWith("/login/");

  if (!session) {
    if (isApi) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }
    if (isLogin) {
      return NextResponse.next();
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isLogin) {
    const from = req.nextUrl.searchParams.get("from");
    const dest = from && from.startsWith("/") && !from.startsWith("//") ? from : "/";
    return NextResponse.redirect(new URL(dest, req.url));
  }

  return NextResponse.next();
}

export const config = {
  // Protect pages + APIs; skip Next internals and static assets.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|eng.traineddata|.*\\.(?:svg|ico|png|jpg|jpeg|webp|css|js|json|map|woff|woff2|txt|gz)$).*)",
  ],
};
