import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getVoucherImage, imageMime, isValidImageKey } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Authenticated image serving. Reached at /api/images/<key...>; the session
 * middleware guards /api/* so unauthenticated requests never get here.
 * - B2 keys (vouchers/<uuid>.<ext>) stream from the B2 bucket.
 * - Legacy keys (/uploads/f/<name> from the local-disk era) read from disk.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  const key = (segments ?? []).join("/");
  if (!key) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const mime = imageMime(key);
  if (!mime) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let buf: Buffer | null = null;

  if (key.startsWith("vouchers/")) {
    if (!isValidImageKey(key)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    buf = await getVoucherImage(key);
  } else if (key.startsWith("uploads/")) {
    // Legacy local-disk image: accept /api/images/uploads/<name> and
    // /api/images/uploads/f/<name>.
    const segs = segments!;
    const name = segs[segs.length - 1];
    if (
      segs.length > 3 ||
      !/^[A-Za-z0-9._-]+$/.test(name) ||
      name.includes("..")
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    try {
      buf = await readFile(path.join(process.cwd(), "public", "uploads", name));
    } catch {
      buf = null;
    }
  } else {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!buf) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "content-type": mime,
      "cache-control": "private, max-age=3600",
    },
  });
}
