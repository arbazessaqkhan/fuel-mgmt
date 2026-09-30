# Phase 4 · Advanced Interactive Vehicle Chart

## Goal
Replace the basic recharts bar chart with a polished, interactive vehicle-wise consumption chart worthy of a premium SaaS dashboard, and make each vehicle clickable (deep-linking into the Phase 4 vehicle detail view).

## Files to change
- `src/components/dashboard/vehicle-chart.tsx` — rebuild:
  - Horizontal or vertical bars with gradient fills (`--chart-1`), rounded caps, subtle grid.
  - Rich tooltip card (vehicle, liters, voucher count, share % of total) with pointer-follow.
  - Animated entrance + hover states (bar highlight/dim siblings).
  - Sorted by liters desc; show top N (e.g. 8) with a "show all" toggle if more.
  - Clicking a bar navigates to `/vehicles/[vehicleNo]` (Next router).
  - Empty/loading states preserved (Skeleton / dashed empty box).
  - Responsive; no overflow at 390px (reuse the table wrapper approach).
- Keep the component's contract: `VehicleChart({ stats, loading })`.

## Acceptance criteria (in the running app)
- [ ] Chart renders vehicle-wise monthly liters as polished gradient bars, sorted by liters descending.
- [ ] Hovering a bar shows a tooltip with vehicle, liters, voucher count and % share of the month's total.
- [ ] Bars animate in on load; hovering highlights the bar and dims the others.
- [ ] Clicking a bar navigates to that vehicle's detail page.
- [ ] An empty month still shows a friendly empty state; loading shows a skeleton.
- [ ] No horizontal overflow at 390px.

## Tests
- Playwright E2E with the seeded month: assert bar count matches `vehicleBreakdown`, tooltip appears on hover with correct liters, click navigates to `/vehicles/<plate>`.
- Responsive screenshot at 390px.

## Edge cases
- One vehicle only (single bar should still look right).
- Many vehicles (>8) → "show all" toggle works.
- Very long vehicle numbers on axis labels → truncate with ellipsis.
