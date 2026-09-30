import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/backup
 * Downloads the ENTIRE fuel_vouchers table as a JSON snapshot for local
 * safe-keeping: { exportedAt, count, vouchers: [...] } (imageUrl references
 * included so backups pair with the /uploads files).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const vouchers = await prisma.fuelVoucher.findMany({
      orderBy: { date: "asc" },
    });
    const payload = {
      exportType: "fuellog-database-backup",
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      count: vouchers.length,
      vouchers,
    };
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;
    const body = JSON.stringify(payload, null, 2);

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="fuellog-backup-${stamp}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("backup failed:", err);
    return NextResponse.json({ error: "Backup generation failed." }, { status: 500 });
  }
}
