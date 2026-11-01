import { z } from 'zod';
import { METALS, SHAPES, type Metal, type Shape } from '../../shared/contract';
import { LEGACY_ASSET_VERSION } from '../../shared/assets';
import type { PilotManifest } from './manifest.server';

const hash = z.string().regex(/^[0-9a-f]{64}$/i, 'Use the SHA-256 digest of the reviewed evidence.');
const variantId = z.string().regex(/^[1-9]\d{0,19}$/, 'Use a Shopify numeric variant ID.');
const identifier = z.string().regex(/^[a-z][a-z0-9-]{0,59}$/);
const measurement = z.number().finite().positive().max(50);

export const fittingManifestSchema = z.object({
  schemaVersion: z.literal(1),
  shop: z.string().regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/),
  assemblies: z.array(z.object({
    id: identifier,
    settingId: identifier,
    shape: z.enum(SHAPES),
    assetVersion: z.string().min(1).max(100),
    headRevision: z.string().trim().min(1).max(100),
    manufacturer: z.string().trim().min(2).max(120),
    drawingDigest: hash,
    evidenceReference: z.string().trim().min(3).max(300),
    metals: z.array(z.enum(METALS)).min(1).max(4),
    sizes: z.array(z.string().min(1).max(20)).min(1).max(100),
  }).strict()).max(40),
  stones: z.array(z.object({
    variantId,
    shape: z.enum(SHAPES),
    certificateLab: z.string().trim().min(1).max(40),
    certificateNumber: z.string().trim().min(1).max(100),
    lengthMm: measurement,
    widthMm: measurement,
    depthMm: measurement,
    measurementDigest: hash,
    evidenceReference: z.string().trim().min(3).max(300),
  }).strict()).max(200),
  approvals: z.array(z.object({
    id: z.uuid(),
    assemblyId: identifier,
    stoneVariantId: variantId,
    metals: z.array(z.enum(METALS)).min(1).max(4),
    sizes: z.array(z.string().min(1).max(20)).min(1).max(100),
    approvedBy: z.string().trim().min(2).max(120),
    approvedAt: z.iso.datetime({ offset: true }),
    evidenceDigest: hash,
    evidenceReference: z.string().trim().min(3).max(300),
  }).strict()).max(500),
}).strict();

export type FittingManifest = z.infer<typeof fittingManifestSchema>;
export type FittingApproval = FittingManifest['approvals'][number];
export type FittingStone = FittingManifest['stones'][number];

export function emptyFittingManifest(shop: string): FittingManifest {
  return { schemaVersion: 1, shop, assemblies: [], stones: [], approvals: [] };
}

export interface FittingReport { errors: string[]; warnings: string[]; checkedAt: string }

/** Only exact, documented stone/assembly pairs are approved. Carat is never a proxy for fit. */
export function inspectFitting(manifest: FittingManifest, catalog: PilotManifest, shop: string): FittingReport {
  const errors: string[] = [], warnings: string[] = [];
  if (manifest.shop !== shop || catalog.shop !== shop) errors.push('Fitting evidence belongs to another Shopify store.');
  const mapped = catalog.settings || [{ id: 'lumen', enabled: true, assetVersion: LEGACY_ASSET_VERSION, rules: catalog.rules }];
  const settings = new Map(mapped.filter(s => s.enabled).map(s => [s.id, s]));
  const diamonds = new Map(catalog.diamonds.filter(d => d.enabled).map(d => [d.variantId, d]));
  const assemblies = new Map(manifest.assemblies.map(a => [a.id, a]));
  const stones = new Map(manifest.stones.map(s => [s.variantId, s]));
  const unique = (values: string[], label: string) => {
    if (new Set(values).size !== values.length) errors.push(`Duplicate ${label} entries.`);
  };
  unique(manifest.assemblies.map(a => a.id), 'assembly');
  unique(manifest.stones.map(s => s.variantId), 'stone');
  unique(manifest.approvals.map(a => a.id), 'approval');
  for (const assembly of manifest.assemblies) {
    const setting = settings.get(assembly.settingId);
    if (!setting || setting.assetVersion !== assembly.assetVersion || !setting.rules.shapes.includes(assembly.shape))
      errors.push(`Assembly ${assembly.id} does not match an enabled setting, shape and model version.`);
    else if (assembly.metals.some(m => !setting.rules.metals.includes(m)) || assembly.sizes.some(size => setting.rules.sizes?.length && !setting.rules.sizes.includes(size)))
      errors.push(`Assembly ${assembly.id} includes a metal or size outside its catalog rules.`);
    unique(assembly.metals, `${assembly.id} metal`);
    unique(assembly.sizes, `${assembly.id} size`);
  }
  for (const stone of manifest.stones) {
    const diamond = diamonds.get(stone.variantId);
    if (!diamond || diamond.shape !== stone.shape || diamond.certificateLab !== stone.certificateLab || diamond.certificateNumber !== stone.certificateNumber)
      errors.push(`Stone ${stone.variantId} does not match its enabled Shopify catalog mapping and certificate.`);
    if (stone.shape === 'Round' && Math.abs(stone.lengthMm - stone.widthMm) > Math.max(stone.lengthMm, stone.widthMm) * 0.12)
      warnings.push(`Round stone ${stone.variantId} has a large length/width difference; confirm the measurement.`);
  }
  const combinations = new Set<string>();
  for (const approval of manifest.approvals) {
    const assembly = assemblies.get(approval.assemblyId), stone = stones.get(approval.stoneVariantId);
    if (!assembly || !stone || assembly.shape !== stone.shape) {
      errors.push(`Approval ${approval.id} must reference a matching assembly and measured stone.`);
      continue;
    }
    if (approval.metals.some(m => !assembly.metals.includes(m)) || approval.sizes.some(size => !assembly.sizes.includes(size)))
      errors.push(`Approval ${approval.id} exceeds the manufacturer's assembly coverage.`);
    if (new Date(approval.approvedAt).getTime() > Date.now() + 60_000)
      errors.push(`Approval ${approval.id} has a future approval date.`);
    unique(approval.metals, `${approval.id} metal`);
    unique(approval.sizes, `${approval.id} size`);
    for (const metal of approval.metals) for (const size of approval.sizes) {
      const key = `${assembly.settingId}/${assembly.shape}/${stone.variantId}/${metal}/${size}`;
      if (combinations.has(key)) errors.push(`Multiple approvals cover ${key}; publish one unambiguous decision.`);
      combinations.add(key);
    }
  }
  if (!manifest.approvals.length) errors.push('At least one documented manufacturer approval is required to publish.');
  return { errors, warnings, checkedAt: new Date().toISOString() };
}

export function findFittingApproval(manifest: FittingManifest, options: {
  settingId: string; assetVersion: string; shape: Shape; metal: Metal; size: string; diamondVariantId: string; certificateNumber: string;
}): { approval: FittingApproval; stone: FittingStone; assembly: FittingManifest['assemblies'][number] } | null {
  const stone = manifest.stones.find(s => s.variantId === options.diamondVariantId && s.shape === options.shape && s.certificateNumber === options.certificateNumber);
  if (!stone) return null;
  for (const assembly of manifest.assemblies) {
    if (assembly.settingId !== options.settingId || assembly.assetVersion !== options.assetVersion || assembly.shape !== options.shape
      || !assembly.metals.includes(options.metal) || !assembly.sizes.includes(options.size)) continue;
    const approval = manifest.approvals.find(a => a.assemblyId === assembly.id && a.stoneVariantId === stone.variantId
      && a.metals.includes(options.metal) && a.sizes.includes(options.size));
    if (approval) return { assembly, stone, approval };
  }
  return null;
}
