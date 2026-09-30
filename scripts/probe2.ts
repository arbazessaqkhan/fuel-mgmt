import { chromium } from "playwright";
async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("request", (r) => { if (r.url().includes("vision-correct")) console.log("REQ:", r.method(), r.url()); });
  page.on("response", async (r) => { if (r.url().includes("vision-correct")) console.log("RES:", r.status(), (await r.text().catch(()=>"<body>")).slice(0,200)); });
  await page.goto("http://localhost:3000/scan", { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').setInputFiles("/workspace/userDocs/image_39ae5479.png");
  await page.waitForTimeout(60000);
  for (const id of ["voucherNo","vehicleNo","liters","date"]) console.log(id, "=", JSON.stringify(await page.inputValue("#" + id)));
  await browser.close();
}
main();
