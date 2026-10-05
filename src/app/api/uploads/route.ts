import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_SIZE,
  isB2Configured,
  putVoucherImage,
} from "@/lib/storage";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }
    const ext = ALLOWED_IMAGE_TYPES[file.type];
    if (!ext) {
      return NextResponse.json(
        { error: "Unsupported file type. Use JPEG, PNG or WebP." },
        { status: 400 }
      );
    }
    if (file.size > MAX_IMAGE_SIZE) {
      return NextResponse.json({ error: "File exceeds 10 MB limit." }, { status: 400 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());

    // Backblaze B2 when configured (survives redeploys on serverless hosts);
    // local public/uploads fallback for dev.
    if (isB2Configured()) {
      try {
        const { key } = await putVoucherImage(bytes, ext);
        return NextResponse.json({ url: `/api/images/${key}` }, { status: 201 });
      } catch (err) {
        console.error("B2 upload failed:", err);
        return NextResponse.json({ error: "Failed to store file." }, { status: 500 });
      }
    }

    const name = `${crypto.randomUUID()}.${ext}`;
    const dir = path.join(process.cwd(), "public", "uploads");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), bytes);
    // Served via the /uploads/[...path] route handler — `next start` snapshots
    // public/ at boot, so static serving 404s files uploaded after start.
    return NextResponse.json({ url: `/uploads/f/${name}` }, { status: 201 });
  } catch (err) {
    console.error("Upload failed:", err);
    return NextResponse.json({ error: "Failed to store file." }, { status: 500 });
  }
}
