/* Phase 4 ticket #13487 E2E: premium UI overhaul.
 * Checks tokens applied, header/active nav, dark toggle + persistence,
 * and no horizontal overflow at 1440px and 390px. */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
let pass = true;
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
  if (!ok) pass = false;
}

(async () => {
  const browser = await chromium.launch();

  // Desktop pass
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(BASE + "/", { waitUntil: "networkidle" });

  // 1. Tokens applied: primary color on active nav link, card bg, Geist font
  const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  check("Geist typography (not Arial)", /geist/i.test(font), font.slice(0, 60));

  const navActive = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll("header nav a")).find((a) =>
      a.textContent.includes("Dashboard")
    );
    return el ? getComputedStyle(el).backgroundColor : "";
  });
  check("Active nav link styled with brand primary", navActive && navActive !== "rgba(0, 0, 0, 0)", navActive);

  const cardShadow = await page.evaluate(() => {
    const card = document.querySelector(".card-premium");
    return card ? getComputedStyle(card).boxShadow : "";
  });
  check("Premium card shadow applied", cardShadow && cardShadow !== "none");

  // 2. Header sticky + brand
  const sticky = await page.evaluate(() => {
    const h = document.querySelector("header");
    return h ? getComputedStyle(h).position : "";
  });
  check("Header sticky", sticky === "sticky" || sticky === "fixed", sticky);
  const brand = await page.locator("header").textContent();
  check("Header brand present", brand.includes("FuelLog") && brand.includes("Fleet Manager"));

  // 3. Dark mode toggle + persistence
  await page.evaluate(() => localStorage.setItem("theme", "light"));
  await page.reload({ waitUntil: "networkidle" });
  const htmlClassBefore = await page.evaluate(() => document.documentElement.className);
  await page.click('button[aria-label="Toggle theme"]');
  await page.waitForTimeout(400);
  const htmlClassAfter = await page.evaluate(() => document.documentElement.className);
  check("Dark toggle flips <html> class", htmlClassBefore !== htmlClassAfter,
        `${JSON.stringify(htmlClassBefore)} -> ${JSON.stringify(htmlClassAfter)}`);
  const bgDark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.reload({ waitUntil: "networkidle" });
  const htmlClassPersist = await page.evaluate(() => document.documentElement.className);
  const bgPersist = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check("Dark theme persists after reload", htmlClassPersist.includes("dark") && bgDark === bgPersist,
        `class=${JSON.stringify(htmlClassPersist)} bg=${bgPersist}`);

  // back to light
  await page.click('button[aria-label="Toggle theme"]');
  await page.waitForTimeout(300);

  // 4. Metric cards premium treatment
  const metricInfo = await page.evaluate(() => {
    const chips = document.querySelectorAll(".card-premium .bg-gradient-to-br");
    const val = document.querySelector(".card-premium .tabular-nums");
    return { chips: chips.length, numeral: val ? getComputedStyle(val).fontSize : "" };
  });
  check("Metric cards: icon chips + large numerals", metricInfo.chips >= 3 && parseFloat(metricInfo.numeral) >= 28,
        `chips=${metricInfo.chips} fontSize=${metricInfo.numeral}`);

  // 5. No horizontal overflow at 1440 and 390
  const overflow1440 = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("No horizontal overflow @1440", overflow1440 <= 0, `delta=${overflow1440}`);

  const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mob.goto(BASE + "/", { waitUntil: "networkidle" });
  const overflow390 = await mob.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("No horizontal overflow @390", overflow390 <= 0, `delta=${overflow390}`);
  await mob.screenshot({ path: "/tmp/ui-390.png", fullPage: true });

  // 6. Scan page still fine + nav works client-side
  await page.click('header nav a:has-text("Scan Voucher")');
  await page.waitForURL("**/scan");
  await page.waitForTimeout(500);
  const scanHeading = await page.locator("h1").textContent();
  check("Client-side nav to /scan works", scanHeading.includes("Scan Fuel Voucher"));
  const overflowScan = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("No overflow on /scan @1440", overflowScan <= 0, `delta=${overflowScan}`);

  await page.screenshot({ path: "/tmp/ui-1440-dark-then-light.png", fullPage: true });

  check("No page errors", errors.length === 0, errors.join("; ").slice(0, 200));
  console.log(pass ? "RESULT: ALL PASS" : "RESULT: FAIL");
  await browser.close();
  process.exit(pass ? 0 : 1);
})();
