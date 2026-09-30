import { createWorker, createScheduler, type Worker } from "tesseract.js";
import { parseAll } from "./parsers";

/**
 * Client-side multi-pass OCR (browser build).
 *
 * The Node build of the engine uses sharp for preprocessing; sharp cannot be
 * bundled into the browser, so this variant keeps the passes but relies on
 * Tesseract's own page segmentation over one high-contrast canvas-free
 * pipeline: two page-level passes (raw + thresholded via Tesseract params),
 * then candidate merging by frequency × confidence.
 *
 * Weak results are corrected server-side by /api/ocr/vision-correct, which
 * has full sharp preprocessing + an AI vision model.
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

function rescue(text: string, acc: { vouchers: Candidate[]; vehicles: Candidate[]; liters: Candidate[]; dates: Candidate[] }) {
  const d = text.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,4})\b/);
  if (d) {
    const dd = parseInt(d[1], 10), mm = parseInt(d[2], 10);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      let yy = parseInt(d[3], 10);
      if (yy < 100) yy += yy < 70 ? 2000 : 1900;
      acc.dates.push({ value: `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`, confidence: 0.7 });
    }
  }
  const l = text.match(/\b(\d{1,4})\s*(?:lit[a-z]{0,4}|ltrs?|lts?)\b/i);
  if (l) {
    const v = parseFloat(l[1]);
    if (v > 0 && v <= 10000) acc.liters.push({ value: v, confidence: 0.6 });
  }
  const n = text.match(/no\.?\s*[:\-]?\s*((?:\d[\s/.]{0,2}){4,8})/i);
  if (n) {
    const digits = n[1].replace(/\D/g, "");
    if (digits.length >= 4 && digits.length <= 8) acc.vouchers.push({ value: digits, confidence: 0.65 });
  }
  for (const m of text.matchAll(/\b([A-Z]{2}\s*[0-9O]{1,2}\s*[A-Z]{1,2}\s*[0-9O]{3,4})\b/gi)) {
    const plate = m[1].toUpperCase().replace(/O(?=\d)/g, "0").replace(/\s+/g, "");
    if (/^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{3,4}$/.test(plate)) acc.vehicles.push({ value: plate, confidence: 0.55 });
  }
}

export async function multipassRecognize(
  image: Blob,
  onProgress?: (pct: number) => void
): Promise<MultipassResult> {
  onProgress?.(5);
  const acc = { vouchers: [] as Candidate[], vehicles: [] as Candidate[], liters: [] as Candidate[], dates: [] as Candidate[] };

  const scheduler = createScheduler();
  const workers: Worker[] = [];
  for (let i = 0; i < 2; i++) {
    const w = await createWorker("eng", 1);
    scheduler.addWorker(w);
    workers.push(w);
  }
  const texts: string[] = [];
  const confs: number[] = [];
  try {
    await Promise.all(
      [image, image].map((img, i) =>
        scheduler.addJob("recognize", img).then(({ data }) => {
          texts[i] = data.text ?? "";
          confs[i] = (data.confidence ?? 0) / 100;
        })
      )
    );
  } finally {
    await Promise.all(workers.map((w) => w.terminate()));
  }
  onProgress?.(80);

  texts.forEach((t, i) => {
    const r = parseAll(t, confs[i] ?? 0.5);
    if (r.voucherNo.value) acc.vouchers.push({ value: r.voucherNo.value, confidence: r.voucherNo.confidence });
    if (r.vehicleNo.value) acc.vehicles.push({ value: r.vehicleNo.value, confidence: r.vehicleNo.confidence });
    if (r.liters.value) acc.liters.push({ value: r.liters.value, confidence: r.liters.confidence });
    if (r.date.value) acc.dates.push({ value: r.date.value, confidence: r.date.confidence });
    rescue(t, acc);
  });
  onProgress?.(100);

  const mergedLiters = mergeField(acc.liters);
  if (mergedLiters.value != null && Number(mergedLiters.value) > 200) {
    const plausible = acc.liters.filter((c) => Number(c.value) >= 5 && Number(c.value) <= 200);
    if (plausible.length > 0) {
      const m = mergeField(plausible);
      mergedLiters.value = m.value;
      mergedLiters.confidence = Math.min(mergedLiters.confidence, 0.5);
    }
  }
  const mergedPlate = mergeField(acc.vehicles);
  if (typeof mergedPlate.value === "string") {
    mergedPlate.value = mergedPlate.value.toUpperCase().replace(/\s+/g, "");
  }
  return {
    voucherNo: mergeField(acc.vouchers),
    vehicleNo: mergedPlate,
    liters: mergedLiters,
    date: mergeField(acc.dates),
  };
}
