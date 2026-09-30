/* Browser E2E: upload the real voucher photo on /scan and verify the
 * verification form is pre-filled with the correct values. */
const { chromium } = require("playwright");

const IMAGE = process.argv[2] || "/workspace/userDocs/image_bbdb9289.png";
const EXPECT = { voucherNo: "16072", vehicleNo: "JK02DW6302", liters: "40", date: "2026-09-29" };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("http://localhost:3000/scan", { waitUntil: "networkidle" });
  await page.setInputFiles('input[type="file"]', IMAGE);
  // Poll until the vision round-trip has filled the form (Tesseract runs
  // first in-browser and can take 1-3 minutes on a large photo).
  let vals = [];
  for (let i = 0; i < 48; i++) {
    await page.waitForTimeout(5000);
    vals = await page.evaluate(() =>
      Array.from(document.querySelectorAll("input")).map((i) => `${i.id || i.name || "?"}=${i.value}`)
    );
    const joined = vals.join(" ");
    if ((joined.includes("voucherNo=") && !joined.includes("voucherNo=\n") &&
         vals.some((v) => v.startsWith("liters=") && v !== "liters=")) ||
        vals.some((v) => v.includes(EXPECT.voucherNo))) {
      if (vals.some((v) => v.includes(EXPECT.voucherNo))) break;
    }
  }
  console.log("form values:", JSON.stringify(vals, null, 0));
  const joined = vals.join(" ");
  const pass = joined.includes(`voucherNo=${EXPECT.voucherNo}`) &&
    joined.includes(`vehicleNo=${EXPECT.vehicleNo}`) &&
    joined.includes(`liters=${EXPECT.liters}`) &&
    joined.includes(`date=${EXPECT.date}`);
  console.log("console/page errors:", errors.length ? errors : "none");
  console.log(pass ? "RESULT: BROWSER PASS" : "RESULT: BROWSER FAIL");
  await browser.close();
  process.exit(pass ? 0 : 1);
})();
