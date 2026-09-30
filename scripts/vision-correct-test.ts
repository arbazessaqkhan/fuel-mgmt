// Test the vision corrector against the real voucher photo.
import { readFileSync } from "fs";
import sharp from "sharp";

async function main() {
  const meta = await sharp("/workspace/userDocs/image_39ae5479.png").metadata();
  const W = meta.width!;
  // Crop the left stub at high resolution
  const buf = await sharp("/workspace/userDocs/image_39ae5479.png")
    .extract({ left: 0, top: 0, width: Math.floor(W / 2), height: meta.height! })
    .resize({ width: 1200 }).jpeg({ quality: 80 }).png().toBuffer();
  const b64 = buf.toString("base64");
  const body = {
    model: "z-ai/glm-4.6v",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "This is a fuel voucher. Extract exactly: voucherNo (stamped 4-6 digit number), vehicleNo (registration plate), liters (numeric), date (DD/MM/YY). Reply ONLY with JSON: {\"voucherNo\":\"...\",\"vehicleNo\":\"...\",\"liters\":number,\"date\":\"DD/MM/YY\"}. Use null for unreadable fields." },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
        ],
      },
    ],
    max_tokens: 1500,
  };
  const res = await fetch(`${process.env.OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  console.log(res.status, JSON.stringify(data.choices?.[0]?.message ?? data, null, 1));
}
main();
