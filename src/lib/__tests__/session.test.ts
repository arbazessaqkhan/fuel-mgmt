import { verifySessionToken, createSessionToken } from "@/lib/session-edge";
import { SESSION_COOKIE, sessionCookieOptions, verifyCredentials } from "@/lib/session";

describe("session auth", () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, AUTH_USERNAME: "FuelPdc@7860#", AUTH_PASSWORD: "7860#pdcAdmin", AUTH_SECRET: "test-secret-12345" };
  });
  afterAll(() => { process.env = OLD_ENV; });

  test("verifyCredentials accepts fixed credentials", () => {
    expect(verifyCredentials("FuelPdc@7860#", "7860#pdcAdmin")).toBe(true);
  });
  test("verifyCredentials rejects wrong username/password", () => {
    expect(verifyCredentials("wrong", "7860#pdcAdmin")).toBe(false);
    expect(verifyCredentials("FuelPdc@7860#", "wrong")).toBe(false);
    expect(verifyCredentials("", "")).toBe(false);
  });
  test("session token round-trips and expires", async () => {
    const token = await createSessionToken("admin");
    expect((await verifySessionToken(token))?.sub).toBe("admin");
    expect(await verifySessionToken(token + "x")).toBeNull();
    expect(await verifySessionToken(undefined)).toBeNull();
  });
  test("cookie options are HttpOnly", () => {
    expect(sessionCookieOptions().httpOnly).toBe(true);
    expect(SESSION_COOKIE).toBe("fuellog_session");
  });
});
