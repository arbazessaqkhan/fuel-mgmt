/* Phase 4 ticket #13489 E2E: vehicle detail view with month-by-month history. */
const { chromium } = require("playwright");
const BASE = "http://localhost:3000";
let pass = true;
const check = (n, ok, x = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${n}${x ? ` — ${x}` : ""}`); if (!ok) pass = false; };

(async () => {
  const browser = await chromium.launch();

  // --- API checks (12M window, zero-fill, totals, 404) ---
  const res = await fetch(`${BASE}/api/vehicles/ABC-1234/history?months=12`);
  const api = await res.json();
  check("API 200 for known vehicle", res.status === 200);
  check("API zero-fills 12 months", api.months.length === 12);
  // ABC-1234 seeded: May 38.5, Jun 38.5, Aug 38.5 (+Sep dashboard seed? ABC-1234 not in Sep)
  const may = api.months.find((m) => m.month === "2026-05");
  const jul = api.months.find((m) => m.month === "2026-07");
  check("May liters correct (38.5)", may && may.liters === 38.5 && may.vouchers === 1, JSON.stringify(may));
  check("Gap month July zero-filled", jul && jul.liters === 0 && jul.vouchers === 0, JSON.stringify(jul));
  // ABC-1234 rows: May 38.5, Jun 38.5, Aug 38.5, Sep 31 => 146.5 L / 4 vouchers
  check("Totals correct (146.5 L / 4 vouchers)", api.totalLiters === 146.5 && api.totalVouchers === 4,
        `L=${api.totalLiters} V=${api.totalVouchers}`);
  const r404 = await fetch(`${BASE}/api/vehicles/XX99XXX9999/history`);
  check("Unknown vehicle -> 404", r404.status === 404);
  const r24 = await fetch(`${BASE}/api/vehicles/ABC-1234/history?months=24`);
  const api24 = await r24.json();
  check("24-month window works", r24.status === 200 && api24.months.length === 24);

  // --- Browser journey: dashboard -> chart bar -> detail ---
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForSelector(".recharts-bar-rectangle");
  await page.click(".recharts-bar-rectangle >> nth=0");
  await page.waitForURL("**/vehicles/**");
  await page.waitForTimeout(1500);
  const url1 = decodeURIComponent(page.url());
  check("Chart bar click lands on vehicle page", /\/vehicles\//.test(url1), url1);
  const plate = url1.split("/vehicles/")[1]?.replace(/\/$/, "");

  const h1 = await page.locator("h1").textContent();
  check("Vehicle plate shown in header", h1.includes(plate), h1.trim());

  // Summary cards
  const cards = await page.locator(".card-premium .tabular-nums").allTextContents();
  const joined = cards.join(" ");
  if (plate === "JK02DW6302") {
    check("Summary totals for JK02DW6302", joined.includes("40") , joined.slice(0, 80));
  } else {
    check("Summary totals render", joined.length > 0, joined.slice(0, 80));
  }

  // Month-by-month breakdown table exists with rows
  const rows = await page.locator("table tbody tr").count();
  check("Month-by-month breakdown table has window rows", rows >= 6, `rows=${rows}`);

  // Recent vouchers list
  const recentVisible = await page.getByText("Recent vouchers").count();
  check("Recent vouchers section present", recentVisible > 0);

  // Window switch 12M -> 6M
  await page.getByRole("button", { name: "6M" }).click();
  await page.waitForTimeout(1200);
  const rows6 = await page.locator("table tbody tr").count();
  check("Window switch to 6M updates breakdown", rows6 === 6, `rows=${rows6}`);

  // Back link
  await page.getByRole("link", { name: "Dashboard" }).first().click();
  await page.waitForURL(BASE + "/");
  check("Back to dashboard works", page.url() === BASE + "/");

  // Entry point 2: Most Active card link
  await page.waitForTimeout(1000);
  const mostActive = page.locator(".card-premium a[href^='/vehicles/']");
  const macCount = await mostActive.count();
  check("Most Active card links to vehicle page", macCount >= 1, `links=${macCount}`);

  // Entry point 3: table vehicle cell link
  const tableLinks = await page.locator("table a[href^='/vehicles/']").count();
  check("Table vehicle cells link to vehicle page", tableLinks >= 1, `links=${tableLinks}`);

  // Unknown vehicle not-found state
  await page.goto(`${BASE}/vehicles/XX99XXX9999`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const nf = await page.getByText("Vehicle not found").count();
  check("Unknown plate shows not-found state", nf > 0);
  await page.getByRole("link", { name: "Back to dashboard" }).click();
  await page.waitForURL(BASE + "/");
  check("Not-found page has working back link", true);

  // Mobile
  const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mob.goto(`${BASE}/vehicles/ABC-1234`, { waitUntil: "networkidle" });
  await mob.waitForTimeout(1500);
  const overflow = await mob.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("No horizontal overflow @390 on vehicle page", overflow <= 0, `delta=${overflow}`);
  await mob.screenshot({ path: "/tmp/vehicle-390.png", fullPage: true });

  check("No page errors", errors.length === 0, errors.join("; ").slice(0, 200));
  await page.screenshot({ path: "/tmp/vehicle-1440.png", fullPage: true });
  console.log(pass ? "RESULT: ALL PASS" : "RESULT: FAIL");
  await browser.close();
  process.exit(pass ? 0 : 1);
})();
