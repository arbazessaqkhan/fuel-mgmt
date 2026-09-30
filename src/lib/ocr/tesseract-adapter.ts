"use client";

import { multipassRecognize } from "./multipass-client";
import type { OcrService } from "./types";

/**
 * Tesseract.js adapter. Runs fully client-side (workers in the browser),
 * so voucher images never leave the user's machine unless the weak-result
 * fallback kicks in (the scan page then posts the image to the server-side
 * vision corrector).
 *
 * Uses the multi-pass engine (page-level pass + label-anchored whitelisted
 * field passes merged by frequency × confidence) so real photographed
 * handwritten vouchers extract as reliably as regex OCR allows.
 *
 * Swap point: implement the same `OcrService` with Google Cloud Vision
 * and return it from `getOcrService()` to change engines.
 */
class TesseractOcrService implements OcrService {
  async recognize(
    image: Blob,
    onProgress?: (pct: number) => void
  ): Promise<import("./types").OcrResult> {
    const r = await multipassRecognize(image, (p) => onProgress?.(Math.min(99, p)));
    return {
      voucherNo: r.voucherNo as import("./types").OcrFieldResult<string>,
      vehicleNo: r.vehicleNo as import("./types").OcrFieldResult<string>,
      liters: r.liters as import("./types").OcrFieldResult<number>,
      date: r.date as import("./types").OcrFieldResult<string>,
      fullText: "",
      engineConfidence: Math.min(
        r.voucherNo.confidence,
        r.vehicleNo.confidence,
        r.liters.confidence,
        r.date.confidence || 0.5
      ),
    };
  }
}

let service: OcrService | null = null;

export function getOcrService(): OcrService {
  if (!service) service = new TesseractOcrService();
  return service;
}
