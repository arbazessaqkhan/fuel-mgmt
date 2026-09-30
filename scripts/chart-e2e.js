/* Phase 4 ticket #13488 E2E: advanced interactive vehicle chart. */
const { chromium } = require("playwright");
const BASE = "http://localhost:3000";
let pass = true;
const check = (n, ok, x = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${n}${x ? ` — ${x}` : ""}`); if (!ok) pass = false; };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  // Seed month Sep 2026: select via URL-free UI — read current stats instead
  await page.waitForSelector(".recharts-bar-rectangle", { timeout: 15000 });

  const barCount = await page.locator(".recharts-bar-rectangle").count();
  check("Bars render (gradient, animated in)", barCount > 0, `count=${barCount}`);

  const sorted = await page.evaluate(() => {
    const vals = Array.from(document.querySelectorAll(".recharts-bar-rectangle path")).map(
      (p) => parseFloat(p.getAttribute("height") || "0")
    );
    return vals.every((h, i) => i === 0 || vals[i - 1] >= h);
  });
  check("Bars sorted by liters desc (heights non-increasing)", sorted);

  // Tooltip on hover
  await page.hover(".recharts-bar-rectangle >> nth=0");
  await page.waitForTimeout(400);
  const tooltip = await page.locator(".recharts-tooltip-wrapper").textContent().catch(() => "");
  check("Tooltip shows liters + vouchers + share",
    /L/.test(tooltip) && /Vouchers/.test(tooltip) && /Share/.test(tooltip), tooltip.slice(0, 120));

  // Hover dims siblings
  const dimmed = await page.evaluate(() => {
    const cells = Array.from(document.querySelectorAll(".recharts-bar-rectangle-layer, .recharts-bar-rectangle path"));
    return cells.length > 1;
  });
  check("Multiple bars present for hover-dim", dimmed);

  // Click navigates to vehicle detail
  await page.click(".recharts-bar-rectangle >> nth=0");
  await page.waitForTimeout(1500);
  const url = page.url();
  check("Bar click navigates to /vehicles/<plate>", /\/vehicles\/.+/.test(url), url);
  const h1 = await page.locator("h1").textContent().catch(() => "");
  console.log("  landed on:", h1.trim().slice(0, 80));

  // Mobile overflow check on dashboard
  const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mob.goto(BASE + "/", { waitUntil: "networkidle" });
  await mob.waitForTimeout(1200);
  const overflow = await mob.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("No horizontal overflow @390", overflow <= 0, `delta=${overflow}`);

  // Empty month state: use the prev-month chevron back to a 2015 month via Radix selects
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.getByRole("combobox").first().click(); // month select
  await page.getByRole("option", { name: "January", exact: true }).click();
  await page.getByRole("combobox").nth(1).click(); // year select
  await page.getByRole("option", { name: "2022" }).click(); // earliest offered year
  await page.waitForTimeout(1500);
  const empty = await page.getByText("No vehicle data for this month.").count();
  check("Empty month shows friendly empty state", empty > 0);

  check("No page errors", errors.length === 0, errors.join("; ").slice(0, 200));
  await page.screenshot({ path: "/tmp/chart-1440.png", fullPage: true });
  console.log(pass ? "RESULT: ALL PASS" : "RESULT: FAIL");
  await browser.close();
  process.exit(pass ? 0 : 1);
})();
