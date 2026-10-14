import { NextResponse } from "next/server";
import { prisma, withDbRetry } from "@/lib/prisma";

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

    const [vouchers, recent] = await withDbRetry(() =>
      Promise.all([
        prisma.fuelVoucher.findMany({
          where: {
            vehicleNo: { equals: plate },
            date: { gte: rangeFrom, lt: rangeTo },
          },
          orderBy: { date: "asc" },
        }),
        prisma.fuelVoucher.findMany({
          where: { vehicleNo: { equals: plate } },
          orderBy: { date: "desc" },
          take: 10,
        }),
      ])
    );

    // Fuel type breakdown
    let dieselLiters = 0;
    let petrolLiters = 0;
    for (const v of vouchers) {
      if (v.fuelType === "Petrol") {
        petrolLiters += v.liters;
      } else {
        dieselLiters += v.liters;
      }
    }

    const primaryFuelType =
      petrolLiters > 0 && dieselLiters > 0
        ? "Diesel & Petrol"
        : petrolLiters > 0
        ? "Petrol"
        : "Diesel";

    // Date-wise breakdown (day precision) for date-specific charts and logs
    const byDay = new Map<string, { liters: number; vouchers: number; dieselLiters: number; petrolLiters: number }>();
    for (const v of vouchers) {
      const dayKey = new Date(v.date).toISOString().slice(0, 10);
      const bucket = byDay.get(dayKey);
      if (bucket) {
        bucket.liters += v.liters;
        bucket.vouchers += 1;
        if (v.fuelType === "Petrol") bucket.petrolLiters += v.liters;
        else bucket.dieselLiters += v.liters;
      } else {
        byDay.set(dayKey, {
          liters: v.liters,
          vouchers: 1,
          dieselLiters: v.fuelType === "Petrol" ? 0 : v.liters,
          petrolLiters: v.fuelType === "Petrol" ? v.liters : 0,
        });
      }
    }

    const dailyRows = Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, b]) => {
        const [y, m, day] = date.split("-").map(Number);
        const d = new Date(Date.UTC(y, m - 1, day));
        return {
          date,
          label: d.toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" }),
          fullDate: d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
          liters: Math.round(b.liters * 100) / 100,
          vouchers: b.vouchers,
          fuelType: b.dieselLiters > 0 && b.petrolLiters > 0 ? "Diesel & Petrol" : b.petrolLiters > 0 ? "Petrol" : "Diesel",
        };
      });

    // Bucket by YYYY-MM
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

    const totalLiters = monthRows.reduce((s, m) => s + m.liters, 0);
    const totalVouchers = monthRows.reduce((s, m) => s + m.vouchers, 0);

    const res = NextResponse.json({
      vehicleNo: plate,
      fromMonth,
      toMonth: toMonthKey,
      availableMonths,
      totalLiters: Math.round(totalLiters * 100) / 100,
      dieselLiters: Math.round(dieselLiters * 100) / 100,
      petrolLiters: Math.round(petrolLiters * 100) / 100,
      primaryFuelType,
      totalVouchers,
      months: monthRows,
      daily: dailyRows,
      vouchers: vouchers
        .map((v) => ({
          id: v.id,
          voucherNo: v.voucherNo,
          vehicleNo: v.vehicleNo,
          liters: v.liters,
          fuelType: v.fuelType || "Diesel",
          date: v.date,
          imageUrl: v.imageUrl,
        }))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
      recent,
    });
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  } catch (err) {
    console.error("vehicle history failed:", err);
    return NextResponse.json({ error: "Could not load vehicle history." }, { status: 500 });
  }
}
