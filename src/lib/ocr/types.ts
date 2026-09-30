/**
 * OCR service abstraction.
 *
 * The app consumes `getOcrService()`; today it returns the Tesseract.js
 * adapter. To swap in Google Cloud Vision later, implement `OcrService`
 * in a new adapter (e.g. `google-vision-adapter.ts`) and return it here
 * based on an env flag — no call sites need to change.
 */

export interface OcrFieldResult<T> {
  value: T | null;
  confidence: number; // 0..1, how sure the parser is
  raw?: string; // raw matched text for user debugging
}

export interface OcrResult {
  voucherNo: OcrFieldResult<string>;
  vehicleNo: OcrFieldResult<string>;
  liters: OcrFieldResult<number>;
  date: OcrFieldResult<string>; // ISO yyyy-mm-dd
  fullText: string;
  engineConfidence: number; // OCR engine mean confidence 0..1
}

export interface OcrService {
  /** Run OCR on an image File/Blob and parse fuel-voucher fields. */
  recognize(image: Blob, onProgress?: (pct: number) => void): Promise<OcrResult>;
}
