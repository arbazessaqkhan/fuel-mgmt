import { chromium } from "playwright";
async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("console", (m) => console.log("CONSOLE:", m.type(), m.text().slice(0, 200)));
  page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 300)));
  await page.goto("http://localhost:3000/scan", { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').setInputFiles("/workspace/userDocs/image_39ae5479.png");
  await page.waitForTimeout(15000);
  for (const id of ["voucherNo","vehicleNo","liters","date"]) {
    console.log(id, "=", JSON.stringify(await page.inputValue("#" + id)));
  }
  const toasts = await page.textContent("body");
  console.log("has toast:", /scan complete|could not read/i.test(toasts ?? ""));
  await browser.close();
}
main();
