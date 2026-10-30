import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { PilotError } from "./errors.server";
const diamondSchema = z.object({
  variantId: z.string(), sourceVariantId: z.string(), shape: z.enum(["Round", "Oval"]), origin: z.enum(["Lab grown", "Natural"]),
  carat: z.number().positive(), color: z.string(), clarity: z.string(), cut: z.string(),
  certificateLab: z.string(), certificateNumber: z.string(), certificateUrl: z.string().refine(v => !v || /^https:\/\//.test(v), "Certificate must use HTTPS"),
});
export const manifestSchema = z.object({
  shop: z.string().regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/),
  sourceShop: z.string().regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/),
  settingProductId: z.string(), sourceSettingHandle: z.string(), engravingVariantId: z.string(), fulfillmentLocationId: z.string().optional(),
  diamonds: z.array(diamondSchema).length(4),
});
export type PilotManifest = z.infer<typeof manifestSchema>;
export const PILOT_VERSION = "lumen-pilot-v1";
export const ASSET_VERSION = "lumen-visual-v2";
export async function readManifest(): Promise<PilotManifest> {
  try { return manifestSchema.parse(JSON.parse(process.env.PILOT_MANIFEST_JSON || await readFile(resolve(process.env.PILOT_MANIFEST_PATH || "config/pilot.local.json"), "utf8"))); }
  catch { throw new PilotError("MAPPING_REQUIRED", "Configure the development-store product and variant mappings in PILOT_MANIFEST_PATH.", 503); }
}
export function assertMapping(manifest: PilotManifest, shop: string) {
  if (manifest.shop !== shop) throw new PilotError("SHOP_MISMATCH", "This pilot is mapped to a different development store.", 403);
  if (!manifest.settingProductId || manifest.diamonds.some(d => !d.variantId)) throw new PilotError("MAPPING_INCOMPLETE", "Complete the setting and four diamond mappings before enabling the pilot.", 503);
  const ids = manifest.diamonds.map(d => d.variantId);
  if (new Set(ids).size !== 4 || ids.includes(manifest.engravingVariantId)) throw new PilotError("MAPPING_INVALID", "Each pilot diamond and engraving must map to a different variant.", 503);
}
export function gid(kind: "Product" | "ProductVariant" | "Location", value: string) {
  const id = value.replace(`gid://shopify/${kind}/`, "");
  if (!/^\d+$/.test(id)) throw new PilotError("MAPPING_INVALID", `Invalid Shopify ${kind} ID.`, 503);
  return `gid://shopify/${kind}/${id}`;
}
export function numericId(value: string) { return value.split("/").pop() || value; }
