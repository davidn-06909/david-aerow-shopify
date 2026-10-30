import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PilotError } from "./errors.server";
export interface PreparedPreview { url?: string; data?: Uint8Array<ArrayBuffer>; mime?: string }
export function decodePreview(dataUrl: string) {
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new PilotError("INVALID_PREVIEW", "Preview must be a PNG or JPEG image.");
  const body = Buffer.from(match[2], "base64");
  if (body.length > 512_000 || body.length < 16) throw new PilotError("INVALID_PREVIEW", "Preview must be smaller than 500 KB.");
  const png = body.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg = body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
  if (!(match[1] === "png" ? png : jpeg)) throw new PilotError("INVALID_PREVIEW", "Preview image contents are invalid.");
  const mime = `image/${match[1]}`;
  let width = 0; let height = 0;
  if (png) {
    if (body.length < 45 || body.toString("ascii", 12, 16) !== "IHDR" || body.toString("ascii", body.length - 8, body.length - 4) !== "IEND") throw new PilotError("INVALID_PREVIEW", "Preview PNG structure is invalid.");
    width = body.readUInt32BE(16); height = body.readUInt32BE(20);
  } else {
    if (body[body.length - 2] !== 0xff || body[body.length - 1] !== 0xd9) throw new PilotError("INVALID_PREVIEW", "Preview JPEG structure is invalid.");
    for (let offset = 2; offset + 4 < body.length;) {
      if (body[offset++] !== 0xff) break;
      while (body[offset] === 0xff) offset++;
      const marker = body[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > body.length) break;
      const length = body.readUInt16BE(offset);
      if (length < 2 || offset + length > body.length) break;
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && length >= 7) { height = body.readUInt16BE(offset + 3); width = body.readUInt16BE(offset + 5); break; }
      offset += length;
    }
  }
  if (!width || !height || width > 2048 || height > 2048) throw new PilotError("INVALID_PREVIEW", "Preview dimensions must be between 1 and 2048 pixels.");
  return { body, mime, extension: match[1] === "jpeg" ? "jpg" : "png" };
}
export async function savePreview(shop: string, designId: string, dataUrl?: string): Promise<PreparedPreview> {
  if (!dataUrl) return {};
  const { body, mime, extension } = decodePreview(dataUrl);
  const provider = process.env.PREVIEW_STORAGE || "database";
  if (provider === "database") {
    const appUrl = process.env.SHOPIFY_APP_URL;
    if (!appUrl) throw new PilotError("STORAGE_REQUIRED", "Configure the app's public URL before saving previews.", 503);
    return { url: `${appUrl.replace(/\/$/, "")}/previews/${designId}`, data: new Uint8Array(body), mime };
  }
  if (provider !== "r2") throw new PilotError("STORAGE_REQUIRED", "Select the database or R2 preview-storage provider.", 503);
  const { R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL } = process.env;
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !R2_PUBLIC_URL) throw new PilotError("STORAGE_REQUIRED", "Configure R2 storage before saving preview images.", 503);
  const client = new S3Client({ endpoint: R2_ENDPOINT, region: "auto", credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY } });
  const key = `previews/${shop}/${designId}.${extension}`;
  await client.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body, ContentType: mime, CacheControl: "public,max-age=31536000,immutable" }));
  return { url: `${R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`, mime };
}
