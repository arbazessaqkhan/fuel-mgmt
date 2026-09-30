import { describe, expect, it } from "@jest/globals";
import { parseAll } from "@/lib/ocr/parsers";

// Simulated OCR text for a typical voucher (as Tesseract would emit)
const SAMPLE = `Fuel Voucher
Voucher No: FV-2026-0042
Vehicle No: ABC-1234
Liters: 45.5 L
Date: 15/09/2026`;

describe("parseAll integration", () => {
  const r = parseAll(SAMPLE, 0.9);
  it("extracts voucher number", () => {
    expect(r.voucherNo.value).toBe("FV-2026-0042");
  });
  it("extracts vehicle number", () => {
    expect(r.vehicleNo.value).toBe("ABC-1234");
  });
  it("extracts liters", () => {
    expect(r.liters.value).toBeCloseTo(45.5);
  });
  it("extracts and normalizes date", () => {
    expect(r.date.value).toBe("2026-09-15");
  });
  it("flags high confidence on clean input", () => {
    expect(r.voucherNo.confidence).toBeGreaterThanOrEqual(0.9);
    expect(r.date.confidence).toBeGreaterThanOrEqual(0.9);
  });
});
