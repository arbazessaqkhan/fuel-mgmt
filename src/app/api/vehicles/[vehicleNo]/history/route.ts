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
    // Accept full dates (YYYY-MM-DD, day precision, inclusive `to`) or
    // month keys (YYYY-MM) for backwards compatibility.
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");
    const monthsParam = url.searchParams.get("months");

    // Range resolution: explicit from/to (inclusive) wins; otherwise a
    // trailing N-month window ending this month; default 12, clamped 1-24.
    let rangeFrom: Date | null = null;
    let rangeTo: Date | null = null; // exclusive upper bound
    const dayRe = /^\d{4}-\d{2}-\d{2}$/;
    const monthRe = /^\d{4}-\d{2}$/;
    const parseBound = (s: string, endOfDay: boolean): Date | null => {
      if (dayRe.test(s)) {
        const d = new Date(`${s}T00:00:00.000Z`);
        if (Number.isNaN(d.getTime())) return null;
        return endOfDay ? new Date(d.getTime() + 24 * 60 * 60 * 1000) : d;
      }
      if (monthRe.test(s)) {
        const [y, m] = s.split("-").map(Number);
        if (m < 1 || m > 12) return null;
        return endOfDay ? new Date(Date.UTC(y, m, 1)) : new Date(Date.UTC(y, m - 1, 1));
      }
      return null;
    };
    if (fromParam && toParam) {
      rangeFrom = parseBound(fromParam, false);
      rangeTo = parseBound(toParam, true);
      if (!rangeFrom || !rangeTo) {
        return NextResponse.json(
          { error: "Dates must be in YYYY-MM-DD or YYYY-MM format." },
          { status: 400 }
        );
      }
      if (rangeTo <= rangeFrom) {
        return NextResponse.json(
          { error: "End date must be after start date." },
          { status: 400 }
        );
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
      rangeTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    }
    const fromMonth = monthKey(rangeFrom);
    const toMonthKey = monthKey(new Date(rangeTo.getTime() - 24 * 60 * 60 * 1000));

    if (availableMonths.length === 0) {
      return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
    }

    const vouchers = await prisma.fuelVoucher.findMany({
      where: {
        vehicleNo: { equals: plate },
        date: { gte: rangeFrom, lt: rangeTo },
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
