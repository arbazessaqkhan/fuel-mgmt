# Phase 2 — Scanner & Upload Module with OCR

## Goal
Drag-and-drop image upload; Tesseract.js OCR extracts voucherNo, vehicleNo, liters, date via regex; extracted data lands in a pre-filled editable form before save.

## Files
- `src/lib/ocr/tesseract-adapter.ts` — implements `OcrService` interface (swap point for Google Cloud Vision)
- `src/lib/ocr/parsers.ts` — regex extraction: voucher number (alphanumeric ID), license-plate-like vehicle no, liters (numeric w/ optional "L"/"litres"), date (multiple common formats)
- `src/components/scanner/upload-zone.tsx` — drag-and-drop / file picker, image preview, size/type validation (jpg/png/webp, ≤10MB)
- `src/components/scanner/voucher-form.tsx` — editable pre-filled form w/ validation, confidence warnings per field
- `src/app/(app)/scan/page.tsx`

## Behavior
- OCR runs client-side (Tesseract.js worker) with progress indicator
- Low-confidence or unparseable fields are highlighted in the form; user can correct
- Duplicate voucherNo caught on submit → toast + inline error, keeps form data
- Failed OCR (empty/unreadable) → error state offering manual entry

## Acceptance Criteria (running app)
- [ ] Uploading an image shows a preview and OCR progress, then a pre-filled editable form
- [ ] User can edit every field; only valid data can be saved
- [ ] Saving stores the voucher and it appears on the dashboard
- [ ] Duplicate voucherNo shows a clear error and does not save
- [ ] Uploading a non-image or oversized file shows a validation error

## Tests / Edges
- Garbled image → graceful failure, manual-entry path works
- Ambiguous date formats normalized to ISO
- Empty vehicleNo / zero liters blocked by validation
