import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { PilotError } from "./errors.server";
import { METALS, SHAPES } from "../../shared/contract";
const id = z.string().max(100).transform(v => v.trim().replace(/^gid:\/\/shopify\/(?:Product|ProductVariant|Location)\//, "")).refine(v => /^\d+$/.test(v), "Enter a Shopify ID");
export const diamondSchema = z.object({
  variantId: id, sourceVariantId: z.union([id, z.literal("")]), enabled: z.boolean().default(true), shape: z.enum(SHAPES), origin: z.enum(["Lab grown", "Natural"]),
  carat: z.number().min(0).max(20), color: z.string().trim().max(20), clarity: z.string().trim().max(20), cut: z.string().trim().max(40),
  certificateLab: z.string().trim().max(40), certificateNumber: z.string().trim().max(100), certificateUrl: z.string().max(1000).refine(v => !v || /^https:\/\//.test(v), "Certificate must use HTTPS"),
});
export const manifestSchema = z.object({
  shop: z.string().regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/),
  sourceShop: z.string().regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/),
  settingProductId: id, sourceSettingHandle: z.string().max(100), engravingVariantId: id, fulfillmentLocationId: id.optional(),
  rules: z.object({ metals: z.array(z.enum(METALS)).min(1).max(4), shapes: z.array(z.enum(SHAPES)).min(1).max(2), engravingEnabled: z.boolean(), engravingMaxLength: z.number().int().min(1).max(20) }).default({ metals: [...METALS], shapes: [...SHAPES], engravingEnabled: true, engravingMaxLength: 20 }),
  diamonds: z.array(diamondSchema).min(1).max(200),
}).superRefine((m, ctx) => {
  const aliases = new Map<string, number>();
  m.diamonds.forEach((d, index) => {
    if (d.enabled) for (const key of ["carat", "color", "clarity", "cut"] as const) if (!d[key]) ctx.addIssue({ code: "custom", path: ["diamonds", index, key], message: "Complete this diamond detail before enabling it." });
    for (const key of new Set([d.variantId, d.sourceVariantId].filter(Boolean))) {
      if (key === m.engravingVariantId || aliases.has(key)) ctx.addIssue({ code: "custom", path: ["diamonds", index, "variantId"], message: "Diamond IDs and legacy aliases must identify one diamond only, and differ from engraving." });
      aliases.set(key, index);
    }
  });
  if (new Set(m.rules.metals).size !== m.rules.metals.length || new Set(m.rules.shapes).size !== m.rules.shapes.length) ctx.addIssue({ code: "custom", path: ["rules"], message: "Enabled options must be unique." });
  if (!m.diamonds.some(d => d.enabled && m.rules.shapes.includes(d.shape))) ctx.addIssue({ code: "custom", path: ["diamonds"], message: "Enable at least one diamond in a supported shape." });
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
  if (!manifest.settingProductId || manifest.diamonds.some(d => !d.variantId)) throw new PilotError("MAPPING_INCOMPLETE", "Complete the setting and diamond mappings before publishing.", 503);
  const ids = manifest.diamonds.map(d => d.variantId);
  if (new Set(ids).size !== ids.length || ids.includes(manifest.engravingVariantId)) throw new PilotError("MAPPING_INVALID", "Each diamond and engraving must map to a different variant.", 503);
}
export function gid(kind: "Product" | "ProductVariant" | "Location", value: string) {
  const id = value.replace(`gid://shopify/${kind}/`, "");
  if (!/^\d+$/.test(id)) throw new PilotError("MAPPING_INVALID", `Invalid Shopify ${kind} ID.`, 503);
  return `gid://shopify/${kind}/${id}`;
}
export function numericId(value: string) { return value.split("/").pop() || value; }
