# Phase 6 — Professional Features (Security, Bulk Processing, Data Retention)

## Goal
Six professional features: authentication gate, bulk PDF voucher upload with batch review,
custom date-range filter on vehicle view, voucher image retention, Excel exports, and a
local database backup download.

## Key architecture decisions
- **Auth**: no next-auth dependency. `src/middleware.ts` guards `/`, `/scan`, `/vehicles/*`
  and mutating/reading API routes (except `/api/auth/login`, `/api/health`, static assets).
  Credentials fixed via env keys `AUTH_USERNAME` / `AUTH_PASSWORD` (is_secret). Login POST
  sets an HttpOnly cookie `fuellog_session` = HMAC-SHA256 signed payload (secret
  `AUTH_SECRET` env key, generated default). Logout button in site header.
- **Image retention**: new `imageUrl String?` column on FuelVoucher (`image_url`, nullable —
  `prisma db push` + recorded migration). New `POST /api/uploads` accepts multipart image,
  stores under `public/uploads/<uuid>.<ext>`, returns URL. VoucherForm uploads on save and
  passes `imageUrl`; dashboard table and vehicle detail show a small thumbnail / image link.
- **Bulk PDF**: client renders each PDF page to a canvas image via `pdfjs-dist`, then sends
  each page image through the existing `/api/ocr/vision-correct` flow, extended with a
  `mode: "bulk"` response that returns an ARRAY of voucher records per page (Emjay vouchers
  are 2-up: two stubs per page). Collected entries land in a batch-review table (edit/delete
  rows, duplicate detection against DB via 409-per-row on save-all). Save All → sequential
  POSTs with per-row success/duplicate/fail status. Accept `application/pdf` in UploadZone
  (multi-file: images + PDFs).
- **Date range**: history endpoint accepts `from`/`to` as `YYYY-MM-DD` (full-day precision,
  inclusive `to`); vehicle view replaces month selects with two native date inputs + quick
  presets (All time, This month, Last 30 days). availableMonths still drives presets.
- **Excel**: add `xlsx` (SheetJS). `GET /api/export/excel` (all vouchers, optionally
  `?vehicleNo=`) streams an .xlsx workbook with formatted headers and typed columns.
  Dashboard header gets "Export All to Excel"; vehicle page gets "Export Vehicle to Excel".
- **Backup**: `GET /api/backup` returns full-table JSON download (`fuellog-backup-<date>.json`)
  including schema metadata and row count; button in the site header dropdown ("Download
  Database Backup").

## Tickets (order)
1. Phase 6 · Authentication & login page (protects dashboard + scan)
2. Phase 6 · Voucher image retention (schema, upload API, thumbnails)
3. Phase 6 · Bulk PDF voucher upload with batch review
4. Phase 6 · Custom date range filter on vehicle detail
5. Phase 6 · Excel export (dashboard + vehicle)
6. Phase 6 · Database backup download

## Edge cases
- Auth: wrong credentials show error; APIs return 401 JSON (not redirect) for fetches;
  duplicate-voucher 409 still reachable when logged in.
- Bulk PDF: 0 vouchers detected on a page → inline warning; duplicate rows flagged before save;
  large PDFs progress indicator; per-row failures don't abort the batch.
- Image retention: missing image renders placeholder; upload failure does NOT block voucher save.
- Date range: reversed range → clear validation message; empty range result → friendly empty state.
- Export/backup with zero rows → valid file with headers only.
