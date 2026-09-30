import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/ocr/bulk
 *
 * Bulk extraction for scanned voucher SHEETS (PDF pages or photos). Unlike
 * /api/ocr/vision-correct (which reads ONE fill from one-or-two duplicate
 * stubs), this endpoint returns an ARRAY of distinct voucher entries found in
 * the image — e.g. a ledger page holding many voucher stubs.
 *
 * Body: multipart/form-data with `image` (Blob/File).
 * Returns: { vouchers: [{voucherNo, vehicleNo, liters, date}], warnings?: string[] }
 */

const VISION_MODEL = process.env.OCR_VISION_MODEL || "z-ai/glm-4.6v";
const FALLBACK_MODELS = (process.env.OCR_VISION_FALLBACK_MODELS || "z-ai/glm-5")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

export const runtime = "nodejs";
export const maxDuration = 120;

type RawVoucher = {
  voucherNo?: string | null;
  vehicleNo?: string | null;
  liters?: number | string | null;
  date?: string | null;
};

function normalizeList(parsed: unknown): { vouchers: RawVoucher[]; warnings: string[] } {
  const warnings: string[] = [];
  let arr: RawVoucher[] = [];
  if (Array.isArray(parsed)) {
    arr = parsed as RawVoucher[];
  } else if (parsed && typeof parsed === "object") {
    const obj = parsed as { vouchers?: unknown; entries?: unknown; items?: unknown };
    const cand = obj.vouchers ?? obj.entries ?? obj.items;
    if (Array.isArray(cand)) arr = cand as RawVoucher[];
  }
  if (arr.length === 0) {
    warnings.push("No voucher entries were detected on this page.");
  }
  return { vouchers: arr, warnings };
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL;
  if (!apiKey || !baseUrl) {
    return NextResponse.json(
      { error: "Vision extraction is not configured (missing OPENAI_API_KEY / OPENAI_BASE_URL)." },
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
    return NextResponse.json({ error: "Image too large for vision extraction (max 6 MB)." }, { status: 413 });
  }

  try {
    const { default: sharpModule } = await import("sharp");
    const input = Buffer.from(await image.arrayBuffer());
    const buf = await sharpModule(input).resize({ width: 1600 }).jpeg({ quality: 85 }).toBuffer();
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
                    "This image is a page from a scanned fuel-voucher booklet or ledger " +
                    "(Emjay Motors credit vouchers). It may contain ONE OR MORE distinct " +
                    "voucher entries — often two stubs side by side, sometimes many rows. " +
                    "IMPORTANT: two stubs that share the same voucher number record the " +
                    "SAME fill — count them ONCE. Every DISTINCT voucher (different " +
                    "voucher number or clearly different fill) must be listed; do not " +
                    "skip any entry. For each distinct entry extract exactly: " +
                    "voucherNo (printed/stamped number near 'No.', typically 4-6 digits), " +
                    "vehicleNo (handwritten plate after 'Veh No.', e.g. JK02DW6302 — full plate), " +
                    "liters (numeric quantity next to Lts on the Petrol/Diesel/M. Oil line " +
                    "that has a value), date (handwritten date after 'Date', format DD/MM/YY). " +
                    'Reply ONLY with JSON: {"vouchers":[{"voucherNo":"...","vehicleNo":"...","liters":number,"date":"DD/MM/YY"}]}. ' +
                    "Use null for unreadable fields. Keep entries in reading order.",
                },
                { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
              ],
            },
          ],
          max_tokens: 4000,
        }),
        signal: AbortSignal.timeout(110_000),
      });

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
        console.error(`ocr/bulk: model ${model} failed (${r.status})`, lastDetail);
      } catch (e) {
        console.error(`ocr/bulk: model ${model} threw`, e);
        lastDetail = String(e).slice(0, 300);
      }
    }

    if (!res) {
      return NextResponse.json(
        {
          error: `Vision model request failed (${lastStatus}).`,
          hint: "All vision models are rate-limited or unavailable — try again later or enter entries manually.",
        },
        { status: 502 }
      );
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content ?? "";
    const jsonMatch = content.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Vision model returned no parseable result." }, { status: 502 });
    }
    const parsedRaw: unknown = JSON.parse(jsonMatch[0]);
    const { vouchers, warnings } = normalizeList(parsedRaw);

    // Normalize + validate each entry against the same rules as vision-correct.
    const out = vouchers
      .map((v) => {
        const entry: {
          voucherNo: string | null;
          vehicleNo: string | null;
          liters: number | null;
          date: string | null;
        } = { voucherNo: null, vehicleNo: null, liters: null, date: null };
        if (v.voucherNo && /^\d{4,8}$/.test(String(v.voucherNo).trim())) {
          entry.voucherNo = String(v.voucherNo).trim();
        }
        if (v.vehicleNo) {
          const plate = String(v.vehicleNo).toUpperCase().replace(/[^A-Z0-9]/g, "");
          if (/^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{3,4}$/.test(plate)) entry.vehicleNo = plate;
        }
        if (v.liters != null) {
          const n = Number(v.liters);
          if (Number.isFinite(n) && n > 0 && n <= 10_000) entry.liters = n;
        }
        if (v.date) {
          const m = String(v.date).match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
          if (m) {
            const dd = parseInt(m[1], 10);
            const mm = parseInt(m[2], 10);
            let yy = parseInt(m[3], 10);
            if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
              if (yy < 100) yy += yy < 70 ? 2000 : 1900;
              entry.date = `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
            }
          }
        }
        return entry;
      })
      // Keep entries that have at least a voucher number or a vehicle number.
      .filter((e) => e.voucherNo || e.vehicleNo);

    // De-duplicate within the page by voucherNo (identical stubs read twice).
    const seen = new Set<string>();
    const unique = out.filter((e) => {
      if (!e.voucherNo) return true;
      if (seen.has(e.voucherNo)) return false;
      seen.add(e.voucherNo);
      return true;
    });

    if (unique.length === 0 && warnings.length === 0) {
      warnings.push("No readable voucher entries were found on this page.");
    }
    return NextResponse.json({ vouchers: unique, warnings });
  } catch (err) {
    console.error("ocr/bulk failed:", err);
    return NextResponse.json({ error: "Bulk extraction failed unexpectedly." }, { status: 500 });
  }
}
