# Phase 4 · Premium UI/UX Overhaul

## Goal
Redesign the app shell and dashboard chrome so FuelLog reads as a modern, professional fleet-management SaaS: coherent design tokens, premium typography and spacing, polished cards, and a proper navigation header.

## Files to change
- `src/app/globals.css` — define the FULL shadcn/ui token set (`--background, --foreground, --card, --card-foreground, --primary, --primary-foreground, --secondary, --muted, --muted-foreground, --accent, --accent-foreground, --destructive, --border, --input, --ring, --radius`, chart colors `--chart-1..5`) for `:root` AND `.dark`. Remove the body `font-family: Arial` override so the Geist font variables apply. Use a refined neutral/slate palette with a confident brand primary (e.g. deep blue/green fleet tone). Add subtle utilities (soft shadows, glass header) as needed.
- `src/app/layout.tsx` — rebuild the header: sticky, blurred glass background, brand block with icon + "FuelLog" wordmark + "Fleet Manager" tagline, Next `Link` navigation (Dashboard, Scan Voucher) with active-route highlighting, responsive (collapses cleanly at 390px). Wire `next-themes` with a light/dark toggle (class strategy on `<html>`; keep `prefers-color-scheme` as default). Improve page-level spacing/max-width container (`max-w-7xl`, consistent `py` rhythm).
- `src/components/dashboard/metric-cards.tsx` — premium card treatment: subtle gradient/tinted icon chips, larger numeric typography (tabular-nums), delta/context line ("vs previous month" is out of scope — use month label), hover lift transition, skeleton preserved.
- `src/app/page.tsx` + `src/app/scan/page.tsx` — align headings/spacing with the new scale; keep all behavior.
- Optional: `src/components/ui/*` — no structural changes, they inherit tokens.

## Acceptance criteria (in the running app)
- [ ] Dashboard and scan pages render with the full token set: buttons, inputs, cards, badges all show proper brand colors (no unstyled/fallback colors).
- [ ] Header is sticky, shows brand + Dashboard / Scan Voucher links, highlights the active page, and uses client-side navigation.
- [ ] Dark-mode toggle switches the whole UI between light and dark themes; choice persists across reloads.
- [ ] Metric cards have the premium treatment (icon chips, larger numerals, hover lift).
- [ ] Typography uses the Geist font (not Arial); headings/body show a clear hierarchy.
- [ ] No horizontal overflow at 390px; layout holds on desktop 1440px.

## Tests
- Playwright E2E: load `/`, assert header/links/active state, toggle dark mode → `<html>` class flips and background color changes, reload → persisted; screenshot 1440px and 390px, assert no horizontal scroll.
- Manual visual pass on both pages in light and dark.

## Edge cases
- `next-themes` hydration: suppress warning on `<html>`, avoid flash (ThemeProvider defaultTheme="system", enableSystem).
- Long vehicle numbers in the Most Active card must truncate, not wrap the layout.
- All existing functionality (table, edit/delete, scan flow) must keep working — this is a reskin, not a rewrite.
