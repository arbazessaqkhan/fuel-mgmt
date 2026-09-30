import { createWorker } from "tesseract.js";
import { readFileSync } from "fs";
import { parseAll } from "../src/lib/ocr/parsers";

/** Upscale + boost contrast with sharp, then OCR — helps small handwritten text. */
async function main() {
  const sharp = (await import("sharp")).default;
  const src = "/workspace/userDocs/image_39ae5479.png";
  const buf = await sharp(src)
    .grayscale()
    .resize({ width: 2400 }) // ~2x upscale
    .normalise() // stretch contrast
    .sharpen()
    .png()
    .toBuffer();

  const w = await createWorker("eng", 1);
  const { data } = await w.recognize(buf);
  console.log("CONF:", data.confidence);
  console.log("-----TEXT-----");
  console.log(data.text);
  console.log("-----PARSED-----");
  const r = parseAll(data.text, data.confidence / 100);
  console.log(JSON.stringify({
    voucherNo: r.voucherNo.value, vehicleNo: r.vehicleNo.value,
    liters: r.liters.value, date: r.date.value,
  }, null, 1));
  await w.terminate();
}
main();
