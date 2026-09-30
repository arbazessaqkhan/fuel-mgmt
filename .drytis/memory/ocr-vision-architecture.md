# OCR architecture — vision-first (Sept 2026)

Real handwritten Emjay Motors vouchers defeated Tesseract (read "210" for 40 litres, "DIN630X" for JK02DW6302, wrong date). Solution:

- **Primary extraction = server-side vision model** via `/api/ocr/vision-correct` (src/app/api/ocr/vision-correct/route.ts). Model `z-ai/glm-4.6v` through the Drytis LLM gateway. Env keys: `VISION_LLM_BASE_URL` (https://llm.drytis.ai), `VISION_LLM_API_KEY` (project key, minted via create_openai_api_key), `VISION_LLM_MODEL`. Prompt explicitly handles one-stub AND two-duplicate-stub photos (both stubs = same fill; read the clearest).
- **Tesseract multipass stays as fallback** (multipass-client.ts, client-side); merge policy in src/app/scan/page.tsx: vision read WINS any field it returns; local kept only for fields vision couldn't read. Do NOT gate the merge on local confidence — Tesseract is confidently wrong on handwriting.
- Always call the vision endpoint (no confidence gating); route is runtime=nodejs, maxDuration=120, image downscaled to 1200px JPEG q80 via sharp.

## Verified ground truth (Emjay voucher)
voucherNo 16072 (red stamp), vehicleNo JK02DW6302, liters 40 (Diesel line), date 29/9/26 → 2026-09-29. Both /workspace/userDocs photos (image_39ae5479.png, image_bbdb9289.png) PASS in real browser E2E (scripts/scan-browser-e2e.js) and API E2E (scripts/vision-e2e.js); duplicate voucherNo → 409 with form data preserved.

## Gotchas
- `npm run build` type-checks scripts/*.ts — guard nullable DOM reads.
- prisma migrate dev fails (P3014 shadow DB); use db push + `migrate diff` + `migrate resolve`.
- Dev/prod env override for the API key was set scope=development (env_key id 52156). For production deploy, set a production-scope override too.
