/* Phase 5 E2E: #13753 row click, #13755 no zero months, #13757 range filter,
 * #13758 manual entry on /scan. */
const { chromium } = require("playwright");
const BASE = "http://localhost:3000";
let pass = true;
const check = (n, ok, x = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${n}${x ? ` — ${x}` : ""}`); if (!ok) pass = false; };

(async () => {
  const browser = await chromium.launch();

  // --- #13753 row click ---
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForSelector("table tbody tr");
  const firstRow = page.locator("table tbody tr").first();
  const rowVehicle = (await firstRow.locator("td").nth(2).textContent()).trim();
  await firstRow.locator("td").nth(1).click(); // click voucherNo cell, not buttons
  await page.waitForURL("**/vehicles/**");
  const landed = decodeURIComponent(page.url()).includes(encodeURIComponent(rowVehicle));
  check("#13753 row click navigates to vehicle page", landed, `row=${rowVehicle} url=${page.url()}`);

  // edit button does not navigate
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForSelector("table tbody tr");
  await page.locator('button[aria-label^="Edit"]').first().click();
  await page.waitForTimeout(600);
  const dialogOpen = await page.locator("[role='dialog']").count();
  const stillHome = page.url() === BASE + "/";
  check("#13753 edit button opens dialog, no navigation", dialogOpen > 0 && stillHome, `dialog=${dialogOpen}`);
  await page.keyboard.press("Escape");
  await page.locator('button[aria-label^="Delete"]').first().click();
  await page.waitForTimeout(600);
  const delDialog = await page.locator("[role='dialog']").count();
  check("#13753 delete button opens dialog, no navigation", delDialog > 0 && page.url() === BASE + "/");
  await page.keyboard.press("Escape");

  // --- #13755 + #13757 vehicle page ---
  await page.goto(BASE + "/vehicles/ABC-1234", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  const tableRows = await page.locator("table tbody tr").count();
  check("#13755 only active months in table (4)", tableRows === 4, `rows=${tableRows}`);
  const bars = await page.locator(".recharts-bar-rectangle").count();
  check("#13755 only active months as bars (4)", bars === 4, `bars=${bars}`);
  const zeroRows = await page.locator("table tbody tr", { hasText: /0\.00\s*L/ }).count();
  check("#13755 no zero-activity rows", zeroRows === 0, `zeroRows=${zeroRows}`);

  // Range selects exist and are populated from real data months
  const combos = page.getByRole("combobox");
  check("#13757 start+end selects present", (await combos.count()) === 2);
  await combos.nth(0).click();
  const startOpts = await page.getByRole("option").allTextContents();
  const expectStart = ["May", "June", "August", "September"];
  check("#13757 start options = real data months only",
    expectStart.every((m) => startOpts.some((o) => o.includes(m))) && startOpts.length === expectStart.length,
    JSON.stringify(startOpts));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // set start to June -> end options must be only Aug/Sep
  await combos.nth(0).click();
  await page.getByRole("option", { name: "June", exact: true }).click();
  await page.waitForTimeout(400);
  await combos.nth(1).click();
  const endOpts = await page.getByRole("option").allTextContents();
  check("#13757 end options after start (Aug/Sep only)",
    endOpts.length === 2 && endOpts.some((o) => o.includes("August")) && endOpts.some((o) => o.includes("September")),
    JSON.stringify(endOpts));
  await page.getByRole("option", { name: "September", exact: true }).click();
  await page.waitForTimeout(1500);
  const rangeRows = await page.locator("table tbody tr").count();
  check("#13757 range Jun–Sep shows 3 rows", rangeRows === 3, `rows=${rangeRows}`);
  const rangeText = await page.locator("table").textContent();
  check("#13757 range totals exclude May", !rangeText.includes("May"), "");

  // Mobile overflow
  const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mob.goto(BASE + "/vehicles/ABC-1234", { waitUntil: "networkidle" });
  await mob.waitForTimeout(1500);
  const ov = await mob.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("No overflow @390 vehicle page", ov <= 0, `delta=${ov}`);

  // --- #13758 manual entry ---
  const scan = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await scan.goto(BASE + "/scan", { waitUntil: "networkidle" });
  const formVisible = await scan.locator("#voucherNo").count();
  const canType = await scan.locator("#voucherNo").isEnabled();
  check("#13758 manual form visible without upload", formVisible > 0 && canType);
  const stamp = Date.now();
  await scan.fill("#voucherNo", `M-${stamp}`);
  await scan.fill("#vehicleNo", "JK02DW6302");
  await scan.fill("#liters", "33.5");
  await scan.fill("#date", "2026-09-28");
  await scan.getByRole("button", { name: /save/i }).click();
  await scan.waitForTimeout(2000);
  const saveOk = await scan.getByText(/saved|success/i).count().catch(() => 0);
  // verify via API
  const list = await (await fetch(`${BASE}/api/vouchers?search=M-${stamp}`)).json();
  check("#13758 manual voucher saved to DB", list.total === 1 && list.items[0]?.liters === 33.5,
        JSON.stringify(list.items?.[0]?.voucherNo));
  // duplicate
  await scan.fill("#voucherNo", `M-${stamp}`);
  await scan.fill("#vehicleNo", "JK02DW6302");
  await scan.fill("#liters", "33.5");
  await scan.fill("#date", "2026-09-28");
  await scan.getByRole("button", { name: /save/i }).click();
  await scan.waitForTimeout(2000);
  const dupAlert = await scan.getByText(/already exists|duplicate|could not save/i).count().catch(() => 0);
  check("#13758 duplicate manual entry rejected with data preserved", dupAlert > 0, `alerts=${dupAlert}`);

  check("No page errors", errors.length === 0, errors.join("; ").slice(0, 200));
  console.log(pass ? "RESULT: ALL PASS" : "RESULT: FAIL");
  await browser.close();
  process.exit(pass ? 0 : 1);
})();
