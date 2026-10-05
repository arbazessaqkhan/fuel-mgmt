import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";

/**
 * Backblaze B2 (S3-compatible) image storage.
 * Active only when all B2_* env vars are set; otherwise callers fall back
 * to local disk (dev). Credentials come from the environment only.
 */

const B2_ENDPOINT = process.env.B2_ENDPOINT;
const B2_BUCKET = process.env.B2_BUCKET;
const B2_KEY_ID = process.env.B2_KEY_ID;
const B2_APP_KEY = process.env.B2_APP_KEY;

export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB

export function isB2Configured(): boolean {
  return Boolean(B2_ENDPOINT && B2_BUCKET && B2_KEY_ID && B2_APP_KEY);
}

function client(): S3Client {
  if (!isB2Configured()) throw new Error("B2 is not configured.");
  return new S3Client({
    region: "us-west-000", // B2 ignores region when endpoint is set, but the SDK requires one
    endpoint: B2_ENDPOINT,
    credentials: { accessKeyId: B2_KEY_ID!, secretAccessKey: B2_APP_KEY! },
  });
}

/** Stable image key: vouchers/<uuid>.<ext> */
export function newImageKey(ext: string): string {
  return `vouchers/${crypto.randomUUID()}.${ext}`;
}

export function isValidImageKey(key: string): boolean {
  return /^vouchers\/[A-Za-z0-9-]+\.(jpg|jpeg|png|webp)$/.test(key);
}

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function imageMime(key: string): string | undefined {
  return MIME[key.split(".").pop()?.toLowerCase() ?? ""];
}

export async function putVoucherImage(
  bytes: Buffer,
  ext: string
): Promise<{ key: string }> {
  const key = newImageKey(ext);
  await client().send(
    new PutObjectCommand({
      Bucket: B2_BUCKET,
      Key: key,
      Body: bytes,
      ContentType: imageMime(key),
    })
  );
  return { key };
}

export async function getVoucherImage(key: string): Promise<Buffer | null> {
  try {
    const res = await client().send(
      new GetObjectCommand({ Bucket: B2_BUCKET, Key: key })
    );
    return Buffer.from(await res.Body!.transformToByteArray());
  } catch {
    return null;
  }
}
