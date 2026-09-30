import { createSessionToken, SESSION_COOKIE, SESSION_TTL_MS, type SessionPayload } from "@/lib/session-edge";

export { createSessionToken, SESSION_COOKIE, SESSION_TTL_MS };
export type { SessionPayload };

export function verifyCredentials(username: string, password: string): boolean {
  const u = process.env.AUTH_USERNAME ?? "FuelPdc@7860#";
  const p = process.env.AUTH_PASSWORD ?? "7860#pdcAdmin";
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
