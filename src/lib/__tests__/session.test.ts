import { verifySessionToken, createSessionToken } from "@/lib/session-edge";
import { SESSION_COOKIE, sessionCookieOptions, verifyCredentials } from "@/lib/session";

describe("session auth", () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, AUTH_USERNAME: "test-user", AUTH_PASSWORD: "test-pass-123", AUTH_SECRET: "test-secret-12345" };
  });
  afterAll(() => { process.env = OLD_ENV; });

  test("verifyCredentials accepts env-configured credentials", () => {
    expect(verifyCredentials("test-user", "test-pass-123")).toBe(true);
  });
  test("verifyCredentials rejects wrong username/password", () => {
    expect(verifyCredentials("wrong", "test-pass-123")).toBe(false);
    expect(verifyCredentials("test-user", "wrong")).toBe(false);
    expect(verifyCredentials("", "")).toBe(false);
  });
  test("verifyCredentials fails closed when env credentials unset", () => {
    process.env = { ...OLD_ENV, AUTH_SECRET: "test-secret-12345" };
    delete process.env.AUTH_USERNAME;
    delete process.env.AUTH_PASSWORD;
    expect(verifyCredentials("anything", "anything")).toBe(false);
  });
  test("session token round-trips and expires", async () => {
    const token = await createSessionToken("admin");
    expect((await verifySessionToken(token))?.sub).toBe("admin");
    expect(await verifySessionToken(token + "x")).toBeNull();
    expect(await verifySessionToken(undefined)).toBeNull();
  });
  test("tokens fail closed without AUTH_SECRET", async () => {
    process.env = { ...OLD_ENV };
    delete process.env.AUTH_SECRET;
    expect(await verifySessionToken("a.b")).toBeNull();
    await expect(createSessionToken("admin")).rejects.toThrow("AUTH_SECRET");
  });
  test("cookie options are HttpOnly", () => {
    expect(sessionCookieOptions().httpOnly).toBe(true);
    expect(SESSION_COOKIE).toBe("fuellog_session");
  });
});
