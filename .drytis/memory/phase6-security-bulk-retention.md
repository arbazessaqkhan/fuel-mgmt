# Phase 6 — Security, Bulk Processing, Data Retention (all DONE: #13874–#13879)

## Auth (#13874)
- No next-auth. `src/lib/session-edge.ts` = Web Crypto HMAC-SHA256 token (edge-safe, middleware can't use node:crypto — that 500s). `src/lib/session.ts` re-exports + verifyCredentials + cookie options.
- `src/middleware.ts` guards everything except /login, /api/auth/login, _next/static, /uploads, static assets. Pages redirect to /login?from=…; APIs get 401 JSON. Logged-in users hitting /login are bounced to /.
- Env keys: AUTH_USERNAME (FuelPdc@7860#), AUTH_PASSWORD (secret, 7860#pdcAdmin), AUTH_SECRET (HMAC secret) — ids 52335–52337.
- GOTCHA: after login, use `window.location.href = "/"` (hard nav) — router.push soft RSC navigation raced the Set-Cookie and bounced back to /login.
- scripts/auth-e2e.js (10 checks) — logout selector must be the account dropdown (menu, not a direct button).

## Image retention (#13875)
- FuelVoucher.imageUrl (image_url, nullable) via db push + recorded migration 20260930160000_add_voucher_image.
- POST /api/uploads → public/uploads/<uuid>.<ext>, type/size validated; imageUrl validated as /^\/uploads\/[A-Za-z0-9._-]+$/.
- voucher-form uploads image best-effort on save (failure doesn't block save); dashboard + vehicle pages show ImageIcon link.

## Bulk PDF (#13876)
- /api/ocr/bulk = vision endpoint returning an ARRAY of distinct entries (2-up stubs counted once, de-duped by voucherNo).
- Client: pdfjs-dist@4 renders pages → canvas → /api/ocr/bulk. Batch-review table (bulk-upload.tsx) with per-row edit/delete/status (pending/saving/saved/duplicate/failed), sequential Save All (409 → duplicate flagged), failures don't abort.
- pdf.mjs needs a hand-written .d.ts (src/types/pdfjs.d.ts); shadcn tabs component added manually.
- Test PDF via python3 reportlab (--break-system-packages).

## Date range (#13877)
- history API accepts from/to as YYYY-MM-DD (inclusive to) OR YYYY-MM; reversed → 400. Vehicle view: Start/End date inputs + presets (All time, This month, Last 30 days); reversed → amber inline message.

## Export & backup (#13878/#13879)
- xlsx (SheetJS 0.18.5): GET /api/export/excel[?vehicleNo=] → .xlsx (Voucher No/Vehicle No/Liters/Date/Image URL). Buttons: dashboard "Export All to Excel", vehicle "Export Vehicle to Excel".
- GET /api/backup → JSON {exportType, schemaVersion, exportedAt, count, vouchers} as attachment fuellog-backup-YYYYMMDD-HHmm.json. Header account dropdown (UserRound icon): Download Database Backup + Logout.
- shadcn dropdown-menu component added manually (radix @radix-ui/react-dropdown-menu).
