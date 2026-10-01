import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

// `next start` snapshots public/ at boot, so images uploaded AFTER the server
// started 404 on /uploads/<file>. Serving them through this route handler (which
// reads from disk on every request) fixes that. Also keeps working after the
// periodic container reboots.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  // Accept the canonical /uploads/f/<name> form (and legacy /uploads/<name>).
  const segs = segments && segments[0] === "f" ? segments.slice(1) : segments;
  // Sanitize: exactly one plain filename, no traversal, known extension.
  if (!segs || segs.length !== 1) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const name = segs[0];
  if (!/^[A-Za-z0-9._-]+$/.test(name) || name.includes("..")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const mime = MIME[ext];
  if (!mime) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const buf = await readFile(path.join(process.cwd(), "public", "uploads", name));
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "content-type": mime,
        "cache-control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
