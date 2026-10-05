import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import path from "path";
import { readFile } from "fs/promises";
import ExcelJS from "exceljs";
import { Buffer } from "node:buffer";
import { getVoucherImage, isValidImageKey } from "@/lib/storage";

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

    // Pre-fetch images concurrently in batches of 10 for ultra-fast throughput
    const uniqueUrls = Array.from(
      new Set(vouchers.map((v) => v.imageUrl).filter((url): url is string => Boolean(url)))
    ).slice(0, MAX_EMBED_IMAGES);

    const imageMap = new Map<string, { buf: Buffer; ext: "png" | "jpeg" }>();
    const BATCH_SIZE = 10;

    for (let i = 0; i < uniqueUrls.length; i += BATCH_SIZE) {
      const batch = uniqueUrls.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (imageUrl) => {
          try {
            let buf: Buffer | null = null;
            let cleanUrl = imageUrl;
            if (cleanUrl.startsWith("http://") || cleanUrl.startsWith("https://")) {
              try {
                cleanUrl = new URL(cleanUrl).pathname;
              } catch {
                // keep cleanUrl as is
              }
            }
            let ext = path.extname(cleanUrl).toLowerCase();

            if (cleanUrl.startsWith("/api/images/vouchers/")) {
              const key = cleanUrl.replace(/^\/api\/images\//, "");
              if (isValidImageKey(key)) {
                buf = await getVoucherImage(key);
              }
            } else if (cleanUrl.startsWith("/uploads/")) {
              const safe = path.basename(cleanUrl);
              const filePath = path.join(process.cwd(), "public", "uploads", safe);
              ext = path.extname(safe).toLowerCase();
              buf = await readFile(filePath).catch(() => null);
            }

            if (!buf && (imageUrl.startsWith("http://") || imageUrl.startsWith("https://"))) {
              try {
                const res = await fetch(imageUrl);
                if (res.ok) {
                  buf = Buffer.from(await res.arrayBuffer());
                  ext = path.extname(cleanUrl).toLowerCase();
                }
              } catch {
                // ignore
              }
            }

            if (buf) {
              if (ext === ".webp") {
                try {
                  const { default: sharp } = await import("sharp");
                  buf = await sharp(buf).jpeg().toBuffer();
                  ext = ".jpeg";
                } catch {
                  // sharp optional fallback
                }
              }

              if (ext === ".png" || ext === ".jpg" || ext === ".jpeg") {
                imageMap.set(imageUrl, {
                  buf,
                  ext: ext === ".png" ? "png" : "jpeg",
                });
              }
            }
          } catch (err) {
            console.error(`excel export: could not fetch ${imageUrl}`, err);
          }
        })
      );
    }

    for (const v of vouchers) {
      const row = sheet.addRow({
        voucherNo: v.voucherNo,
        vehicleNo: v.vehicleNo,
        liters: v.liters,
        date: v.date.toISOString().slice(0, 10),
      });
      row.height = 64;

      if (v.imageUrl && imageMap.has(v.imageUrl)) {
        const item = imageMap.get(v.imageUrl)!;
        const imageId = book.addImage({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          buffer: item.buf as any,
          extension: item.ext,
        });
        const imgRow = row.number;
        sheet.addImage(imageId, {
          tl: { col: 4.05, row: imgRow - 0.9 },
          ext: { width: 84, height: 60 },
        });
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
