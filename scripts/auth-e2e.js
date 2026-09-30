// Auth E2E: logged-out redirect, bad credentials, login, persistence, logout, API 401.
const { chromium } = require("playwright");
const BASE = "http://localhost:3000";
const USER = "FuelPdc@7860#";
const PASS = "7860#pdcAdmin";

(async () => {
  const results = [];
  const check = (name, ok, extra = "") => { results.push([name, ok, extra]); console.log(`${ok ? "PASS" : "FAIL"} ${name} ${extra}`); };
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  // 1. logged-out redirect
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  check("logged-out redirect to /login", page.url().includes("/login"));

  // 2. bad credentials
  await page.fill("#username", USER);
  await page.fill("#password", "wrongpass");
  await page.click("button[type=submit]");
  await page.waitForSelector("text=Invalid username or password", { timeout: 8000 }).catch(() => {});
  const alertText = await page.textContent('[role="alert"]').catch(() => "");
  check("bad credentials error shown", !!alertText && alertText.length > 0, alertText?.trim().slice(0, 60));

  // 3. login (hard redirect happens client-side via window.location)
  await page.fill("#username", USER);
  await page.fill("#password", PASS);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15000 });
  check("login lands on dashboard", page.url().replace(/\/$/, "") === BASE, page.url());
  const dashText = await page.textContent("body");
  check("dashboard content visible", /Fleet Dashboard|Liters/i.test(dashText || ""));

  // 4. session persists after reload
  await page.reload({ waitUntil: "domcontentloaded" });
  check("session persists after reload", !page.url().includes("/login"));

  // 5. scan page accessible while logged in
  await page.goto(BASE + "/scan", { waitUntil: "domcontentloaded" });
  check("scan page accessible logged in", !page.url().includes("/login"));

  // 6. logout (via account dropdown menu)
  await page.click("button[aria-label='Account menu']");
  await page.waitForTimeout(400);
  await page.click("text=Logout");
  await page.waitForURL("**/login", { timeout: 10000 });
  check("logout redirects to login", page.url().includes("/login"));

  // 7. after logout, dashboard redirects
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  check("after logout, protected again", page.url().includes("/login"));

  // 8. API 401 when logged out
  const resp = await page.request.get(BASE + "/api/vouchers");
  check("API returns 401 logged out", resp.status() === 401, `status=${resp.status()}`);

  check("no page errors", errors.length === 0, errors.join("; ").slice(0, 200));

  const fails = results.filter(([, ok]) => !ok).length;
  console.log(`\n${results.length - fails}/${results.length} checks passed`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
