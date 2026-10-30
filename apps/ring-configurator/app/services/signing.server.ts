import { createHmac, timingSafeEqual } from "node:crypto";
import { PilotError } from "./errors.server";
function secret() { const key = process.env.CONFIGURATION_SIGNING_SECRET; if (!key || key.length < 32) throw new PilotError("SIGNING_REQUIRED", "Configure a signing secret of at least 32 characters.", 503); return key; }
export function signReference(payload: { q: string; d: string; g: string; s: string; e: number }) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${createHmac("sha256", secret()).update(encoded).digest("base64url")}`;
}
export function verifyReference(reference: string, shop: string, now = Date.now()) {
  try {
    const [payload, signature, extra] = reference.split(".");
    if (!payload || !signature || extra) return null;
    const expected = createHmac("sha256", secret()).update(payload).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString()) as { q: string; d: string; g: string; s: string; e: number };
    return decoded.s === shop && decoded.e > now ? decoded : null;
  } catch (error) { if (error instanceof PilotError) throw error; return null; }
}
