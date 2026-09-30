# Phase 1 — Scaffold, Prisma Schema & API Layer

## Goal
Next.js App Router + TypeScript + Tailwind + shadcn/ui project, Prisma wired to MySQL with the FuelVoucher model, and secure CRUD API layer.

## Files
- `prisma/schema.prisma` — model FuelVoucher: id (String @id @default(uuid())), voucherNo (String @unique), vehicleNo (String, indexed), liters (Float), date (DateTime), createdAt/updatedAt (DateTime @updatedAt / default(now))
- `src/lib/prisma.ts` — singleton Prisma client
- `src/lib/ocr/types.ts` — `OcrResult` interface (voucherNo, vehicleNo, liters, date + confidence flags) for the swappable OCR adapter
- `src/app/api/vouchers/route.ts` — GET (list w/ month/year + search + sort params), POST (create; 409 on duplicate voucherNo; zod validation)
- `src/app/api/vouchers/[id]/route.ts` — GET/PATCH/DELETE
- `src/app/api/stats/route.ts` — monthly aggregates (total liters, voucher count, most active vehicle, per-vehicle totals)
- shadcn/ui init with base components: button, input, card, table, dialog, form, select, toast

## Acceptance Criteria (running app)
- [ ] App loads in browser with a styled page
- [ ] A voucher created via API appears in GET /api/vouchers
- [ ] Creating a voucher with an existing voucherNo returns HTTP 409
- [ ] Invalid payloads (negative liters, missing fields) return 400 with a clear message

## Tests / Edges
- Unique-constraint conflict → 409
- Malformed date → 400
- Month filter boundary (month edges use local server tz, inclusive)
