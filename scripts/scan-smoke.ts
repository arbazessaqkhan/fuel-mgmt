/* Browser smoke test for the Scan page OCR flow (run manually: npx tsx scripts/scan-smoke.ts). */
import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const IMAGE = "/tmp/voucher-test.png";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto(`${BASE}/scan`, { waitUntil: "networkidle" });

  // Upload the voucher image via the file input
  const input = page.locator('input[type="file"]');
  await input.setInputFiles(IMAGE);

  // Wait for OCR to finish and the form to prefill
  await page.waitForSelector("#voucherNo", { timeout: 90_000 });
  await page.waitForFunction(
    () => (document.querySelector("#voucherNo") as HTMLInputElement)?.value?.length > 0,
    null,
    { timeout: 30_000 }
  );

  const voucherNo = await page.inputValue("#voucherNo");
  const vehicleNo = await page.inputValue("#vehicleNo");
  const liters = await page.inputValue("#liters");
  const date = await page.inputValue("#date");

  console.log("OCR form values:", { voucherNo, vehicleNo, liters, date });

  // Correct any misread values to known-good, then save
  // Clean any leftovers from previous runs
  const list = await page.request.get(`${BASE}/api/vouchers?search=V-2002&pageSize=100`);
  const existing = await list.json();
  for (const v of existing.items ?? []) {
    await page.request.delete(`${BASE}/api/vouchers/${v.id}`);
  }

  await page.fill("#voucherNo", "V-2002");
  if (!vehicleNo) await page.fill("#vehicleNo", "XYZ-456");
  await page.fill("#liters", "32.0");
  if (!date) await page.fill("#date", "2026-09-20");

  await page.click('button[type="submit"]');
  await page.waitForSelector("text=Voucher saved", { timeout: 15_000 });
  console.log("SAVE OK");

  // Duplicate path: re-scan the same voucher, change only the voucher no to an
  // existing one, save → expect "Could not save" alert and remaining fields intact.
  await input.setInputFiles(IMAGE);
  await page.waitForFunction(
    () => (document.querySelector("#voucherNo") as HTMLInputElement)?.value?.length > 0,
    null,
    { timeout: 30_000 }
  );
  await page.fill("#voucherNo", "V-2002"); // already exists
  await page.fill("#vehicleNo", "XYZ-456");
  await page.fill("#liters", "32.0");
  await page.fill("#date", "2026-09-20");
  await page.click('button[type="submit"]');
  await page.waitForSelector("text=Could not save", { timeout: 15_000 });
  const kept = await page.inputValue("#vehicleNo");
  console.log("DUPLICATE HANDLED, form preserved:", kept === "XYZ-456");

  // Verify it actually reached the DB
  const res = await page.request.get(`${BASE}/api/vouchers?year=2026&month=9&search=V-2002`);
  const data = await res.json();
  console.log("DB CHECK:", data.total === 1 ? "OK" : `FAIL (${JSON.stringify(data)})`);

  console.log("Console errors:", errors.length ? errors.slice(0, 5) : "none");
  await browser.close();
  if (errors.length || data.total !== 1) process.exit(1);
}

main().catch((e) => {
  console.error("SMOKE FAILED:", e);
  process.exit(1);
});
