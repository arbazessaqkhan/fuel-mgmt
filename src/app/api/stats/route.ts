import { prisma, withDbRetry } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/stats?year=&month=  → aggregates for the dashboard
//
// Default scope is the current month, BUT if the current month has no vouchers
// yet the response falls back to the most recent month that has data (with a
// `fallback: true` flag) so the dashboard never shows an empty-looking 0/0 on
// the 1st of a new month.
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const now = new Date();
    const year = sp.get("year") ? Number(sp.get("year")) : now.getUTCFullYear();
    const month = sp.get("month") ? Number(sp.get("month")) : now.getUTCMonth() + 1;

    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json({ error: "Invalid year/month" }, { status: 400 });
    }

    const explicit = Boolean(sp.get("year") || sp.get("month"));
    let start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    let end = new Date(Date.UTC(year, month, 1, 0, 0, 0));
    let fallback = false;

    let where = { date: { gte: start, lt: end } };

    let [totalAgg, perVehicle] = await withDbRetry(() =>
      Promise.all([
        prisma.fuelVoucher.aggregate({
          _sum: { liters: true },
          _count: { _all: true },
          where,
        }),
        prisma.fuelVoucher.groupBy({
          by: ["vehicleNo"],
          where,
          _sum: { liters: true },
          _count: { _all: true },
          orderBy: { _sum: { liters: "desc" } },
        }),
      ])
    );

    if (!explicit && (totalAgg._count._all ?? 0) === 0) {
      const latest = await withDbRetry(() =>
        prisma.fuelVoucher.findFirst({ orderBy: { date: "desc" }, select: { date: true } })
      );
      if (latest?.date) {
        const y = latest.date.getUTCFullYear();
        const m = latest.date.getUTCMonth() + 1;
        start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
        end = new Date(Date.UTC(y, m, 1, 0, 0, 0));
        fallback = true;
        where = { date: { gte: start, lt: end } };
        [totalAgg, perVehicle] = await withDbRetry(() =>
          Promise.all([
            prisma.fuelVoucher.aggregate({
              _sum: { liters: true },
              _count: { _all: true },
              where,
            }),
            prisma.fuelVoucher.groupBy({
              by: ["vehicleNo"],
              where,
              _sum: { liters: true },
              _count: { _all: true },
              orderBy: { _sum: { liters: "desc" } },
            }),
          ])
        );
      }
    }

    const vehicleBreakdown = perVehicle.map((v) => ({
      vehicleNo: v.vehicleNo,
      liters: v._sum.liters ?? 0,
      vouchers: v._count._all,
    }));

    const result = {
      year: start.getUTCFullYear(),
      month: start.getUTCMonth() + 1,
      requestedYear: year,
      requestedMonth: month,
      fallback,
      totalLiters: totalAgg._sum.liters ?? 0,
      voucherCount: totalAgg._count._all ?? 0,
      mostActiveVehicle: vehicleBreakdown[0]?.vehicleNo ?? null,
      vehicleBreakdown,
    };

    const res = NextResponse.json(result);
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  } catch (err) {
    console.error("GET /api/stats failed", err);
    return NextResponse.json({ error: "Failed to compute stats" }, { status: 500 });
  }
}
