import { createSessionToken, SESSION_COOKIE, SESSION_TTL_MS, type SessionPayload } from "@/lib/session-edge";

export { createSessionToken, SESSION_COOKIE, SESSION_TTL_MS };
export type { SessionPayload };

export function verifyCredentials(username: string, password: string): boolean {
  // Credentials come from the environment only — no hardcoded fallbacks.
  // Login is impossible until AUTH_USERNAME, AUTH_PASSWORD and AUTH_SECRET are set.
  const u = process.env.AUTH_USERNAME;
  const p = process.env.AUTH_PASSWORD;
  if (!u || !p || !username || !password) return false;
  return username === u && password === p;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: true,
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  };
}
