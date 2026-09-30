import { NextResponse } from "next/server";

/**
 * POST /api/ocr/vision-correct
 *
 * Server-side AI-vision corrector. The browser's Tesseract pass runs first
 * (free, offline); when its result is low-confidence or incomplete, the scan
 * page posts the voucher image here and a vision model re-extracts the four
 * fields. This handles real photographed handwritten vouchers that defeat
 * regex OCR.
 *
 * Body: multipart/form-data with `image` (Blob/File).
 * Returns the same shape as the client OcrService: field -> {value, confidence}.
 */

const VISION_MODEL = process.env.OCR_VISION_MODEL || "z-ai/glm-4.6v";
// Fallback vision models tried in order when the primary fails (rate limit,
// outage, etc.). glm-5 is multimodal and reads handwriting well.
const FALLBACK_MODELS = (process.env.OCR_VISION_FALLBACK_MODELS || "z-ai/glm-5")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

export const runtime = "nodejs";
export const maxDuration = 120;

function fieldConf(raw: unknown): number {
  return raw == null ? 0 : 0.85;
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL;
  if (!apiKey || !baseUrl) {
    return NextResponse.json(
      { error: "Vision corrector is not configured (missing OPENAI_API_KEY / OPENAI_BASE_URL)." },
      { status: 503 }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data with an `image` field." }, { status: 400 });
  }
  const image = form.get("image");
  if (!(image instanceof Blob)) {
    return NextResponse.json({ error: "Missing `image` file." }, { status: 400 });
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Image too large for vision correction (max 6 MB)." }, { status: 413 });
  }

  try {
    const { default: sharpModule } = await import("sharp");
    const input = Buffer.from(await image.arrayBuffer());
    // Downscale + JPEG so the payload fits the gateway's size limits while
    // keeping enough resolution to read handwriting.
    const buf = await sharpModule(input).resize({ width: 1200 }).jpeg({ quality: 80 }).toBuffer();
    const b64 = buf.toString("base64");

    const callModel = (model: string) =>
      fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text:
                    "This is a photo of one or two handwritten fuel vouchers " +
                    "(Emjay Motors credit vouchers — the photo may show a single " +
                    "stub or two duplicate stubs side by side; if there are two " +
                    "stubs they record the SAME fill, so read the clearest one). " +
                    "Extract exactly: voucherNo (the stamped/printed number near " +
                    "'No.', typically 4-6 digits), vehicleNo (the handwritten " +
                    "registration plate after 'Veh No.', e.g. JK02DW6302 — read " +
                    "the FULL plate, not just part of it), liters (the numeric " +
                    "handwritten quantity next to Lts on the Petrol/Diesel/M. Oil " +
                    "line that has a value — e.g. '40 litres', NOT any other " +
                    "number on the form), date (the handwritten date after " +
                    "'Date', format DD/MM/YY). " +
                    'Reply ONLY with JSON: {"voucherNo":"...","vehicleNo":"...","liters":number,"date":"DD/MM/YY"}. ' +
                    "Use null for unreadable fields.",
                },
                { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
              ],
            },
          ],
          max_tokens: 1500,
        }),
        signal: AbortSignal.timeout(90_000),
      });

    // Try the primary model, then each fallback, until one succeeds.
    let res: Response | null = null;
    let lastStatus = 502;
    let lastDetail = "";
    for (const model of [VISION_MODEL, ...FALLBACK_MODELS]) {
      try {
        const r = await callModel(model);
        if (r.ok) {
          res = r;
          break;
        }
        lastStatus = r.status;
        lastDetail = (await r.text().catch(() => "")).slice(0, 300);
        console.error(`vision-correct: model ${model} failed (${r.status})`, lastDetail);
      } catch (e) {
        console.error(`vision-correct: model ${model} threw`, e);
        lastDetail = String(e).slice(0, 300);
      }
    }

    if (!res) {
      console.error("vision-correct: all vision models failed");
      return NextResponse.json(
        {
          error: `Vision model request failed (${lastStatus}).`,
          hint: "All vision models are rate-limited or unavailable — enter the details manually, or try again later.",
        },
        { status: 502 }
      );
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content ?? "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Vision model returned no parseable result." }, { status: 502 });
    }
    const parsed = JSON.parse(jsonMatch[0]) as {
      voucherNo?: string | null;
      vehicleNo?: string | null;
      liters?: number | string | null;
      date?: string | null;
    };

    // Normalize + validate against the same rules as the parsers.
    const out: Record<string, { value: string | number | null; confidence: number }> = {
      voucherNo: { value: null, confidence: 0 },
      vehicleNo: { value: null, confidence: 0 },
      liters: { value: null, confidence: 0 },
      date: { value: null, confidence: 0 },
    };
    if (parsed.voucherNo && /^\d{4,8}$/.test(String(parsed.voucherNo).trim())) {
      out.voucherNo = { value: String(parsed.voucherNo).trim(), confidence: fieldConf(parsed.voucherNo) };
    }
    if (parsed.vehicleNo) {
      const plate = String(parsed.vehicleNo).toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (/^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{3,4}$/.test(plate)) {
        out.vehicleNo = { value: plate, confidence: fieldConf(parsed.vehicleNo) };
      }
    }
    if (parsed.liters != null) {
      const v = Number(parsed.liters);
      if (Number.isFinite(v) && v > 0 && v <= 10_000) {
        out.liters = { value: v, confidence: fieldConf(parsed.liters) };
      }
    }
    if (parsed.date) {
      const m = String(parsed.date).match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
      if (m) {
        const dd = parseInt(m[1], 10);
        const mm = parseInt(m[2], 10);
        let yy = parseInt(m[3], 10);
        if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
          if (yy < 100) yy += yy < 70 ? 2000 : 1900;
          out.date = { value: `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`, confidence: fieldConf(parsed.date) };
        }
      }
    }
    return NextResponse.json(out);
  } catch (err) {
    console.error("vision-correct failed:", err);
    return NextResponse.json({ error: "Vision correction failed unexpectedly." }, { status: 500 });
  }
}
