import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import prisma from '../db.server';
import type { Metal, Shape } from '../../shared/contract';
import { activeManifest } from './catalog-state.server';
import type { AdminClient } from './catalog.server';
import { PilotError } from './errors.server';
import { emptyFittingManifest, findFittingApproval, fittingManifestSchema, inspectFitting, type FittingManifest } from './fitting';
import { lockGuardConfig, setCheckoutFittingRelease } from './checkout-guard.server';

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export function fittingRequired(shop: string) {
  return process.env.REQUIRE_FITTING_APPROVAL === 'true' && process.env.PILOT_ALLOWED_SHOP === shop;
}

export function parseFittingManifest(input: unknown, shop: string): FittingManifest {
  const parsed = fittingManifestSchema.safeParse(input);
  if (!parsed.success) throw new PilotError('INVALID_FITTING', 'Correct the highlighted fitting evidence.', 422,
    Object.fromEntries(parsed.error.issues.map(issue => [issue.path.join('.'), issue.message])));
  if (parsed.data.shop !== shop) throw new PilotError('SHOP_MISMATCH', 'Fitting evidence belongs to another store.', 403);
  return parsed.data;
}

export async function initializeFitting(shop: string) {
  return prisma.fittingState.upsert({
    where: { shop },
    create: { shop, draft: json(emptyFittingManifest(shop)) },
    update: {},
  });
}

export async function saveFittingDraft(shop: string, revision: number, input: unknown) {
  const manifest = parseFittingManifest(input, shop);
  const changed = await prisma.fittingState.updateMany({ where: { shop, revision }, data: { draft: json(manifest), revision: { increment: 1 } } });
  if (changed.count !== 1) throw new PilotError('FITTING_CONFLICT', 'The fitting draft changed. Reload before saving.', 409);
  return revision + 1;
}

export async function activeFitting(shop: string) {
  const state = await prisma.fittingState.findUnique({ where: { shop } });
  if (!state?.activeVersion) return null;
  const release = await prisma.fittingRelease.findFirst({ where: { shop, id: state.activeVersion } });
  if (!release) throw new PilotError('FITTING_RELEASE_MISSING', 'The active manufacturer fitting release is unavailable.', 503);
  return { version: release.id, manifest: parseFittingManifest(release.manifest, shop) };
}

export async function fittingForSelection(shop: string, options: {
  settingId: string; assetVersion: string; shape: Shape; metal: Metal; size: string; diamondVariantId: string; certificateNumber: string;
}) {
  if (!fittingRequired(shop)) return null;
  const active = await activeFitting(shop);
  if (!active) throw new PilotError('FITTING_REQUIRED', 'Manufacturer fitting approval is not published for this store.', 422);
  const match = findFittingApproval(active.manifest, options);
  if (!match) throw new PilotError('FITTING_UNVERIFIED', 'The manufacturer has not approved this exact setting and diamond combination.', 422);
  return { releaseId: active.version, ...match };
}

export async function validateFittingDraft(admin: AdminClient, shop: string, revision: number) {
  const { inspectMappedCatalog } = await import('./catalog.server');
  const state = await initializeFitting(shop);
  if (state.revision !== revision) throw new PilotError('FITTING_CONFLICT', 'The fitting draft changed. Reload before validating.', 409);
  const manifest = parseFittingManifest(state.draft, shop);
  const active = await activeManifest(shop);
  const report = inspectFitting(manifest, active.manifest, shop);
  const catalog = await inspectMappedCatalog(admin, shop, active.manifest, active.version);
  report.errors.push(...catalog.report.errors);
  for (const assembly of manifest.assemblies) {
    const setting = catalog.catalog.settings?.find(s => s.id === assembly.settingId);
    if (!setting) continue;
    for (const metal of assembly.metals) for (const size of assembly.sizes)
      if (!setting.variants.some(v => v.metal === metal && v.size === size))
        report.errors.push(`Assembly ${assembly.id} covers ${metal}/${size}, which has no mapped Shopify variant.`);
  }
  return { report, manifest, catalogVersion: active.version };
}

export async function publishFitting(admin: AdminClient, shop: string, revision: number, actor: string) {
  if (!actor || actor === 'merchant') throw new PilotError('OPERATOR_REQUIRED', 'A verified Shopify operator must publish fitting approval.', 403);
  if (!fittingRequired(shop)) throw new PilotError('FITTING_GATE_DISABLED', 'Enable manufacturer fitting enforcement for this exact shop before publishing approval.', 409);
  const { report, manifest, catalogVersion } = await validateFittingDraft(admin, shop, revision);
  if (report.errors.length) throw new PilotError('FITTING_PUBLICATION_BLOCKED', 'Resolve fitting evidence errors before publishing.', 422,
    Object.fromEntries(report.errors.map((message, i) => [`validation.${i}`, message])));
  return prisma.$transaction(async tx => {
    // Serialize Shopify guard writes with the database transition for this shop.
    await lockGuardConfig(tx, shop);
    const state = await tx.fittingState.findUniqueOrThrow({ where: { shop } });
    if (state.revision !== revision) throw new PilotError('FITTING_CONFLICT', 'The fitting draft changed during publication.', 409);
    const version = randomUUID();
    try {
      // Shopify must know the new release before the database can mint tickets for it.
      await setCheckoutFittingRelease(admin, shop, version, tx);
      const changed = await tx.fittingState.updateMany({ where: { shop, revision }, data: { activeVersion: version, revision: { increment: 1 } } });
      if (changed.count !== 1) throw new PilotError('FITTING_CONFLICT', 'The fitting draft changed during publication.', 409);
      await tx.fittingRelease.create({ data: { id: version, shop, manifest: json(manifest), report: json({ ...report, catalogVersion }), actor, action: 'publish' } });
    } catch (error) {
      await setCheckoutFittingRelease(admin, shop, state.activeVersion, tx).catch(() => undefined);
      throw error;
    }
    return { version, report };
  }, { timeout: 60_000 });
}

export async function suspendFitting(admin: AdminClient, shop: string, revision: number, actor: string) {
  if (!actor || actor === 'merchant') throw new PilotError('OPERATOR_REQUIRED', 'A verified Shopify operator must suspend fitting approval.', 403);
  await initializeFitting(shop);
  return prisma.$transaction(async tx => {
    await lockGuardConfig(tx, shop);
    const state = await tx.fittingState.findUniqueOrThrow({ where: { shop } });
    if (state.revision !== revision) throw new PilotError('FITTING_CONFLICT', 'The fitting draft changed. Reload before suspending.', 409);
    try {
      if (fittingRequired(shop)) await setCheckoutFittingRelease(admin, shop, null, tx);
      const changed = await tx.fittingState.updateMany({ where: { shop, revision }, data: { activeVersion: null, revision: { increment: 1 } } });
      if (changed.count !== 1) throw new PilotError('FITTING_CONFLICT', 'The fitting draft changed during suspension.', 409);
      await tx.fittingRelease.create({ data: { shop, manifest: json(state.draft), report: json({ suspendedVersion: state.activeVersion }), actor, action: 'suspend' } });
    } catch (error) {
      if (fittingRequired(shop)) await setCheckoutFittingRelease(admin, shop, state.activeVersion, tx).catch(() => undefined);
      throw error;
    }
  }, { timeout: 60_000 });
}
