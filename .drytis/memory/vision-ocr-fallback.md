# Vision OCR rate-limit fallback (Sept 2026)

Symptom: OCR "regressed" (210 L / DIN630X / wrong date). Cause: primary vision model `z-ai/glm-4.6v` hit weekly rate limit (429 "Weekly/Monthly Limit Exhausted", resets 2026-10-01 10:01 UTC) — gateway has NO fallback group for 4.6v; scan page silently fell back to weak Tesseract.

Fix (ticket #13812): /api/ocr/vision-correct now loops `[VISION_MODEL, ...FALLBACK_MODELS]` where FALLBACK_MODELS = env `OCR_VISION_FALLBACK_MODELS` (default "z-ai/glm-5"). **z-ai/glm-5 is multimodal and reads the Emjay voucher correctly.** glm-5.1/5.2/5.3 are text-only (400 invalid content.type); MiniMax-M3 has insufficient balance. Scan page shows a warning toast when the vision endpoint fails so users double-check Tesseract values.

Model availability check pattern: POST /chat/completions with image_url content — 200 = multimodal, 400 code 1210 = text-only.
