import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/stats?year=&month=  → aggregates for the dashboard
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const now = new Date();
    const year = sp.get("year") ? Number(sp.get("year")) : now.getUTCFullYear();
    const month = sp.get("month") ? Number(sp.get("month")) : now.getUTCMonth() + 1;

    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json({ error: "Invalid year/month" }, { status: 400 });
    }

    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, 1, 0, 0, 0));
    const where = { date: { gte: start, lt: end } };

    const [totalAgg, count, perVehicle] = await Promise.all([
      prisma.fuelVoucher.aggregate({ _sum: { liters: true }, where }),
      prisma.fuelVoucher.count({ where }),
      prisma.fuelVoucher.groupBy({
        by: ["vehicleNo"],
        where,
        _sum: { liters: true },
        _count: { _all: true },
        orderBy: { _sum: { liters: "desc" } },
      }),
    ]);

    const vehicleBreakdown = perVehicle.map((v) => ({
      vehicleNo: v.vehicleNo,
      liters: v._sum.liters ?? 0,
      vouchers: v._count._all,
    }));

    return NextResponse.json({
      year,
      month,
      totalLiters: totalAgg._sum.liters ?? 0,
      voucherCount: count,
      mostActiveVehicle: vehicleBreakdown[0]?.vehicleNo ?? null,
      vehicleBreakdown,
    });
  } catch (err) {
    console.error("GET /api/stats failed", err);
    return NextResponse.json({ error: "Failed to compute stats" }, { status: 500 });
  }
}
