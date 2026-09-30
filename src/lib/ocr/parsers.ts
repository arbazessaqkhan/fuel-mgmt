import type { OcrFieldResult, OcrResult } from "./types";

/**
 * Regex/pattern extraction of fuel-voucher fields from raw OCR text.
 * Pure functions — easy to unit test and reuse across OCR engines.
 */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function clean(text: string): string {
  return text.replace(/\u00a0/g, " ").replace(/[|]/g, " ");
}

/**
 * Match a labeled field like "Voucher No: X" without crossing line breaks.
 */
function labeled(text: string, label: RegExp, value: RegExp): string | null {
  const lines = text.split(/\n+/);
  for (const line of lines) {
    const m = line.match(label);
    if (!m) continue;
    const v = line.slice(m[0].length).trim().match(value);
    if (v?.[1]) return v[1];
  }
  return null;
}

/** Alphanumeric (or bare numeric) voucher identifier. */
export function parseVoucherNo(text: string): OcrFieldResult<string> {
  const t = clean(text);
  // Bare "No." + digits only when the value is pure digits (a prefixed id like
  // "Voucher No: FV-2026-0042" must fall through to the labeled alpha patterns).
  const line = t.split(/\n+/).find((l) => /(?:voucher\s*)?no\.?\s*[:#\-.]?\s*\d{3,8}(?!\d)/i.test(l) && !/voucher\s*no/i.test(l.replace(/no\.\s*[\d-]+/i, "")));
  const bareNo = line ? labeled(t, /(?:voucher\s*)?no\.?\s*[:#\-.]?\s*/i, /[ \t]*(\d{3,8})(?!\d)/) : null;
  if (bareNo && !/-/.test(bareNo)) return { value: bareNo, confidence: 0.9, raw: bareNo };
  const labeledValue =
    labeled(t, /voucher\s*(?:no|number|#)?\s*[:#-]\s*/i, /[ \t]*([A-Z0-9][A-Z0-9\-/]{2,20})/i) ??
    labeled(t, /(?:receipt|inv|invoice)\s*(?:no|#)?\s*[:#-]\s*/i, /[ \t]*([A-Z0-9][A-Z0-9\-/]{2,20})/i);
  if (labeledValue)
    return { value: labeledValue.toUpperCase().replace(/[.,;]$/, ""), confidence: 0.95, raw: labeledValue };
  const patterns: Array<[RegExp, number]> = [
    // fallback: bare id — letter-digit mix, so headings like "Fuel Voucher" don't match
    [/\b([A-Z]{1,4}[-/]?\d{3,10}[A-Z0-9]*(?:[-/][A-Z0-9]{1,6})?)\b/, 0.55],
  ];
  for (const [re, conf] of patterns) {
    const m = t.match(re);
    if (m?.[1]) return { value: m[1].toUpperCase().replace(/[.,;]$/, ""), confidence: conf, raw: m[0] };
  }
  return { value: null, confidence: 0 };
}

/** License-plate-style vehicle number, e.g. "ABC-1234", "MH12AB1234", "JK02DW6302", "KA 01 AB 1234". */
export function parseVehicleNo(text: string): OcrFieldResult<string> {
  const t = clean(text);
  // Real voucher: "Veh No. JK02DW6302" — handwritten compact Indian plate
  const plateRe = /[ \t]*((?:[A-Z]{2,3}[\s-]?\d{1,4}[\s-]?[A-Z0-9]{0,4}[\s-]?\d{0,4})|(?:[A-Z]{2,4}[\s-]?\d{3,5}))(?![A-Z])/i;
  const labeledValue =
    labeled(t, /(?:veh(?:icle)?|plate|reg(?:istration)?)\s*(?:no|number|#)?\.?\s*[:#\-.]?\s*/i, plateRe);
  if (labeledValue && !/^\d+$/.test(labeledValue.trim()) && /\d/.test(labeledValue) && /[A-Z]/i.test(labeledValue))
    return { value: labeledValue.toUpperCase().replace(/\s+/g, "").trim(), confidence: 0.9, raw: labeledValue };
  const patterns: Array<[RegExp, number]> = [
    [/\b([A-Z]{2,3}[-\s]?\d{1,4}[-\s]?(?:[A-Z]{1,3}[-\s]?)?\d{3,5})\b/, 0.6],
    // fallback: plain compact plate — but not followed by letters (avoids "ABC-1234 LITE")
    [/\b([A-Z]{2,4}[-\s]?\d{3,5})(?![A-Z])/i, 0.45],
  ];
  for (const [re, conf] of patterns) {
    const m = t.match(re);
    if (m?.[1]) {
      const v = m[1].toUpperCase().replace(/\s+/g, " ").trim();
      if (!/^\d+$/.test(v)) return { value: v, confidence: conf, raw: m[0] };
    }
  }
  return { value: null, confidence: 0 };
}

/** Fuel volume, e.g. "45.5 L", "45.50 Litres", "Quantity: 32". */
export function parseLiters(text: string): OcrFieldResult<number> {
  const t = clean(text);
  // guard: implausibly large digit runs followed by a volume-ish word are OCR garbage
  if (/\b\d{5,}\s*(?:l[i1t]{1,3}[a-z]{0,4}|ltrs?|l)\b/i.test(t)) return { value: null, confidence: 0 };
  // Real voucher: "Diesel 40 litres" / "Petrol 12.5 Lts" (unit word may be OCR-mangled)
  const fuelLine = labeled(
    t,
    /(?:diesel|petrol|volume|qty|quantity|liters?|litres?|ltrs?|fuel)\s*[:#\-]?\s*/i,
    /[ \t]*(\d{1,4}(?:[.,]\d{1,3})?)\s*[A-Za-z]{0,8}/
  );
  if (fuelLine) {
    const v = parseFloat(fuelLine.replace(",", "."));
    if (Number.isFinite(v) && v > 0 && v <= 10000)
      return { value: v, confidence: 0.9, raw: fuelLine };
  }
  // generic: number followed by a litres-like word (litres/liters/ltrs/Lts/litnes/ltres…)
  const patterns: Array<[RegExp, number]> = [
    [/(\d{1,4}(?:[.,]\d{1,3})?)\s*(?:l[i1t]{1,3}[a-z]{0,4}|ltrs?|l)\b\.?/i, 0.95],
  ];
  for (const [re, conf] of patterns) {
    const m = t.match(re);
    if (m?.[1]) {
      const v = parseFloat(m[1].replace(",", "."));
      if (Number.isFinite(v) && v > 0 && v <= 10000)
        return { value: v, confidence: conf, raw: m[0] };
    }
  }
  return { value: null, confidence: 0 };
}

/** Transaction date; normalizes to ISO yyyy-mm-dd. Handles 2-digit years (29/9/26 → 2026). */
export function parseDate(text: string): OcrFieldResult<string> {
  const t = clean(text);
  const expandYear = (yy: string) => {
    const n = parseInt(yy, 10);
    const century = n < 70 ? 2000 : 1900;
    return String(century + n);
  };

  // dd/m/yy — 2-digit year (real voucher format: "29/9/26")
  const dmy2 = t.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})\b(?!\d)/);
  if (dmy2) {
    const d = parseInt(dmy2[1], 10), mo = parseInt(dmy2[2], 10);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31)
      return {
        value: `${expandYear(dmy2[3])}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        confidence: 0.85, raw: dmy2[0],
      };
  }

  // dd/mm/yyyy or dd-mm-yyyy or dd.mm.yyyy (4-digit year)
  const re4 = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/g;
  {
    let m: RegExpExecArray | null;
    while ((m = re4.exec(t))) {
      const d = parseInt(m[1], 10), mo = parseInt(m[2], 10);
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        return {
          value: `${m[3]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
          confidence: 0.9, raw: m[0],
        };
      }
    }
  }

  // yyyy-mm-dd
  const iso = t.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (iso) {
    return {
      value: `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`,
      confidence: 0.9, raw: iso[0],
    };
  }

  // 12 Mar 2026 / Mar 12, 2026
  const dmy = t.match(/(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})/);
  if (dmy) {
    const mo = MONTHS[dmy[2].toLowerCase()];
    if (mo) return { value: `${dmy[3]}-${String(mo).padStart(2, "0")}-${dmy[1].padStart(2, "0")}`, confidence: 0.85, raw: dmy[0] };
  }
  const mdy = t.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (mdy) {
    const mo = MONTHS[mdy[1].toLowerCase()];
    if (mo) return { value: `${mdy[3]}-${String(mo).padStart(2, "0")}-${mdy[2].padStart(2, "0")}`, confidence: 0.85, raw: mdy[0] };
  }

  return { value: null, confidence: 0 };
}

export function parseAll(text: string, engineConfidence: number): OcrResult {
  return {
    voucherNo: parseVoucherNo(text),
    vehicleNo: parseVehicleNo(text),
    liters: parseLiters(text),
    date: parseDate(text),
    fullText: text,
    engineConfidence,
  };
}
