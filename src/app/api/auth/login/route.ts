import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions, verifyCredentials } from "@/lib/session";

// In-memory sliding-window rate limit per IP: 5 failed attempts / 10 minutes.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 5;
const failures = new Map<string, number[]>(); // ip -> timestamps of failed attempts

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function recentFailures(ip: string): number[] {
  const now = Date.now();
  return (failures.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
}

function clearFailures(ip: string) {
  failures.delete(ip);
}

export async function POST(req: NextRequest) {
  let username = "";
  let password = "";
  try {
    const body = await req.json();
    username = typeof body.username === "string" ? body.username : "";
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!username || !password) {
    return NextResponse.json({ error: "Username and password are required." }, { status: 400 });
  }

  const ip = clientIp(req);
  const recent = recentFailures(ip);
  failures.set(ip, recent);
  if (recent.length >= MAX_FAILURES) {
    const retryAfterSec = Math.ceil((WINDOW_MS - (Date.now() - recent[0])) / 1000);
    return NextResponse.json(
      { error: "Too many failed attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.max(retryAfterSec, 1)) } }
    );
  }

  if (!verifyCredentials(username, password)) {
    failures.set(ip, [...recent, Date.now()]);
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }
  clearFailures(ip);

  let token: string;
  try {
    token = await createSessionToken(username);
  } catch {
    return NextResponse.json(
      { error: "Server is not configured for login (missing AUTH_SECRET)." },
      { status: 500 }
    );
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
