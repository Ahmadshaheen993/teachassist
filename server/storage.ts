// server/storage.ts — بديل مباشر لتخزين Manus Forge
// Cloudflare R2 (متوافق S3). نفس أسماء الدوال والتواقيع، فلا يتغير أي كود آخر.
//
// متغيرات البيئة المطلوبة:
//   R2_ACCOUNT_ID        من لوحة Cloudflare → R2
//   R2_ACCESS_KEY_ID     من R2 → Manage API Tokens (Object Read & Write)
//   R2_SECRET_ACCESS_KEY
//   R2_BUCKET            اسم الحاوية، مثل: teachassist
//   R2_PUBLIC_BASE_URL   اختياري: دومين عام للحاوية (مثل https://files.q-genius.com)
//                        إن لم يُضبط، تُستخدم روابط موقّعة مؤقتة للقراءة.

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";

function getR2Config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      "Storage config missing: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET",
    );
  }
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

let _client: S3Client | null = null;
function getClient(): S3Client {
  if (_client) return _client;
  const { accountId, accessKeyId, secretAccessKey } = getR2Config();
  _client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return _client;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

async function urlForKey(key: string): Promise<string> {
  const publicBase = process.env.R2_PUBLIC_BASE_URL;
  if (publicBase) return `${publicBase.replace(/\/+$/, "")}/${key}`;
  // لا دومين عام؟ رابط موقّت صالح لساعة
  const { bucket } = getR2Config();
  return await getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: 3600 },
  );
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const { bucket } = getR2Config();
  const key = appendHashSuffix(normalizeKey(relKey));
  const body = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return { key, url: await urlForKey(key) };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: await urlForKey(key) };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const { bucket } = getR2Config();
  return await getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: bucket, Key: normalizeKey(relKey) }),
    { expiresIn: 3600 },
  );
}
