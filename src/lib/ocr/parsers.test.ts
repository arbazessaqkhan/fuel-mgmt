import { parseDate, parseLiters, parseVehicleNo, parseVoucherNo } from "@/lib/ocr/parsers";
import { describe, expect, it } from "@jest/globals";

describe("parseVoucherNo", () => {
  it("extracts labeled voucher number", () => {
    expect(parseVoucherNo("Voucher No: FV-2026-0042").value).toBe("FV-2026-0042");
  });
  it("extracts plain alphanumeric id", () => {
    expect(parseVoucherNo("RECEIPT\nVCH88123A\nThank you").value).toBe("VCH88123A");
  });
  it("returns null when absent", () => {
    expect(parseVoucherNo("nothing here").value).toBeNull();
  });
});

describe("parseVehicleNo", () => {
  it("extracts labeled plate with dash", () => {
    expect(parseVehicleNo("Vehicle No: ABC-1234").value).toBe("ABC-1234");
  });
  it("extracts spaced plate", () => {
    expect(parseVehicleNo("Vehicle No: MH 12 AB 1234").value).toMatch(/^MH\s?12\s?AB\s?1234$/);
  });
  it("extracts plain plate", () => {
    expect(parseVehicleNo("KA01AB1234 Qty 20L").value).toBe("KA01AB1234");
  });
  it("returns null when absent", () => {
    expect(parseVehicleNo("no vehicle info").value).toBeNull();
  });
});

describe("parseLiters", () => {
  it("extracts liters with L suffix", () => {
    expect(parseLiters("Quantity 45.5 L").value).toBeCloseTo(45.5);
  });
  it("extracts liters with litres word", () => {
    expect(parseLiters("45.50 Litres").value).toBeCloseTo(45.5);
  });
  it("extracts labeled qty without unit", () => {
    expect(parseLiters("Volume: 32").value).toBeCloseTo(32);
  });
  it("handles comma decimal", () => {
    expect(parseLiters("12,5 ltrs").value).toBeCloseTo(12.5);
  });
  it("rejects absurd values", () => {
    expect(parseLiters("999999 liters").value).toBeNull();
    expect(parseLiters("999999 Lts").value).toBeNull();
  });

  it("reads Emjay Motors Diesel line", () => {
    expect(parseLiters("Diesel 40 litres Lts").value).toBeCloseTo(40);
    expect(parseLiters("Diesel - 40 litnes Lts").value).toBeCloseTo(40);
  });
});

describe("parseDate", () => {
  it("parses dd/mm/yyyy", () => {
    expect(parseDate("Date: 15/09/2026").value).toBe("2026-09-15");
  });
  it("parses dd-mm-yyyy", () => {
    expect(parseDate("02-01-2026").value).toBe("2026-01-02");
  });
  it("parses iso yyyy-mm-dd", () => {
    expect(parseDate("2026-09-15").value).toBe("2026-09-15");
  });
  it("parses '15 Mar 2026'", () => {
    expect(parseDate("15 Mar 2026").value).toBe("2026-03-15");
  });
  it("parses 'Mar 15, 2026'", () => {
    expect(parseDate("Mar 15, 2026").value).toBe("2026-03-15");
  });
  it("returns null when absent", () => {
    expect(parseDate("no date").value).toBeNull();
  });
});
