import { createWorker, createScheduler, type Worker } from "tesseract.js";
import { readFileSync } from "fs";
import { parseAll } from "./parsers";
import sharp from "sharp";

/**
 * Multi-pass OCR: runs Tesseract over several preprocessed variants of the
 * image (raw upscale, thresholded, left-stub crop) and merges the results,
 * keeping the most frequent / highest-confidence value per field. This makes
 * the extraction much more resilient on real photographed vouchers
 * (handwriting, red stamps, two duplicate stubs) than a single raw pass.
 */

interface Candidate {
  value: string | number;
  confidence: number;
}

function mergeField(cands: Candidate[]): { value: string | number | null; confidence: number } {
  if (cands.length === 0) return { value: null, confidence: 0 };
  // normalize to string keys for frequency counting
  const norm = (v: string | number) => String(v).toUpperCase().replace(/\s+/g, "");
  const counts = new Map<string, { count: number; best: Candidate; score: number }>();
  for (const c of cands) {
    const key = norm(c.value);
    const cur = counts.get(key);
    // score: frequency boost + confidence; OCR agreeing across passes is a strong signal
    const score = (cur?.score ?? 0) + c.confidence;
    if (!cur) counts.set(key, { count: 1, best: c, score: c.confidence });
    else {
      cur.count += 1;
      cur.score = score;
      if (c.confidence > cur.best.confidence) cur.best = c;
    }
  }
  let bestKey: string | null = null;
  let bestScore = -1;
  let bestMeta = { count: 0, best: { value: null as string | number | null, confidence: 0 }, score: 0 };
  for (const [key, meta] of counts) {
    const s = meta.score * (1 + (meta.count - 1) * 0.5);
    if (s > bestScore) {
      bestScore = s;
      bestKey = key;
      bestMeta = meta;
    }
  }
  if (!bestKey) return { value: null, confidence: 0 };
  return { value: bestMeta.best.value, confidence: Math.min(1, bestMeta.best.confidence * (1 + (bestMeta.count - 1) * 0.25)) };
}

async function variants(src: string): Promise<Buffer[]> {
  const meta = await sharp(src).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  const out: Buffer[] = [];
  // 1. full image, big upscale, grayscale + mild contrast
  out.push(await sharp(src).resize({ width: 3000, kernel: "lanczos3" }).grayscale().normalise().sharpen().png().toBuffer());
  // 2. thresholded — stamps & ballpoint ink go solid black
  out.push(await sharp(src).resize({ width: 3000, kernel: "lanczos3" }).grayscale().normalise().threshold(150).png().toBuffer());
  // 3-4. one pass per stub (handwritten vouchers are usually carbon-copy duplicates
  // side by side; reading each stub separately avoids the perforation confusing OCR)
  const half = Math.floor(W / 2);
  out.push(await sharp(src).extract({ left: 0, top: 0, width: half, height: H }).resize({ width: 3200, kernel: "lanczos3" }).grayscale().normalise().sharpen().png().toBuffer());
  out.push(await sharp(src).extract({ left: half, top: 0, width: W - half, height: H }).resize({ width: 3200, kernel: "lanczos3" }).grayscale().normalise().sharpen().png().toBuffer());
  // 5-8. region crops — each targets the known field bands of a stub
  //      (top stamp/date band, veh line, diesel/petrol lines)
  for (const [lx, ly, lx2] of [[0.0, 0.0, 0.5], [0.5, 0.0, 1.0]] as Array<[number, number, number]>) {
    const left = Math.floor(W * lx), width = Math.floor(W * (lx2 - lx));
    // top band: No. + stamped number + date
    out.push(await sharp(src).extract({ left, top: 0, width, height: Math.floor(H * 0.25) })
      .resize({ width: 2800, kernel: "lanczos3" }).grayscale().normalise().threshold(170).png().toBuffer());
    // veh line band
    out.push(await sharp(src).extract({ left, top: Math.floor(H * 0.3), width, height: Math.floor(H * 0.2) })
      .resize({ width: 2800, kernel: "lanczos3" }).grayscale().normalise().sharpen().png().toBuffer());
    // fuel band (petrol + diesel rows)
    out.push(await sharp(src).extract({ left, top: Math.floor(H * 0.48), width, height: Math.floor(H * 0.24) })
      .resize({ width: 2800, kernel: "lanczos3" }).grayscale().normalise().sharpen().png().toBuffer());
  }
  return out;
}

async function main() {
  const src = process.argv[2] ?? "/workspace/userDocs/image_39ae5479.png";
  const bufs = await variants(src);
  const scheduler = createScheduler();
  const workers: Worker[] = [];
  // 4 workers share the passes
  for (let i = 0; i < 4; i++) {
    const w = await createWorker("eng", 1);
    scheduler.addWorker(w);
    workers.push(w);
  }
  const texts: string[] = [];
  const confs: number[] = [];
  await Promise.all(
    bufs.map((buf, i) =>
      scheduler.addJob("recognize", buf).then(({ data }) => {
        texts[i] = data.text;
        confs[i] = data.confidence;
      })
    )
  );
  await Promise.all(workers.map((w) => w.terminate()));

  const vouchers: Candidate[] = [];
  const vehicles: Candidate[] = [];
  const liters: Candidate[] = [];
  const dates: Candidate[] = [];

  /**
   * Focused regex rescues for handwritten voucher field bands that Tesseract
   * garbles at the page level. Applied per-pass to targeted crop text.
   */
  function rescue(text: string) {
    // date: 29/9/26-style tokens anywhere in band crops
    const d = text.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2})\b/);
    if (d) {
      const dd = parseInt(d[1], 10), mm = parseInt(d[2], 10);
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        const yy = parseInt(d[3], 10);
      const century = yy < 70 ? 2000 : 1900;
      const iso = `${century + yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
        dates.push({ value: iso, confidence: 0.7 });
      }
    }
    // liters: digits directly followed by any litres-like token (litres/Lts/…)
    const l = text.match(/\b(\d{1,4})\s*(?:lit[a-z]{0,4}|ltrs?|lts?)\b/i);
    if (l) {
      const v = parseFloat(l[1]);
      if (v > 0 && v <= 10000) liters.push({ value: v, confidence: 0.6 });
    }
    // voucher: "No." label then bare digits (possibly spaced: "1 6 0 7 2")
    const n = text.match(/no\.?\s*[:\-]?\s*((?:\d[\s/.]{0,2}){4,8})/i);
    if (n) {
      const digits = n[1].replace(/\D/g, "");
      if (digits.length >= 4 && digits.length <= 8)
        vouchers.push({ value: digits, confidence: 0.65 });
    }
    // vehicle: compact plate token — letters+digits run ≥6 chars mixing both
    for (const m of text.matchAll(/\b([A-Z]{2}\s*[0-9O]{1,2}\s*[A-Z]{1,2}\s*[0-9O]{3,4})\b/gi)) {
      const plate = m[1].toUpperCase().replace(/O(?=\d)/g, "0").replace(/\s+/g, "");
      if (/^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{3,4}$/.test(plate))
        vehicles.push({ value: plate, confidence: 0.55 });
    }
  }

  texts.forEach((t, i) => {
    const r = parseAll(t, (confs[i] ?? 0) / 100);
    if (r.voucherNo.value) vouchers.push({ value: r.voucherNo.value, confidence: r.voucherNo.confidence });
    if (r.vehicleNo.value) vehicles.push({ value: r.vehicleNo.value, confidence: r.vehicleNo.confidence });
    if (r.liters.value) liters.push({ value: r.liters.value, confidence: r.liters.confidence });
    if (r.date.value) dates.push({ value: r.date.value, confidence: r.date.confidence });
    rescue(t);
  });

  // Sanity rescue for liters: if the merged liters is implausible but a smaller
  // candidate exists that matches the "typical fill range" (5–200 L), prefer it.
  const mergedLiters = mergeField(liters);
  if (mergedLiters.value != null && Number(mergedLiters.value) > 200) {
    const plausible = liters.filter((c) => Number(c.value) >= 5 && Number(c.value) <= 200);
    if (plausible.length > 0) {
      const m = mergeField(plausible);
      mergedLiters.value = m.value;
      mergedLiters.confidence = Math.min(mergedLiters.confidence, 0.5); // flagged for review
    }
  }

  // Normalize vehicle plates: uppercase + strip inner spaces (JK02DW6302 style)
  const mergedPlate = mergeField(vehicles);
  if (typeof mergedPlate.value === "string") {
    mergedPlate.value = mergedPlate.value.toUpperCase().replace(/\s+/g, "");
  }

  const merged = {
    voucherNo: mergeField(vouchers),
    vehicleNo: mergedPlate,
    liters: mergedLiters,
    date: mergeField(dates),
  };
  console.log("PARSERS saw", texts.length, "passes; confs:", confs.map((c) => Math.round(c)).join(","));
  console.log(JSON.stringify(merged, null, 1));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
