#!/usr/bin/env node
/**
 * Import a /api/backup JSON export into a fresh (empty) database.
 *
 * Usage:
 *   node scripts/import-backup.mjs <path-to-backup.json> <DATABASE_URL>
 *
 * The backup format is the array/object produced by GET /api/backup
 * (vouchers with id, voucherNo, vehicleNo, liters, fuelType, date, imageUrl...).
 * Requires an empty fuel_vouchers table (run `npx prisma db push` first).
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const [file, url] = process.argv.slice(2);
if (!file || !url) {
  console.error("Usage: node scripts/import-backup.mjs <backup.json> <DATABASE_URL>");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(file, "utf8"));
const rows = Array.isArray(raw) ? raw : raw.vouchers ?? raw.data;
if (!Array.isArray(rows)) {
  console.error("Could not find a voucher array in the backup file.");
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

let imported = 0, skipped = 0;
const SNAKE = {
  voucherNo: "voucher_no", vehicleNo: "vehicle_no", fuelType: "fuel_type",
  imageUrl: "image_url", createdAt: "created_at", updatedAt: "updated_at",
};
const pick = (r, k) => r[k] ?? r[SNAKE[k]];

for (const r of rows) {
  try {
    await prisma.fuelVoucher.create({
      data: {
        id: r.id ?? undefined,
        voucherNo: String(pick(r, "voucherNo")),
        vehicleNo: String(pick(r, "vehicleNo")),
        liters: Number(pick(r, "liters")),
        fuelType: pick(r, "fuelType") ?? "Diesel",
        date: new Date(pick(r, "date")),
        imageUrl: pick(r, "imageUrl") ?? null,
        createdAt: pick(r, "createdAt") ? new Date(pick(r, "createdAt")) : undefined,
      },
    });
    imported++;
  } catch (e) {
    if (String(e?.code) === "P2002") {
      skipped++; // duplicate voucherNo
    } else {
      console.error(`Row ${pick(r, "voucherNo")}:`, e.message);
      skipped++;
    }
  }
}
console.log(`Imported ${imported} vouchers, skipped ${skipped}.`);
await prisma.$disconnect();
