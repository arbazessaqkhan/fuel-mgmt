# Phase 4 · Vehicle Detail View (month-by-month history)

## Goal
Add a per-vehicle detail page showing historical fuel consumption: a month-by-month liters breakdown over time, recent vouchers, and summary totals — reachable from the dashboard (chart bars, table rows, Most Active card).

## Backend
- New route `GET /api/vehicles/[vehicleNo]/history?months=12`:
  - Group `fuel_vouchers` by vehicle for the last N months (default 12, clamp 1–24), keyed `YYYY-MM`, each `{ month: "YYYY-MM", liters, vouchers }` — include zero-fill months with no vouchers within the window.
  - Response: `{ vehicleNo, fromMonth, toMonth, totalLiters, totalVouchers, months: [...], recent: FuelVoucher[] (latest 10) }`.
  - Vehicle not found → 404 `{ error }`; invalid plate → 400.
- Optional helper: `GET /api/vehicles` → distinct `vehicleNo` list (for future picker; cheap with groupBy).

## Frontend
- New page `src/app/vehicles/[vehicleNo]/page.tsx`:
  - Header: vehicle plate + summary cards (Total Liters in window, Total Vouchers, Avg per fill, Best month).
  - Month-by-month breakdown: bar/area chart of liters per month over the 12-month window (recharts, styled to Phase 4 chart standard), with month labels and tooltips; also a compact table/list fallback of the same data.
  - Recent vouchers list (latest 10): date, voucher no, liters.
  - Window selector (6/12/24 months).
  - Breadcrumb/back link to dashboard; loading skeletons; 404 state for unknown vehicle.
- Link sources: chart bar click (Phase 4 chart ticket), vehicle cells in the voucher table, Most Active metric card.

## Acceptance criteria (in the running app)
- [ ] Visiting `/vehicles/<plate>` for an existing vehicle shows a month-by-month liters breakdown for the chosen window (6/12/24 months).
- [ ] Summary cards show correct totals computed from the vehicle's actual data.
- [ ] Recent vouchers list shows the vehicle's latest vouchers with date, voucher no and liters.
- [ ] Vehicles with gaps in history show zero-activity months (no missing bars).
- [ ] An unknown vehicle plate shows a clear "vehicle not found" state.
- [ ] Chart bars on the dashboard, vehicle cells in the table, and the Most Active card all link to the vehicle detail page.
- [ ] Responsive at 390px; no console errors.

## Tests
- API test: seed known data → assert months array, zero-fill, totals, 404 case.
- Playwright E2E: from dashboard, click through chart bar → detail page → correct months/labels/totals; change window to 6 months → chart updates; back link works.
- Responsive screenshot at 390px.

## Edge cases
- Vehicle plates with special characters — encodeURIComponent the route param; Prisma `equals` match is exact.
- Vehicle with a single voucher ever — charts degrade gracefully (one point).
- Month window spanning year boundaries labels correctly (YYYY-MM sort).
