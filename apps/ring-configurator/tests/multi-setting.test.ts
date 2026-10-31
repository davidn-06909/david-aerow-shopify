import { beforeEach, expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { METALS, SHAPES, type Bootstrap, type Metal, type Selection } from '../shared/contract';
import { settingCatalog, settingsOf } from '../shared/compatibility';
import { previewCatalog } from '../app/services/preview.server';
import { validateSelection } from '../app/services/validation';
import { emptySelection, reconcileSelection, restoreSelection, selectionUrl, stepComplete } from '../storefront/state';
import { searchDiamonds } from '../app/services/diamond-search';
import { verifyAssets } from '../app/services/assets.server';
import { loader as modelAssetLoader } from '../app/routes/model-assets.$filename';
import { manifestSchema, settingMappings } from '../app/services/manifest.server';
let catalog: Bootstrap;
beforeEach(async () => {
  catalog = await previewCatalog(); catalog.mode = 'connected'; catalog.canPurchase = true;
  const rules = { metals: [...METALS], shapes: [...SHAPES], engravingEnabled: true, engravingMaxLength: 20 };
  const lumen = { ...catalog.setting, id: 'lumen', rules, assetVersion: 'lumen-visual-v3' };
  const solitaire = { ...lumen, rules: { ...rules }, id: 'solitaire', title: 'Fixture Solitaire', style: 'Solitaire', handle: 'fixture-solitaire', assetVersion: 'solitaire-visual-v1', variants: lumen.variants.map(v => ({ ...v, id: `solitaire-${v.id}`, price: { ...v.price, amount: v.price.amount - 100000 } })) };
  catalog.settings = [lumen, solitaire];
});
const selected = (settingId = 'lumen', shape: 'Round' | 'Oval' = 'Round', metal: Metal = METALS[3]): Selection => ({ ...emptySelection(), settingId, bandId: 'high-polish', style: settingId === 'lumen' ? 'Hidden halo' : 'Solitaire', shape, metal, size: '4.5', diamondId: shape === 'Round' ? '55882563911753' : '55882564042825' });
test.each(['lumen', 'solitaire'].flatMap(id => SHAPES.flatMap(shape => METALS.map(metal => [id, shape, metal] as const))))('%s / %s / %s resolves its own real variant mapping', (id, shape, metal) => {
  const request = { selection: selected(id, shape, metal) };
  const value = validateSelection(request, catalog);
  expect(value.family.id).toBe(id);
  expect(value.setting.id.startsWith('solitaire-')).toBe(id === 'solitaire');
  expect(stepComplete('review', request.selection, catalog)).toBe(true);
});
test('new journeys start at Setting and explicit legacy links still reach review', () => {
  expect(restoreSelection(new URL('https://example.test/'), catalog).step).toBe('style');
  const legacy = selectionUrl(new URL('https://example.test/'), selected(), 'review'); legacy.searchParams.delete('setting');
  expect(restoreSelection(legacy, catalog).step).toBe('review');
  expect(restoreSelection(legacy, catalog).selection.settingId).toBe('lumen');
});
test('new URLs restore a distinct family and conflicting labels never silently select another', () => {
  const url = selectionUrl(new URL('https://example.test/'), selected('solitaire'), 'review');
  expect(restoreSelection(url, catalog).selection).toEqual(selected('solitaire'));
  url.searchParams.set('style', 'Hidden halo'); expect(restoreSelection(url, catalog).unsupported).toBe(true);
  expect(() => validateSelection({ selection: { ...selected(), settingId: 'solitaire' } }, catalog)).toThrow();
});
test('setting switches retain compatible choices and remove only incompatible ones', () => {
  const original = { ...selected(), engravingEnabled: true, engraving: 'Together' };
  expect(reconcileSelection({ ...original, settingId: 'solitaire', style: 'Solitaire' }, catalog)).toEqual({ ...original, settingId: 'solitaire', style: 'Solitaire' });
  catalog.settings![1].rules = { ...catalog.settings![1].rules!, shapes: ['Oval'], engravingEnabled: false, sizes: ['5'] };
  catalog.settings![1].variants = catalog.settings![1].variants.filter(v => v.size === '5');
  const changed = reconcileSelection({ ...original, settingId: 'solitaire', style: 'Solitaire' }, catalog);
  expect(changed.metal).toBe('Platinum'); expect(changed.shape).toBe(''); expect(changed.diamondId).toBe(''); expect(changed.size).toBe(''); expect(changed.engravingEnabled).toBe(false);
});
test('setting eligibility is enforced on browsing and direct quote calls', () => {
  catalog.settings![1].rules!.maxCarat = 1.2;
  expect(searchDiamonds(catalog, new URLSearchParams('setting=solitaire')).diamonds.every(d => d.carat <= 1.2)).toBe(true);
  expect(() => validateSelection({ selection: selected('solitaire') }, catalog)).toThrow();
  expect(() => searchDiamonds(catalog, new URLSearchParams('setting=missing'))).toThrow();
});
test('disabled engraving is scoped to a family and cannot hide another family service', () => {
  catalog.settings![0].rules!.engravingEnabled = false;
  expect(settingCatalog(catalog, selected()).engraving.available).toBe(false);
  expect(settingCatalog(catalog, selected('solitaire')).engraving.available).toBe(true);
});
test('legacy manifests adapt without changing the stored payload; ambiguous products fail', async () => {
  const input = JSON.parse(await readFile('config/pilot.example.json', 'utf8')); input.settingProductId = '100'; input.engravingVariantId = '101'; input.diamonds = input.diamonds.map((d: object, i: number) => ({ ...d, variantId: String(200 + i) }));
  const parsed = manifestSchema.parse(input); const before = JSON.stringify(parsed);
  const legacy = settingMappings(parsed); expect(legacy[0].id).toBe('lumen'); expect(JSON.stringify(parsed)).toBe(before);
  expect(() => manifestSchema.parse({ ...parsed, settings: [legacy[0], { ...legacy[0], id: 'duplicate' }] })).toThrow();
});
test('all approved files have exact build hashes; arbitrary versions are rejected', async () => {
  for (const version of ['lumen-visual-v1', 'lumen-visual-v2', 'lumen-visual-v3', 'solitaire-visual-v1']) expect(await verifyAssets(version)).toEqual([]);
  expect(await verifyAssets('../../.env')).not.toEqual([]);
});
test('model publication and delivery find packaged assets independently of the working directory', async () => {
  const cwd = process.cwd();
  try {
    process.chdir(resolve(cwd, '../..'));
    expect(await verifyAssets('lumen-visual-v3')).toEqual([]);
    const response = await modelAssetLoader({ request: new Request('https://pilot.test/model-assets/manifest.json'), params: { filename: 'manifest.json' } } as unknown as Parameters<typeof modelAssetLoader>[0]);
    expect(response.status).toBe(200);
    expect(await response.json()).toHaveProperty('version', 'ring-assets-v3');
  } finally { process.chdir(cwd); }
});
test.each(['round', 'oval'])('Solitaire %s has six prongs and no hidden halo; Lumen retains halo geometry', async shape => {
  const io = new NodeIO();
  const solitaire = await io.read(`public/models/solitaire-visual-v1-${shape}.glb`);
  const names = solitaire.getRoot().listNodes().map(n => n.getName());
  expect(names.filter(n => /^Prong-\d$/.test(n))).toHaveLength(6); expect(names.some(n => n.startsWith('Halo'))).toBe(false);
  expect(names).toEqual(expect.arrayContaining(['HeadAnchor', 'EngravingRegion', 'Band', 'CenterStone']));
  const lumen = await io.read(`public/models/lumen-visual-v3-${shape}.glb`);
  expect(lumen.getRoot().listNodes().some(n => n.getName() === 'HiddenHaloRail')).toBe(true);
});
