import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import path from "path";
import { readFile } from "fs/promises";
import ExcelJS from "exceljs";

/**
 * GET /api/export/excel
 * Optional ?vehicleNo=JK01AB1111 to export a single vehicle.
 * Returns an .xlsx workbook: Voucher No, Vehicle No, Liters, Date — with the
 * ACTUAL voucher images embedded in an extra "Voucher Image" column (not a
 * URL text link).
 */

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const MAX_EMBED_IMAGES = 100; // safety cap so huge exports don't blow memory

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const vehicleNo = sp.get("vehicleNo")?.trim().toUpperCase();

    const where = vehicleNo ? { vehicleNo } : {};
    const vouchers = await prisma.fuelVoucher.findMany({
      where,
      orderBy: [{ date: "asc" }, { voucherNo: "asc" }],
    });

    const book = new ExcelJS.Workbook();
    book.creator = "FuelLog Fleet Manager";
    book.created = new Date();
    const sheet = book.addWorksheet(vehicleNo ? "Vehicle Vouchers" : "All Vouchers");

    sheet.columns = [
      { header: "Voucher No", key: "voucherNo", width: 16 },
      { header: "Vehicle No", key: "vehicleNo", width: 16 },
      { header: "Liters", key: "liters", width: 10 },
      { header: "Date", key: "date", width: 14 },
      { header: "Voucher Image", key: "image", width: 28 },
    ];
    // Style the header row
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE8EFFC" },
    };

    let embedded = 0;
    for (const v of vouchers) {
      const row = sheet.addRow({
        voucherNo: v.voucherNo,
        vehicleNo: v.vehicleNo,
        liters: v.liters,
        date: v.date.toISOString().slice(0, 10),
      });
      row.height = 64;

      if (v.imageUrl && embedded < MAX_EMBED_IMAGES) {
        try {
          // imageUrl is validated at creation time as /uploads/<safe-name>,
          // so resolving inside public/ is safe.
          const safe = path.basename(v.imageUrl);
          const filePath = path.join(process.cwd(), "public", "uploads", safe);
          const ext = path.extname(safe).toLowerCase();
          if (ext === ".png" || ext === ".jpg" || ext === ".jpeg") {
            const buf = await readFile(filePath);
            const imageId = book.addImage({
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              buffer: buf as any,
              extension: ext === ".png" ? "png" : "jpeg",
            });
            const imgRow = row.number;
            sheet.addImage(imageId, {
              tl: { col: 4.05, row: imgRow - 0.9 },
              ext: { width: 84, height: 60 },
            });
            embedded++;
          }
        } catch (err) {
          // Missing file on disk: leave the cell empty rather than failing the export.
          console.error(`excel export: could not embed ${v.imageUrl}`, err);
        }
      }
    }

    const buf = await book.xlsx.writeBuffer();
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = vehicleNo
      ? `vehicle-${vehicleNo}-vouchers-${stamp}.xlsx`
      : `all-vouchers-${stamp}.xlsx`;

    return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
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
