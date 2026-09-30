import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

/**
 * GET /api/export/excel
 * Optional ?vehicleNo=JK01AB1111 to export a single vehicle.
 * Returns an .xlsx workbook: Voucher No, Vehicle No, Liters, Date, Image URL.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const vehicleNo = sp.get("vehicleNo")?.trim().toUpperCase();

    const where = vehicleNo ? { vehicleNo } : {};
    const vouchers = await prisma.fuelVoucher.findMany({
      where,
      orderBy: [{ date: "asc" }, { voucherNo: "asc" }],
    });

    const rows = vouchers.map((v) => ({
      "Voucher No": v.voucherNo,
      "Vehicle No": v.vehicleNo,
      Liters: v.liters,
      Date: v.date.toISOString().slice(0, 10),
      "Image URL": v.imageUrl ?? "",
    }));

    const sheet = XLSX.utils.json_to_sheet(rows, {
      header: ["Voucher No", "Vehicle No", "Liters", "Date", "Image URL"],
    });
    // Column widths for readability
    sheet["!cols"] = [
      { wch: 14 },
      { wch: 14 },
      { wch: 10 },
      { wch: 12 },
      { wch: 40 },
    ];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, vehicleNo ? "Vehicle Vouchers" : "All Vouchers");

    const buf = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = vehicleNo
      ? `vehicle-${vehicleNo}-vouchers-${stamp}.xlsx`
      : `all-vouchers-${stamp}.xlsx`;

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("excel export failed:", err);
    return NextResponse.json({ error: "Export failed." }, { status: 500 });
  }
}
