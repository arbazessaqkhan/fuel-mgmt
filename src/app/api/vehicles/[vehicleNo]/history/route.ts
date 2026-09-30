import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/vehicles/[vehicleNo]/history?months=12
 *
 * Month-by-month fuel history for a single vehicle over the trailing N
 * months (default 12, clamped 1-24). Months with no vouchers are included
 * with zero liters/vouchers so charts show gaps rather than missing bars.
 *
 * Response: {
 *   vehicleNo, fromMonth: "YYYY-MM", toMonth: "YYYY-MM",
 *   totalLiters, totalVouchers,
 *   months: [{ month: "YYYY-MM", liters, vouchers }],
 *   recent: FuelVoucher[] (latest 10)
 * }
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function monthKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ vehicleNo: string }> }
) {
  try {
    const { vehicleNo } = await params;
    const plate = decodeURIComponent(vehicleNo || "").trim().toUpperCase();
    if (!plate || plate.length < 2 || plate.length > 20) {
      return NextResponse.json({ error: "Invalid vehicle number." }, { status: 400 });
    }

    const url = new URL(request.url);
    const fromParam = url.searchParams.get("from"); // YYYY-MM
    const toParam = url.searchParams.get("to"); // YYYY-MM
    const monthsParam = url.searchParams.get("months");

    // Range resolution: explicit from/to (inclusive) wins; otherwise a
    // trailing N-month window ending this month; default 12, clamped 1-24.
    let rangeFrom: Date | null = null;
    let rangeTo: Date | null = null;
    const monthRe = /^\d{4}-\d{2}$/;
    if (fromParam && toParam && monthRe.test(fromParam) && monthRe.test(toParam)) {
      const [fy, fm] = fromParam.split("-").map(Number);
      const [ty, tm] = toParam.split("-").map(Number);
      if (fm >= 1 && fm <= 12 && tm >= 1 && tm <= 12) {
        rangeFrom = new Date(Date.UTC(fy, fm - 1, 1));
        rangeTo = new Date(Date.UTC(ty, tm - 1, 1));
        if (rangeTo < rangeFrom) {
          return NextResponse.json(
            { error: "End month must be after start month." },
            { status: 400 }
          );
        }
      }
    }
    let months = Number.parseInt(monthsParam ?? "12", 10);
    if (!Number.isFinite(months)) months = 12;
    months = Math.min(24, Math.max(1, months));

    // All-time distinct months for this vehicle — drives the range filter's
    // dropdowns (only months with actual data are offered).
    const allVouchers = await prisma.fuelVoucher.findMany({
      where: { vehicleNo: { equals: plate } },
      select: { date: true },
      orderBy: { date: "asc" },
    });
    const availableMonths = Array.from(
      new Set(allVouchers.map((v) => monthKey(new Date(v.date))))
    ).sort((a, b) => a.localeCompare(b));

    // Default window: trailing `months` calendar months including the current
    // one (UTC), clamped to the vehicle's available range.
    const now = new Date();
    const toMonth = monthKey(now);
    if (!rangeFrom || !rangeTo) {
      const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
      rangeFrom = defaultFrom;
      rangeTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    }
    const fromMonth = monthKey(rangeFrom);
    const toMonthKey = monthKey(rangeTo);

    if (availableMonths.length === 0) {
      return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
    }

    const vouchers = await prisma.fuelVoucher.findMany({
      where: {
        vehicleNo: { equals: plate },
        date: { gte: rangeFrom, lt: new Date(Date.UTC(rangeTo.getUTCFullYear(), rangeTo.getUTCMonth() + 1, 1)) },
      },
      orderBy: { date: "asc" },
    });

    // Bucket by YYYY-MM — ONLY months with actual data are included, so the
    // chart/table show active months without zero-fill padding.
    const byMonth = new Map<string, { liters: number; vouchers: number }>();
    for (const v of vouchers) {
      const key = monthKey(new Date(v.date));
      const bucket = byMonth.get(key);
      if (bucket) {
        bucket.liters += v.liters;
        bucket.vouchers += 1;
      } else {
        byMonth.set(key, { liters: v.liters, vouchers: 1 });
      }
    }

    const monthRows = Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, { liters, vouchers }]) => ({
        month,
        liters: Math.round(liters * 100) / 100,
        vouchers,
      }));

    const recent = await prisma.fuelVoucher.findMany({
      where: { vehicleNo: { equals: plate } },
      orderBy: { date: "desc" },
      take: 10,
    });

    const totalLiters = monthRows.reduce((s, m) => s + m.liters, 0);
    const totalVouchers = monthRows.reduce((s, m) => s + m.vouchers, 0);

    return NextResponse.json({
      vehicleNo: plate,
      fromMonth,
      toMonth: toMonthKey,
      availableMonths,
      totalLiters: Math.round(totalLiters * 100) / 100,
      totalVouchers,
      months: monthRows,
      recent,
    });
  } catch (err) {
    console.error("vehicle history failed:", err);
    return NextResponse.json({ error: "Could not load vehicle history." }, { status: 500 });
  }
}
