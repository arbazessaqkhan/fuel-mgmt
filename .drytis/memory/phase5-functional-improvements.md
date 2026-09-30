# Phase 5 functional improvements (Sept 2026) — #13753, #13755, #13757, #13758 all Done

- **#13753**: voucher-table rows fully clickable → router.push(/vehicles/<plate>); edit/delete stopPropagation; per-cell Link replaced with plain text.
- **#13755 + #13757 API**: /api/vehicles/[vehicleNo]/history now accepts `from=YYYY-MM&to=YYYY-MO` (explicit range wins; reversed → 400) plus `months` fallback (clamped 1–24). NO zero-fill — only months with data returned. New `availableMonths` field = all-time distinct data months (drives dropdowns). 404 when vehicle has no vouchers.
- **#13757 UI**: 6M/12M/24M pills replaced with Start/End Radix Selects grouped by year; options ONLY from availableMonths; end options filtered to months > start (`endAvailable`); picking a start ≤ current end resets end to null (placeholder "Pick start first", select disabled until start chosen); defaults to full range after first load.
- **#13758**: VoucherForm renders a full manual-entry form when `ocr === null` (was a "scan a voucher" placeholder) with Manual-entry info banner; FieldError helper extracted; validation/duplicate handling shared with OCR path. Verified manual save → DB row, duplicate → error + data preserved, upload flow unchanged (real voucher still extracts 16072/JK02DW6302/40/2026-09-29).
- E2E: scripts/phase5-e2e.js — 16/16 PASS. Unit tests 31/31.
