# FuelLog Fleet Manager — Architecture & Environment Notes

## Stack
- Next.js 16 (App Router, src dir, TS), Tailwind v4, shadcn/ui (radix, new-york style)
- Prisma 6 + MySQL (NOT MongoDB — env provides MySQL only; `prisma migrate dev` fails due to no shadow-db permission → use `prisma db push`, then `prisma migrate diff` + `migrate resolve --applied` to keep migration history; setup script uses `migrate deploy || db push` fallback)
- OCR: Tesseract.js client-side adapter (`src/lib/ocr/tesseract-adapter.ts`) behind `OcrService` interface; parsers in `src/lib/ocr/parsers.ts` (pure regex, line-bounded labeled-field matching — don't let label regexes cross newlines)
- DB access via `src/lib/prisma.ts` singleton; zod validation in `src/lib/validation.ts`

## Key environment facts
- `/workspace/.env` is root-owned and materialized EMPTY by the backend at start; the resolved copy is at `/drytis-config/environments/<hash>.env`. After a container swap, copy it to /workspace/.env (sudo) or export vars before running prisma CLI/next start.
- Background service name: `service-bg-service-4374` (next start -p 3000); Caddy reverse_proxy at / → port 3000.
- `npm run build` type-checks scripts/*.ts too — keep Playwright scripts type-clean (they need `playwright` devDep; browsers cached in ~/.cache/ms-playwright, reinstall after container swap).
- npm has allow-scripts warnings — harmless.
- The setup script regenerates + rebuilds; run it manually after dependency/schema changes.
- Fake voucher test image generator: python3 + pillow (installed with --break-system-packages) at /tmp/voucher-test.png.

## Testing
- Unit/integration: jest + ts-jest (`npx jest`), tests in src/lib/ocr/*.test.ts — 23 pass.
- Browser E2E: `npx tsx scripts/scan-smoke.ts` (OCR flow: reads FV-2026-0042/ABC-1234/45.5/2026-09-15 correctly) and `npx tsx scripts/dashboard-e2e.ts` (13 checks). Both need the app running on :3000 and seeded data (V-1001, V-2002, FV-2026-0042 in Sep 2026; V-4001 in Aug).
