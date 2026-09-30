import { prisma } from "@/lib/prisma";
import { voucherUpdateSchema } from "@/lib/validation";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const voucher = await prisma.fuelVoucher.findUnique({ where: { id } });
  if (!voucher)
    return NextResponse.json({ error: "Voucher not found" }, { status: 404 });
  return NextResponse.json(voucher);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const parsed = voucherUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const data: Record<string, unknown> = { ...parsed.data };
  if (typeof data.date === "string") data.date = new Date(`${data.date}T00:00:00.000Z`);

  try {
    const voucher = await prisma.fuelVoucher.update({ where: { id }, data });
    return NextResponse.json(voucher);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "A voucher with that number already exists." },
        { status: 409 }
      );
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Voucher not found" }, { status: 404 });
    }
    console.error("PATCH /api/vouchers/[id] failed", err);
    return NextResponse.json({ error: "Failed to update voucher" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    await prisma.fuelVoucher.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Voucher not found" }, { status: 404 });
    }
    console.error("DELETE /api/vouchers/[id] failed", err);
    return NextResponse.json({ error: "Failed to delete voucher" }, { status: 500 });
  }
}
