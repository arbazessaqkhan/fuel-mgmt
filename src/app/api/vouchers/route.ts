import { prisma, withDbRetry } from "@/lib/prisma";
import { voucherCreateSchema } from "@/lib/validation";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Month boundaries in UTC (inclusive): ?year=2026&month=9 (1-12). */
function monthRange(year?: number | null, month?: number | null) {
  if (!year || !month || month < 1 || month > 12) return null;
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  return { start, end };
}

// GET /api/vouchers?year=&month=&search=&sortField=&sortDir=&page=&pageSize=
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const year = sp.get("year") ? Number(sp.get("year")) : null;
    const month = sp.get("month") ? Number(sp.get("month")) : null;
    const search = sp.get("search")?.trim() ?? "";
    const sortField = sp.get("sortField") ?? "date";
    const sortDir = sp.get("sortDir") === "asc" ? "asc" : "desc";
    const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(sp.get("pageSize") ?? 25) || 25));

    const range = monthRange(year, month);

    const where: Prisma.FuelVoucherWhereInput = {
      ...(range ? { date: { gte: range.start, lt: range.end } } : {}),
      ...(search
        ? {
            OR: [
              { voucherNo: { contains: search, mode: "insensitive" as const } },
              { vehicleNo: { contains: search, mode: "insensitive" as const } },
              { fuelType: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const sortable = ["date", "voucherNo", "vehicleNo", "liters"] as const;
    const field = (sortable as readonly string[]).includes(sortField)
      ? (sortField as (typeof sortable)[number])
      : "date";

    const [items, total] = await withDbRetry(() =>
      Promise.all([
        prisma.fuelVoucher.findMany({
          where,
          orderBy: { [field]: sortDir },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.fuelVoucher.count({ where }),
      ])
    );

    return NextResponse.json({ items, total, page, pageSize });
  } catch (err) {
    console.error("GET /api/vouchers failed", err);
    return NextResponse.json({ error: "Failed to load vouchers" }, { status: 500 });
  }
}

// POST /api/vouchers
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const parsed = voucherCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const { voucherNo, vehicleNo, liters, fuelType, date, imageUrl } = parsed.data;

  try {
    const voucher = await prisma.fuelVoucher.create({
      data: {
        voucherNo,
        vehicleNo,
        liters,
        fuelType,
        date: new Date(`${date}T00:00:00.000Z`),
        imageUrl: imageUrl ?? null,
      },
    });
    return NextResponse.json(voucher, { status: 201 });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        { error: `A voucher with number "${voucherNo}" already exists.` },
        { status: 409 }
      );
    }
    console.error("POST /api/vouchers failed", err);
    return NextResponse.json({ error: "Failed to save voucher" }, { status: 500 });
  }
}
