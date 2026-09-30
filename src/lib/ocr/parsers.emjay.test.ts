import { describe, expect, it } from "@jest/globals";
import { parseAll } from "@/lib/ocr/parsers";

// Real-world voucher format: handwritten Emjay Motors credit vouchers
// (two duplicate stubs per photo; values per /workspace/userDocs/image_39ae5479.png)
const EMJAY = `CREDIT VOUCHER
No. 16072 Date 29/9/26
EMJAY MOTORS
M.A. Road, Srinagar
Tel: 2472289
Veh No. JK02DW6302
Petrol x Lts
Diesel 40 litres Lts
M. Oil x
Transport Officer
J&K Power Development Corporation`;

describe("Emjay Motors voucher format (real vouchers)", () => {
  const r = parseAll(EMJAY, 0.8);

  it("extracts bare stamped voucher number near 'No.'", () => {
    expect(r.voucherNo.value).toBe("16072");
  });

  it("extracts handwritten compact vehicle plate", () => {
    expect(r.vehicleNo.value).toBe("JK02DW6302");
  });

  it("extracts liters from the Diesel line", () => {
    expect(r.liters.value).toBeCloseTo(40);
  });

  it("expands DD/M/YY date to full ISO year", () => {
    expect(r.date.value).toBe("2026-09-29");
  });

  it("handles OCR-mangled 'litres' spellings", () => {
    const mangled = parseAll("Veh No. JK02DW6302\nDiesel 40 litnes Lts", 0.7);
    expect(mangled.liters.value).toBeCloseTo(40);
  });

  it("treats 'x' petrol/m.oil marks as empty, not values", () => {
    // the x marks must not leak into any field
    expect(r.voucherNo.value).not.toBe("X");
    expect(r.vehicleNo.value).not.toContain("X ");
  });

  it("still parses mixed formats in the same document", () => {
    const mixed = parseAll("No. 16073 Date 1/10/26\nVeh No. KA05F9988\nDiesel 12.5 Lts", 0.8);
    expect(mixed.voucherNo.value).toBe("16073");
    expect(mixed.vehicleNo.value).toBe("KA05F9988");
    expect(mixed.liters.value).toBeCloseTo(12.5);
    expect(mixed.date.value).toBe("2026-10-01");
  });
});
