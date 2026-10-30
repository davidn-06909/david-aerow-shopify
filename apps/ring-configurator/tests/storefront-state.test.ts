import { describe, expect, it } from 'vitest';
import type { Bootstrap, SavedDesign, Selection } from '../shared/contract';
import { canNavigate, characterCount, emptySelection, reconcileSelection, restoreSelection, savedDesignState, selectionUrl, stepComplete, themePreviewUrl } from '../storefront/state';
const catalog = { setting: { handle: 'the-lumen', variants: [{ id: '1', metal: 'Platinum', size: '4.5', price: { amount: 245000, currency: 'USD' }, available: true }] }, engraving: { maxLength: 20, available: true }, diamonds: [{ id: '12', sourceVariantId: '55882563911753', shape: 'Round', available: true }] } as Bootstrap;
const original = new URL('https://example.test/pages/design-your-ring?style=Hidden+halo&step=review&size=4.5&engraving=3ertyui&metal=Platinum&shank=High+polish&shape=Round&diamond=55882563911753');
describe('storefront configuration restoration', () => {
  it('hydrates numeric legacy links before allowing review', () => { const result = restoreSelection(original, catalog); expect(result.step).toBe('review'); expect(result.selection.diamondId).toBe('12'); expect(canNavigate('review', result.selection, catalog)).toBe(true); });
  it('rebuilds omitted fields on Back rather than merging previous state', () => { const s = restoreSelection(new URL('https://example.test/?metal=Platinum&shape=Round'), catalog).selection; expect(s.engraving).toBe(''); expect(s.engravingEnabled).toBe(false); expect(s.diamondId).toBe(''); expect(s.size).toBe(''); });
  it('invalidates shape-dependent stones but retains an eligible size', () => { const s = restoreSelection(original, catalog).selection; const changed = reconcileSelection({ ...s, shape: 'Oval' }, catalog); expect(changed.diamondId).toBe(''); expect(changed.size).toBe('4.5'); });
  it('rejects an unknown size and guards later steps', () => { const url = new URL(original); url.searchParams.set('size', '25'); const result = restoreSelection(url, catalog); expect(result.selection.size).toBe(''); expect(result.step).toBe('size'); });
  it('preserves complete state in shareable query links', () => { const s = restoreSelection(original, catalog).selection; const url = selectionUrl(new URL('https://example.test/?foo=keep'), s, 'review'); expect(url.searchParams.get('foo')).toBe('keep'); expect(restoreSelection(url, catalog).selection).toEqual(s); });
  it('reports unsupported pilot settings', () => { const url = new URL(original); url.searchParams.set('style', 'Bezel'); expect(restoreSelection(url, catalog).unsupported).toBe(true); });
  it('counts restored engraving consistently, including Unicode code points', () => { expect(20 - characterCount('3ertyui')).toBe(13); expect(characterCount('A💎B')).toBe(3); });
  it('does not allow skipping the diamond requirement', () => { const s: Selection = { ...emptySelection(), metal: 'Platinum', shape: 'Round' }; expect(canNavigate('review', s, catalog)).toBe(false); });
  it('restores immutable saved choices to review after the unique diamond has sold', () => {
    const selection = restoreSelection(original, catalog).selection;
    const design = { selection } as SavedDesign;
    const soldCatalog = { ...catalog, diamonds: catalog.diamonds.map(d => ({ ...d, available: false })) };
    const view = savedDesignState(design, soldCatalog);
    expect(view.selection).toEqual(selection); expect(view.selection.diamondId).toBe('12');
    expect(view.step).toBe('review'); expect(view.needsReplacement).toBe(true);
    expect(stepComplete('review', view.selection, soldCatalog)).toBe(false);
    view.selection.engraving = 'changed copy'; expect(design.selection.engraving).toBe('3ertyui');
  });
  it('keeps the rendered unpublished theme when Shopify strips its preview parameter', () => {
    const current = new URL('https://example.test/pages/design-your-ring?design=original');
    const target = new URL('https://example.test/pages/design-your-ring?design=shared&step=review');
    const url = themePreviewUrl(target, current, { id: 12345, role: 'unpublished' });
    expect(url.searchParams.get('preview_theme_id')).toBe('12345'); expect(url.searchParams.get('design')).toBe('shared'); expect(url.searchParams.get('step')).toBe('review');
  });
  it('prefers an explicit preview and never injects the live theme ID or leaks into another origin', () => {
    const current = new URL('https://example.test/?preview_theme_id=456'); const target = new URL('https://example.test/?configuration=ring');
    expect(themePreviewUrl(target, current, { id: 123, role: 'unpublished' }).searchParams.get('preview_theme_id')).toBe('456');
    expect(themePreviewUrl(target, new URL('https://example.test/'), { id: 123, role: 'main' }).searchParams.has('preview_theme_id')).toBe(false);
    expect(themePreviewUrl(new URL('https://external.test/'), current, { id: 123, role: 'unpublished' }).searchParams.has('preview_theme_id')).toBe(false);
  });
});
