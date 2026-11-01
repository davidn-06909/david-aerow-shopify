import { describe, expect, it } from 'vitest';
import { fittingManifestSchema, findFittingApproval, inspectFitting } from '../app/services/fitting';
import { manifestSchema } from '../app/services/manifest.server';
import { manufacturingEligibility } from '../app/services/manufacturing.server';
import { fittingAllows } from '../shared/compatibility';
import { searchDiamonds } from '../app/services/diamond-search';
import { stepComplete } from '../storefront/state';
import type { Bootstrap, Selection } from '../shared/contract';

const shop = 'test-plus.myshopify.com';
const hash = (letter: string) => letter.repeat(64);
const settingRules = { metals: ['Platinum', '14K yellow gold'], shapes: ['Round', 'Oval'], engravingEnabled: true, engravingMaxLength: 20, sizes: ['4.5', '5'] };
const catalog = manifestSchema.parse({
  shop, sourceShop: shop, settingProductId: '10', sourceSettingHandle: 'lumen', engravingVariantId: '30',
  rules: settingRules, settings: [{ id: 'lumen', title: 'The Lumen', style: 'Hidden halo', family: 'hidden-halo', bandId: 'high-polish',
    enabled: true, productId: '10', assetVersion: 'lumen-visual-v3', rules: settingRules }],
  diamonds: [{ variantId: '20', sourceVariantId: '', enabled: true, shape: 'Round', origin: 'Lab grown', carat: 2,
    color: 'D', clarity: 'VS1', cut: 'Excellent', certificateLab: 'IGI', certificateNumber: 'CERT-20', certificateUrl: '' }],
});
const evidence = fittingManifestSchema.parse({
  schemaVersion: 1, shop,
  assemblies: [{ id: 'lumen-round-head', settingId: 'lumen', shape: 'Round', assetVersion: 'lumen-visual-v3',
    headRevision: 'HEAD-4', manufacturer: 'Test maker', drawingDigest: hash('a'), evidenceReference: 'private/drawing-4',
    metals: ['Platinum'], sizes: ['4.5', '5'] }],
  stones: [{ variantId: '20', shape: 'Round', certificateLab: 'IGI', certificateNumber: 'CERT-20',
    lengthMm: 8.1, widthMm: 8.05, depthMm: 4.9, measurementDigest: hash('b'), evidenceReference: 'private/cert-20' }],
  approvals: [{ id: '55555555-5555-4555-8555-555555555555', assemblyId: 'lumen-round-head', stoneVariantId: '20',
    metals: ['Platinum'], sizes: ['4.5'], approvedBy: 'Test maker reviewer',
    approvedAt: '2026-10-31T12:00:00.000Z', evidenceDigest: hash('c'), evidenceReference: 'private/approval-20' }],
});
const selection: Selection = { settingId: 'lumen', bandId: 'high-polish', style: 'Hidden halo', shank: 'High polish',
  metal: 'Platinum', shape: 'Round', diamondId: '20', size: '4.5', engraving: '', engravingEnabled: false };
const bootstrap = {
  mode: 'connected', shop, currency: 'USD', pilotVersion: 'test', assetVersion: 'lumen-visual-v3', assetBaseUrl: '/models', canPurchase: true,
  notices: [], fittingRequired: true, fittingReleaseId: '22222222-2222-4222-8222-222222222222',
  fittingApprovals: [{ settingId: 'lumen', diamondId: '20', shape: 'Round', metals: ['Platinum'], sizes: ['4.5'] }],
  setting: { id: 'lumen', handle: 'lumen', title: 'The Lumen', style: 'Hidden halo', shank: 'High polish',
    imageUrl: '', assetVersion: 'lumen-visual-v3', rules: settingRules,
    variants: [{ id: '40', metal: 'Platinum', size: '4.5', price: { amount: 245000, currency: 'USD' }, available: true },
      { id: '41', metal: 'Platinum', size: '5', price: { amount: 245000, currency: 'USD' }, available: true }] },
  engraving: { variantId: '30', price: { amount: 4500, currency: 'USD' }, available: true, maxLength: 20 },
  diamonds: [{ id: '20', sourceVariantId: '', handle: 'round', title: 'Round', shape: 'Round', origin: 'Lab grown',
    carat: 2, color: 'D', clarity: 'VS1', cut: 'Excellent', certificateLab: 'IGI', certificateNumber: 'CERT-20',
    certificateUrl: '', price: { amount: 310000, currency: 'USD' }, available: true, imageUrl: '' }],
} as Bootstrap;

describe('manufacturer fitting boundaries', () => {
  it('approves only the exact documented stone, head, metal and size', () => {
    expect(inspectFitting(evidence, catalog, shop).errors).toEqual([]);
    const options = { settingId: 'lumen', assetVersion: 'lumen-visual-v3', shape: 'Round' as const,
      metal: 'Platinum' as const, size: '4.5', diamondVariantId: '20', certificateNumber: 'CERT-20' };
    expect(findFittingApproval(evidence, options)?.approval.id).toBe(evidence.approvals[0].id);
    expect(findFittingApproval(evidence, { ...options, size: '5' })).toBeNull();
    expect(findFittingApproval(evidence, { ...options, certificateNumber: 'OTHER' })).toBeNull();
    expect(findFittingApproval(evidence, { ...options, assetVersion: 'lumen-visual-v2' })).toBeNull();
  });
  it('rejects contradictory catalog evidence and overlapping approvals', () => {
    expect(inspectFitting({ ...evidence, stones: [{ ...evidence.stones[0], certificateNumber: 'WRONG' }] }, catalog, shop).errors[0])
      .toContain('does not match');
    const duplicate = { ...evidence, approvals: [...evidence.approvals,
      { ...evidence.approvals[0], id: '66666666-6666-4666-8666-666666666666' }] };
    expect(inspectFitting(duplicate, catalog, shop).errors.some(e => e.includes('Multiple approvals'))).toBe(true);
    expect(inspectFitting({ ...evidence, approvals: [] }, catalog, shop).errors).toContain('At least one documented manufacturer approval is required to publish.');
  });
  it('uses fitting eligibility in buyer results and size progression', () => {
    expect(searchDiamonds(bootstrap, new URLSearchParams('setting=lumen&metal=Platinum&shape=Round')).total).toBe(1);
    expect(searchDiamonds(bootstrap, new URLSearchParams('setting=lumen&metal=14K+yellow+gold&shape=Round')).total).toBe(0);
    expect(fittingAllows(bootstrap, { ...selection, size: '' })).toBe(true);
    expect(stepComplete('diamond', { ...selection, size: '' }, bootstrap)).toBe(true);
    expect(stepComplete('size', selection, bootstrap)).toBe(true);
    expect(stepComplete('size', { ...selection, size: '5' }, bootstrap)).toBe(false);
  });
});

describe('manufacturing approval remains a separate gate', () => {
  const ready = { paymentState: 'PAID', cancelled: false, refunded: '0', verification: 'verified', associationStatus: 'verified_paid',
    fittingStatus: 'manufacturer-approved', fittingReleaseId: 'release-1', activeFittingReleaseId: 'release-1' };
  it('allows a human decision only for the current, paid and verified release', () => {
    expect(manufacturingEligibility(ready).ready).toBe(true);
    for (const changed of [
      { paymentState: 'PENDING' }, { cancelled: true }, { refunded: '45' }, { refunded: 'invalid' }, { verification: 'review_required' },
      { associationStatus: 'verified_refund_recorded' }, { fittingStatus: 'visual-unverified' }, { activeFittingReleaseId: 'release-2' },
    ]) expect(manufacturingEligibility({ ...ready, ...changed }).ready).toBe(false);
  });
});
