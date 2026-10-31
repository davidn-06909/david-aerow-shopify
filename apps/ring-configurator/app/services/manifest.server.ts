import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { PilotError } from "./errors.server";
import { METALS, SHAPES } from "../../shared/contract";
const id = z.string().max(100).transform(v => v.trim().replace(/^gid:\/\/shopify\/(?:Product|ProductVariant|Location)\//, "")).refine(v => /^\d+$/.test(v), "Enter a Shopify ID");
const rulesSchema = z.object({ metals: z.array(z.enum(METALS)).min(1).max(4), shapes: z.array(z.enum(SHAPES)).min(1).max(2), engravingEnabled: z.boolean(), engravingMaxLength: z.number().int().min(1).max(20), minCarat: z.number().min(0).max(20).optional(), maxCarat: z.number().positive().max(20).optional(), diamondIds: z.array(id).max(200).optional(), sizes: z.array(z.string().min(1).max(20)).max(100).optional() }).superRefine((r, ctx) => {
  if ((r.minCarat || 0) > (r.maxCarat ?? 20)) ctx.addIssue({ code: 'custom', path: ['minCarat'], message: 'Minimum carat exceeds maximum.' });
  for (const key of ['metals', 'shapes', 'sizes', 'diamondIds'] as const) if (r[key] && new Set(r[key]).size !== r[key]!.length) ctx.addIssue({ code: 'custom', path: [key], message: 'Options must be unique.' });
});
export const settingSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,59}$/), title: z.string().trim().min(1).max(100), style: z.string().trim().min(1).max(80),
  family: z.enum(['hidden-halo', 'solitaire']).default('hidden-halo'), bandId: z.literal('high-polish').default('high-polish'), enabled: z.boolean(), productId: z.union([id, z.literal('')]),
  assetVersion: z.string().max(100), rules: rulesSchema,
}).superRefine((s, ctx) => { if (s.enabled && (!s.productId || !s.assetVersion)) ctx.addIssue({ code: 'custom', path: ['productId'], message: 'Enabled settings need a product and model version.' }); });
export const diamondSchema = z.object({
  variantId: id, sourceVariantId: z.union([id, z.literal("")]), enabled: z.boolean().default(true), shape: z.enum(SHAPES), origin: z.enum(["Lab grown", "Natural"]),
  carat: z.number().min(0).max(20), color: z.string().trim().max(20), clarity: z.string().trim().max(20), cut: z.string().trim().max(40),
  certificateLab: z.string().trim().max(40), certificateNumber: z.string().trim().max(100), certificateUrl: z.string().max(1000).refine(v => !v || /^https:\/\//.test(v), "Certificate must use HTTPS"),
});
export const manifestSchema = z.object({
  shop: z.string().regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/),
  sourceShop: z.string().regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/),
  settingProductId: id, sourceSettingHandle: z.string().max(100), engravingVariantId: id, fulfillmentLocationId: id.optional(),
  schemaVersion: z.literal(2).optional(),
  settings: z.array(settingSchema).min(1).max(10).optional(),
  rules: rulesSchema.default({ metals: [...METALS], shapes: [...SHAPES], engravingEnabled: true, engravingMaxLength: 20 }),
  diamonds: z.array(diamondSchema).min(1).max(200),
}).superRefine((m, ctx) => {
  if (m.settings) {
    if (!m.settings.some(s => s.enabled)) ctx.addIssue({ code: 'custom', path: ['settings'], message: 'Enable at least one setting.' });
    if (new Set(m.settings.map(s => s.id)).size !== m.settings.length) ctx.addIssue({ code: 'custom', path: ['settings'], message: 'Setting IDs must be unique.' });
    const enabled = m.settings.filter(s => s.enabled);
    if (new Set(enabled.map(s => s.productId)).size !== enabled.length || new Set(enabled.map(s => s.style)).size !== enabled.length) ctx.addIssue({ code: 'custom', path: ['settings'], message: 'Enabled settings need distinct product mappings and styles.' });
    if (enabled.some(s => s.rules.diamondIds?.some(id => !m.diamonds.some(d => d.variantId === id)))) ctx.addIssue({ code: 'custom', path: ['settings'], message: 'Setting diamond restrictions must reference managed variants.' });
  }
  const aliases = new Map<string, number>();
  m.diamonds.forEach((d, index) => {
    if (d.enabled) for (const key of ["carat", "color", "clarity", "cut"] as const) if (!d[key]) ctx.addIssue({ code: "custom", path: ["diamonds", index, key], message: "Complete this diamond detail before enabling it." });
    for (const key of new Set([d.variantId, d.sourceVariantId].filter(Boolean))) {
      if (key === m.engravingVariantId || aliases.has(key)) ctx.addIssue({ code: "custom", path: ["diamonds", index, "variantId"], message: "Diamond IDs and legacy aliases must identify one diamond only, and differ from engraving." });
      aliases.set(key, index);
    }
  });
  if (new Set(m.rules.metals).size !== m.rules.metals.length || new Set(m.rules.shapes).size !== m.rules.shapes.length) ctx.addIssue({ code: "custom", path: ["rules"], message: "Enabled options must be unique." });
  if (!m.diamonds.some(d => d.enabled && (m.settings ? m.settings.some(s => s.enabled && s.rules.shapes.includes(d.shape)) : m.rules.shapes.includes(d.shape)))) ctx.addIssue({ code: "custom", path: ["diamonds"], message: "Enable at least one diamond in a supported shape." });
});
export type PilotManifest = z.infer<typeof manifestSchema>;
export type SettingMapping = z.infer<typeof settingSchema>;
export function settingMappings(m: PilotManifest): SettingMapping[] {
  return m.settings || [{ id: 'lumen', title: 'The Lumen', style: 'Hidden halo', family: 'hidden-halo', bandId: 'high-polish', enabled: true, productId: m.settingProductId, assetVersion: ASSET_VERSION, rules: m.rules }];
}
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
