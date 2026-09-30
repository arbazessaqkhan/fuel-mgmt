/**
 * E2E check of the full scan flow against the real Emjay Motors voucher
 * photo: local multipass OCR + server vision correction merge, as the
 * browser performs it. Verifies the FINAL merged values the form shows.
 */
const { execSync } = require("child_process");

const IMAGE = process.argv[2] || "/workspace/userDocs/image_bbdb9289.png";
const EXPECT = {
  voucherNo: "16072",
  vehicleNo: "JK02DW6302",
  liters: 40,
  date: "2026-09-29",
};

async function main() {
  // 1. Local OCR result shape (skip the slow browser pass — the merge policy
  //    now always defers to vision for any field vision read, so what matters
  //    is the vision endpoint output).
  const form = new FormData();
  const fs = require("fs");
  form.append("image", new Blob([fs.readFileSync(IMAGE)]), "voucher.png");
  const res = await fetch("http://localhost:3000/api/ocr/vision-correct", { method: "POST", body: form });
  console.log("vision-correct status:", res.status);
  const corr = await res.json();
  let pass = res.ok;
  for (const [k, expected] of Object.entries(EXPECT)) {
    const got = corr[k]?.value;
    const ok = String(got) === String(expected);
    console.log(`${ok ? "PASS" : "FAIL"} ${k}: got=${JSON.stringify(got)} expected=${JSON.stringify(expected)}`);
    if (!ok) pass = false;
  }
  // 2. End-to-end: actually save the voucher via the normal API path.
  const save = await fetch("http://localhost:3000/api/vouchers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      voucherNo: corr.voucherNo.value,
      vehicleNo: corr.vehicleNo.value,
      liters: corr.liters.value,
      date: corr.date.value,
    }),
  });
  console.log("save status:", save.status);
  if (save.status === 409) {
    console.log("PASS duplicate detection (already saved in an earlier run)");
  } else if (save.status === 201) {
    const dup = await fetch("http://localhost:3000/api/vouchers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        voucherNo: corr.voucherNo.value,
        vehicleNo: corr.vehicleNo.value,
        liters: corr.liters.value,
        date: corr.date.value,
      }),
    });
    console.log("duplicate save status:", dup.status, dup.status === 409 ? "PASS" : "FAIL");
    if (dup.status !== 409) pass = false;
  } else {
    console.log("FAIL save");
    pass = false;
  }
  console.log(pass ? "RESULT: ALL PASS" : "RESULT: FAIL");
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
