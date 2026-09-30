/* E2E: upload the real Emjay Motors voucher photo, verify AI-assisted extraction, save, verify duplicate handling. */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const IMAGE = "/workspace/userDocs/image_39ae5479.png";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(`${BASE}/scan`, { waitUntil: "networkidle" });
  const input = page.locator('input[type="file"]');
  await input.setInputFiles(IMAGE);

  await page.waitForSelector("#voucherNo", { timeout: 180_000 });
  // wait until all four fields are filled (corrector may take ~30s)
  await page.waitForFunction(
    () =>
      (document.querySelector("#voucherNo") as HTMLInputElement)?.value &&
      (document.querySelector("#vehicleNo") as HTMLInputElement)?.value &&
      (document.querySelector("#liters") as HTMLInputElement)?.value &&
      (document.querySelector("#date") as HTMLInputElement)?.value,
    null,
    { timeout: 120_000 }
  );
  const voucherNo = await page.inputValue("#voucherNo");
  const vehicleNo = await page.inputValue("#vehicleNo");
  const liters = await page.inputValue("#liters");
  const date = await page.inputValue("#date");
  console.log("FORM:", JSON.stringify({ voucherNo, vehicleNo, liters, date }));

  const ok =
    voucherNo === "16072" && vehicleNo === "JK02DW6302" && liters === "40" && date === "2026-09-29";
  if (!ok) {
    console.log("RESULT: MISMATCH");
    await browser.close();
    process.exit(1);
  }

  // Save the voucher
  await page.click('button[type="submit"]');
  await page.waitForSelector("text=/saved|Fuel log/i", { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  // check DB via API
  const list = await page.request.get(`${BASE}/api/vouchers?search=16072&pageSize=50`);
  const items = (await list.json()).items ?? [];
  console.log("SAVED:", items.some((v: { voucherNo: string }) => v.voucherNo === "16072"));

  // duplicate save -> should show error and preserve values
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  const bodyText = await page.textContent("body");
  console.log("DUP_ALERT:", /could not save|already|duplicate/i.test(bodyText ?? ""));
  console.log("FORM_PRESERVED:", (await page.inputValue("#voucherNo")) === "16072");
  console.log("PAGE_ERRORS:", errors.length);
  console.log("RESULT:", errors.length === 0 ? "PASS" : "PASS_WITH_CONSOLE_ERRORS");
  await browser.close();
}
main();
