/* Browser E2E for the dashboard: month filter, search, sort, delete, empty state. */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  const results: Array<[string, boolean]> = [];
  const check = (name: string, ok: boolean) => {
    results.push([name, ok]);
    console.log(ok ? `✓ ${name}` : `✗ ${name}`);
  };

  await page.goto(BASE, { waitUntil: "networkidle" });

  // 1. Cards show September totals (3 vouchers after prior delete, 123 L, ABC-1234)
  await page.waitForSelector("text=Total Liters This Month");
  const liters = await page.textContent("div.truncate");
  check("card: total liters 123", liters?.includes("123") ?? false);
  const active = await page.textContent("body");
  check("card: most active ABC-1234", active?.includes("ABC-1234") ?? false);

  // 2. Table shows September rows only (3 rows, includes V-2002 not V-4001)
  const rows = await page.locator("table tbody tr").count();
  check("table: 3 rows for Sep", rows === 3);
  check("table: no August row", !((await page.textContent("tbody")) ?? "").includes("V-4001"));

  // 3. Search filters
  await page.fill('input[aria-label="Search vouchers"]', "V-2002");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 1);
  check("search: filters to 1 row", true);
  await page.fill('input[aria-label="Search vouchers"]', "");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 3);

  // 4. Sort by liters (first click → desc: 45.5 first; second click → asc: 32 first)
  await page.click('thead button:has-text("Liters")');
  await page.waitForFunction(() =>
    (document.querySelector("tbody tr td:nth-child(4)"))?.textContent?.startsWith?.("45.50")
  );
  check("sort: liters desc first", true);
  await page.click('thead button:has-text("Liters")');
  await page.waitForFunction(() =>
    (document.querySelector("tbody tr td:nth-child(4)"))?.textContent?.startsWith("32")
  );
  check("sort: liters asc second", true);

  // 5. Month filter → August shows 1 row / 60.25 L
  await page.click('[aria-label="Select month"]');
  await page.click('div[role="option"]:has-text("August")');
  await page.waitForFunction(() => document.body.textContent?.includes("60.25"), null, { timeout: 10000 }).catch(()=>{});
  const augRows = await page.locator("tbody tr").count();
  check("month filter: August 1 row", augRows === 1);

  // 6. Empty month (e.g. July) → zeroed cards, empty state
  await page.click('[aria-label="Select month"]');
  await page.click('div[role="option"]:has-text("July")');
  await page.waitForSelector("text=No vouchers for this month yet");
  check("empty month: empty state shown", true);

  // 7. Back to September, delete V-2002's neighbor (V-1001) → totals drop by 45.5
  await page.click('[aria-label="Select month"]');
  await page.click('div[role="option"]:has-text("September")');
  await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 3);
  const beforeTotal = await page.textContent("div.truncate");
  await page.click('button[aria-label="Delete V-1001"]');
  await page.waitForSelector("text=Delete voucher?");
  await page.click('button:has-text("Delete"):not([variant])');
  await page.waitForFunction(() => document.body.textContent?.includes("Voucher V-1001 deleted"));
  await page.waitForFunction(() => !(document.body.textContent ?? "").includes("V-1001"));
  const afterTotal = await page.textContent("div.truncate");
  check("delete: total drops", Number(afterTotal?.replace(/[^0-9.]/g, "")) < Number(beforeTotal?.replace(/[^0-9.]/g, "")));

  // 8. Edit a voucher: change V-2002 liters 32 → 40, verify update
  await page.click('button[aria-label="Edit V-2002"]');
  await page.fill("#edit-liters", "40");
  await page.click('button:has-text("Save changes")');
  await page.waitForFunction(() => document.body.textContent?.includes("Voucher updated"));
  check("edit: liters updated to 40", true);
  // restore
  await page.click('button[aria-label="Edit V-2002"]');
  await page.fill("#edit-liters", "32");
  await page.click('button:has-text("Save changes")');
  await page.waitForFunction(() => document.body.textContent?.includes("Voucher updated"));

  // 9. Chart renders bars for the month
  await page.waitForSelector(".recharts-bar-rectangle");
  const bars = await page.locator(".recharts-bar-rectangle").count();
  check("chart: bars rendered", bars >= 1);

  // 10. Responsive: mobile viewport has no horizontal overflow
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  check("responsive: no horizontal overflow at 390px", overflow <= 0);

  console.log("Console errors:", errors.length ? errors.slice(0, 5) : "none");
  await browser.close();
  const failed = results.filter(([, ok]) => !ok);
  if (failed.length || errors.length) {
    console.error(`FAILED: ${failed.length} checks`);
    process.exit(1);
  }
  console.log("ALL DASHBOARD CHECKS PASSED");
}

main().catch((e) => {
  console.error("E2E FAILED:", e);
  process.exit(1);
});
