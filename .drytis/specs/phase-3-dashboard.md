# Phase 3 — Dashboard, Monthly Analytics, Table & Chart

## Goal
Professional dashboard: metric cards, month/year filter, searchable/sortable table, vehicle-wise bar chart.

## Files
- `src/app/(app)/dashboard/page.tsx` (or `/` as dashboard)
- `src/components/dashboard/metric-cards.tsx` — Total Liters This Month, Total Vouchers Processed, Most Active Vehicle
- `src/components/dashboard/month-picker.tsx` — month + year selector (shadcn popover/select based)
- `src/components/dashboard/voucher-table.tsx` — columns Date, Voucher No., Vehicle No., Liters; global search; column sorting; pagination
- `src/components/dashboard/vehicle-chart.tsx` — bar chart (recharts via shadcn charts) liters per vehicle for selected month
- Delete/edit actions wired to API from the table

## Acceptance Criteria (running app)
- [ ] Cards show correct totals for the selected month
- [ ] Changing month/year updates cards, table, and chart together
- [ ] Table search filters by voucher no / vehicle no; column sort works
- [ ] Chart shows per-vehicle totals for the month
- [ ] A voucher deleted from the table disappears from all widgets
- [ ] Fully responsive down to mobile width

## Tests / Edges
- Empty month → zeroed cards, empty-table state, empty-chart state
- Data saved in one month stays fixed to that month when navigating
