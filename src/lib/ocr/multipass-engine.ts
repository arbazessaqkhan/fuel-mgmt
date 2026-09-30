import { createWorker, createScheduler, type Worker } from "tesseract.js";
import sharp from "sharp";
import { parseAll } from "./parsers";

/**
 * Multi-pass OCR engine, anchor-based.
 *
 * Real photographed vouchers (handwriting, red stamps, two carbon-copy stubs)
 * produce unstable single-pass Tesseract reads, and fixed fractional crops
 * miss field bands when the photo framing varies. Instead this engine:
 *   1. runs a page-level pass and reads word bounding boxes (via TSV),
 *   2. finds the printed LABELS ("No.", "Date", "Veh No.", "Diesel") as
 *      anchors and derives tight field crops to the right of each label,
 *   3. re-OCRs each anchor crop upscaled, with a character whitelist
 *      (digits for voucher/date/liters, A-Z0-9 for the vehicle plate),
 *   4. merges every field candidate across passes by frequency × confidence.
 */

export interface FieldResult {
  value: string | number | null;
  confidence: number;
}

export interface MultipassResult {
  voucherNo: FieldResult;
  vehicleNo: FieldResult;
  liters: FieldResult;
  date: FieldResult;
}

interface Candidate {
  value: string | number;
  confidence: number;
}

interface WordBox {
  text: string;
  confidence: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function mergeField(cands: Candidate[]): FieldResult {
  if (cands.length === 0) return { value: null, confidence: 0 };
  const norm = (v: string | number) => String(v).toUpperCase().replace(/\s+/g, "");
  const counts = new Map<string, { count: number; best: Candidate; score: number }>();
  for (const c of cands) {
    const key = norm(c.value);
    const cur = counts.get(key);
    if (!cur) counts.set(key, { count: 1, best: c, score: c.confidence });
    else {
      cur.count += 1;
      cur.score += c.confidence;
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
  return {
    value: bestMeta.best.value,
    confidence: Math.min(1, bestMeta.best.confidence * (1 + (bestMeta.count - 1) * 0.25)),
  };
}

/** Extract words with boxes from a recognize call (walks block hierarchy). */
async function pagePass(buf: Buffer): Promise<{ text: string; confidence: number; words: WordBox[] }> {
  const w = await createWorker("eng", 1);
  try {
    const { data } = await w.recognize(buf, {}, { blocks: true, text: true });
    const words: WordBox[] = [];
    type Node = { text?: string; confidence?: number; bbox?: { x0: number; y0: number; x1: number; y1: number }; paragraphs?: Node[]; lines?: Node[]; words?: Node[] };
    const walk = (n: Node) => {
      if (n.words) {
        for (const word of n.words) {
          if (word.text?.trim() && word.bbox) {
            words.push({
              text: word.text,
              confidence: word.confidence ?? 0,
              x0: word.bbox.x0, y0: word.bbox.y0, x1: word.bbox.x1, y1: word.bbox.y1,
            });
          }
        }
      }
      if (n.paragraphs) n.paragraphs.forEach((p) => p.lines?.forEach(walk));
      if (n.lines) n.lines.forEach(walk);
    };
    ((data.blocks ?? []) as unknown as Node[]).forEach(walk);
    return { text: data.text ?? "", confidence: (data.confidence ?? 0) / 100, words };
  } finally {
    await w.terminate();
  }
}

/** One whitelisted OCR pass on a buffer. */
async function whitelistedRecognize(buf: Buffer, whitelist: string, psm: string): Promise<string> {
  const w = await createWorker("eng", 1);
  try {
    await w.setParameters({ tessedit_char_whitelist: whitelist, tessedit_pageseg_mode: psm as never });
    const { data } = await w.recognize(buf);
    return data.text ?? "";
  } finally {
    await w.terminate();
  }
}

const normText = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

interface Anchor {
  label: WordBox;
  stubLeft: number;
  stubRight: number;
}

/** Group page words into stub halves using the "CREDIT VOUCHER" headers. */
function stubRanges(words: WordBox[], pageW: number): Array<{ left: number; right: number }> {
  const headers = words
    .filter((w) => normText(w.text).startsWith("CREDIT"))
    .sort((a, b) => a.x0 - b.x0);
  if (headers.length === 0) return [{ left: 0, right: pageW }];
  return headers.map((h, i) => {
    const left = Math.max(0, Math.floor(h.x0 * 0.7));
    const right = i + 1 < headers.length ? Math.floor(headers[i + 1].x0 * 0.95) : pageW;
    return { left, right: Math.max(right, left + 100) };
  });
}

export async function multipassRecognize(
  image: Buffer,
  onProgress?: (pct: number) => void
): Promise<MultipassResult> {
  onProgress?.(2);

  // -- page-level passes ----------------------------------------------------
  const acc = { vouchers: [] as Candidate[], vehicles: [] as Candidate[], liters: [] as Candidate[], dates: [] as Candidate[] };

  const meta = await sharp(image).metadata();
  const pageW = meta.width ?? 0;
  const pageH = meta.height ?? 0;

  const big = await sharp(image).resize({ width: 3000, kernel: "lanczos3" }).grayscale().normalise().sharpen().png().toBuffer();
  const pass1 = await pagePass(big);
  onProgress?.(15);

  // Parse full-page text from pass 1 (labels are usually readable enough).
  const r1 = parseAll(pass1.text, pass1.confidence);
  if (r1.voucherNo.value) acc.vouchers.push({ value: r1.voucherNo.value, confidence: r1.voucherNo.confidence });
  if (r1.vehicleNo.value) acc.vehicles.push({ value: r1.vehicleNo.value, confidence: r1.vehicleNo.confidence });
  if (r1.liters.value) acc.liters.push({ value: r1.liters.value, confidence: r1.liters.confidence });
  if (r1.date.value) acc.dates.push({ value: r1.date.value, confidence: r1.date.confidence });

  // Words coords are in the 3000px space; scale factors to original.
  const sx = pageW / 3000;
  const sy = pageH / ((await sharp(big).metadata()).height ?? pageH);

  const stubs = stubRanges(
    pass1.words.map((w) => ({ ...w, x0: w.x0 * sx, x1: w.x1 * sx, y0: w.y0 * sy, y1: w.y1 * sy })),
    pageW
  );

  // -- anchor-based field crops ---------------------------------------------
  const crops: Array<{ buf: Buffer; kind: "voucher" | "date" | "veh" | "liters" }> = [];

  const cropTo = async (region: { left: number; top: number; width: number; height: number }, outW: number, threshold?: number) => {
    let p = sharp(image).extract({
      left: Math.max(0, Math.floor(region.left)),
      top: Math.max(0, Math.floor(region.top)),
      width: Math.min(Math.ceil(region.width), pageW - Math.floor(region.left)),
      height: Math.min(Math.ceil(region.height), pageH - Math.floor(region.top)),
    }).resize({ width: outW, kernel: "lanczos3" }).grayscale().normalise();
    if (threshold !== undefined) p = p.threshold(threshold);
    return p.sharpen().png().toBuffer();
  };

  for (const stub of stubs) {
    const stubWords = pass1.words
      .map((w) => ({ ...w, x0: w.x0 * sx, x1: w.x1 * sx, y0: w.y0 * sy, y1: w.y1 * sy }))
      .filter((w) => w.x0 >= stub.left && w.x0 < stub.right);
    const find = (pred: (t: string) => boolean) => stubWords.find((w) => pred(normText(w.text)));
    const findAll = (pred: (t: string) => boolean) => stubWords.filter((w) => pred(normText(w.text)));

    // Voucher No: the TOPMOST "No." label in the stub (later "No." hits belong
    // to the "Veh No." line and would mis-anchor the crop).
    const noLabel = findAll((t) => t === "NO" || t === "N0").sort((a, b) => a.y0 - b.y0)[0];
    const voucherY = noLabel ? noLabel.y0 : stubWords[0]?.y0 ?? 0;
    crops.push({
      kind: "voucher",
      buf: await cropTo(
        { left: stub.left, top: voucherY - 12, width: (stub.right - stub.left) * 0.85, height: (noLabel ? noLabel.y1 - noLabel.y0 : 45) * 1.8 + 24 },
        2400,
        170
      ),
    });
    // Date: same top band, right quarter of the stub
    crops.push({
      kind: "date",
      buf: await cropTo(
        { left: stub.left + (stub.right - stub.left) * 0.62, top: Math.max(0, voucherY - 15), width: (stub.right - stub.left) * 0.38, height: (noLabel ? (noLabel.y1 - noLabel.y0) * 2 : 70) + 30 },
        2000
      ),
    });
    // Vehicle: right of "Veh No."
    const veh = find((t) => t.startsWith("VEH") || t === "VN");
    if (veh) {
      crops.push({
        kind: "veh",
        buf: await cropTo(
          { left: veh.x1, top: veh.y0 - 10, width: (stub.right - stub.left) * 0.55, height: (veh.y1 - veh.y0) * 1.6 + 20 },
          2400
        ),
      });
    }
    // Diesel row: right of "Diesel" label, extend to stub end (handwritten
    // value + "litres" sit far right on the line)
    const diesel = find((t) => t.startsWith("DIESEL"));
    if (diesel) {
      crops.push({
        kind: "liters",
        buf: await cropTo(
          { left: diesel.x1, top: diesel.y0 - 25, width: stub.right - diesel.x1, height: (diesel.y1 - diesel.y0) * 1.8 + 50 },
          2600
        ),
      });
    }
  }
  onProgress?.(30);

  // OCR each crop with the right whitelist (PSM 7 single line / 6 block)
  let done = 0;
  for (const crop of crops) {
    try {
      const whitelist =
        crop.kind === "veh" ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" : "0123456789/.";
      for (const psm of ["7", "6"]) {
        const t = await whitelistedRecognize(crop.buf, whitelist, psm);
        collect(crop.kind, t, psm === "7" ? 0.75 : 0.65, acc);
      }
    } catch {
      // crop OCR failure is non-fatal — other passes still contribute
    }
    done += 1;
    onProgress?.(30 + Math.round((done / Math.max(1, crops.length)) * 55));
  }

  // -- blue-channel rescue for red-stamped voucher number --------------------
  // Red ink turns dark in the blue channel; stamps vanish in grayscale.
  try {
    for (const stub of stubs) {
      for (const th of [120, 140, 170]) {
        const blue = await sharp(image)
          .extract({ left: stub.left, top: 0, width: Math.min(stub.right - stub.left, pageW - stub.left), height: Math.min(Math.floor(pageH * 0.22), pageH) })
          .extractChannel(2).normalise().resize({ width: 2400 }).threshold(th).png().toBuffer();
        const t = await whitelistedRecognize(blue, "0123456789", "6");
        const digits = t.replace(/\D/g, "");
        if (digits.length >= 4 && digits.length <= 8) {
          acc.vouchers.push({ value: digits, confidence: 0.75 });
        }
      }
    }
  } catch {
    // non-fatal
  }

  // -- merge ----------------------------------------------------------------
  const mergedLiters = mergeField(acc.liters);
  if (mergedLiters.value != null && Number(mergedLiters.value) > 200) {
    const plausible = acc.liters.filter((c) => Number(c.value) >= 5 && Number(c.value) <= 200);
    if (plausible.length > 0) {
      const m = mergeField(plausible);
      mergedLiters.value = m.value;
      mergedLiters.confidence = Math.min(mergedLiters.confidence, 0.5); // flagged for review
    }
  }
  const mergedPlate = mergeField(acc.vehicles);
  if (typeof mergedPlate.value === "string") {
    mergedPlate.value = mergedPlate.value.toUpperCase().replace(/\s+/g, "");
  }

  onProgress?.(100);
  return {
    voucherNo: mergeField(acc.vouchers),
    vehicleNo: mergedPlate,
    liters: mergedLiters,
    date: mergeField(acc.dates),
  };
}

/** Interpret whitelisted crop text for a field kind and accumulate candidates. */
function collect(
  kind: "voucher" | "date" | "veh" | "liters",
  text: string,
  confidence: number,
  acc: { vouchers: Candidate[]; vehicles: Candidate[]; liters: Candidate[]; dates: Candidate[] }
) {
  const clean = text.trim();
  if (!clean) return;
  if (kind === "voucher") {
    const digits = clean.replace(/\D/g, "");
    if (digits.length >= 4 && digits.length <= 8) acc.vouchers.push({ value: digits, confidence });
  } else if (kind === "date") {
    for (const m of clean.matchAll(/(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,4})/g)) {
      const dd = parseInt(m[1], 10);
      const mm = parseInt(m[2], 10);
      let yy = parseInt(m[3], 10);
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        if (yy < 100) yy += yy < 70 ? 2000 : 1900;
        acc.dates.push({ value: `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`, confidence });
      }
    }
  } else if (kind === "veh") {
    const plate = normText(clean).replace(/O(?=\d)/g, "0");
    if (/^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{3,4}$/.test(plate)) {
      acc.vehicles.push({ value: plate, confidence });
    }
  } else if (kind === "liters") {
    // Handwritten "40 litres" — accept a short digit run (1-3 digits, optional decimal)
    for (const m of clean.matchAll(/\b(\d{1,3}(?:\.\d{1,2})?)\b/g)) {
      const v = parseFloat(m[1]);
      if (v >= 2 && v <= 400) acc.liters.push({ value: v, confidence: confidence * 0.8 });
    }
  }
}
