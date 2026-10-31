import { METALS, SHAPES, STEPS, type Bootstrap, type SavedDesign, type Selection, type Step } from '../shared/contract';
import { diamondFits, settingCatalog, settingFor, settingsOf } from '../shared/compatibility';

export const emptySelection = (): Selection => ({ style: 'Hidden halo', shank: 'High polish', metal: '', shape: '', diamondId: '', size: '', engraving: '', engravingEnabled: false });
export const characterCount = (text: string) => Array.from(text).length;
export function restoreSelection(url: URL, catalog: Bootstrap): { selection: Selection; step: Step; unsupported: boolean } {
  const p = url.searchParams;
  const selection = emptySelection();
  const families = settingsOf(catalog);
  const requestedSetting = p.get('setting');
  const family = requestedSetting ? families.find(s => s.id === requestedSetting || s.handle === requestedSetting) : families.find(s => s.style === (p.get('style') || 'Hidden halo'));
  const unsupported = Boolean((requestedSetting && !family) || (p.has('style') && p.get('style') !== family?.style) || (p.has('shank') && p.get('shank') !== 'High polish'));
  if (family && !unsupported && (requestedSetting || p.has('style'))) { selection.settingId = family.id; selection.bandId = 'high-polish'; selection.style = family.style; }
  catalog = settingCatalog(catalog, selection);
  const metal = p.get('metal');
  const shape = p.get('shape');
  if (METALS.includes(metal as typeof METALS[number])) selection.metal = metal as Selection['metal'];
  if (SHAPES.includes(shape as typeof SHAPES[number])) selection.shape = shape as Selection['shape'];
  const diamond = catalog.diamonds.find(d => d.id === p.get('diamond') || d.sourceVariantId === p.get('diamond'));
  if (diamond && diamond.shape === selection.shape) selection.diamondId = diamond.id;
  const size = p.get('size') || '';
  if (catalog.setting.variants.some(v => v.metal === selection.metal && v.size === size)) selection.size = size;
  selection.engraving = Array.from(p.get('engraving') || '').slice(0, catalog.engraving.maxLength).join('');
  selection.engravingEnabled = Boolean(selection.engraving);
  const requested = p.get('step') as Step;
  const first = firstIncomplete(selection, catalog);
  const step = STEPS.includes(requested) && canNavigate(requested, selection, catalog) ? requested : first;
  return { selection, step: unsupported ? 'style' : step, unsupported };
}
export function stepComplete(step: Step, s: Selection, b: Bootstrap): boolean {
  const family = settingFor(b, s);
  b = settingCatalog(b, s);
  switch (step) {
    case 'style': return Boolean(family && s.style === family.style && (settingsOf(b).length === 1 || s.settingId));
    case 'shank': return Boolean(family && s.shank === family.shank);
    case 'metal': return Boolean(s.metal && b.setting.variants.some(v => v.metal === s.metal && v.available));
    case 'shape': return Boolean(s.shape && (!b.rules || b.rules.shapes.includes(s.shape)));
    case 'diamond': return Boolean(family && b.diamonds.some(d => d.id === s.diamondId && d.shape === s.shape && d.available && diamondFits(family, d)));
    case 'size': return b.setting.variants.some(v => v.metal === s.metal && v.size === s.size && v.available);
    case 'engraving': return !s.engravingEnabled || Boolean(s.engraving.trim() && characterCount(s.engraving) <= b.engraving.maxLength && b.engraving.available && !/[\u0000-\u001f\u007f]/.test(s.engraving));
    case 'review': return STEPS.slice(0, -1).every(k => stepComplete(k, s, b));
  }
}
export function firstIncomplete(s: Selection, b: Bootstrap): Step { return STEPS.slice(0, -1).find(step => !stepComplete(step, s, b)) || 'review'; }
export function canNavigate(step: Step, s: Selection, b: Bootstrap): boolean { return STEPS.slice(0, STEPS.indexOf(step)).every(k => stepComplete(k, s, b)); }
export function selectionUrl(base: URL, selection: Selection, step: Step): URL {
  const url = new URL(base);
  url.searchParams.delete('design');
  Object.entries({ setting: selection.settingId || '', style: selection.style, shank: selection.shank, metal: selection.metal, shape: selection.shape, diamond: selection.diamondId, size: selection.size, engraving: selection.engravingEnabled ? selection.engraving : '', step }).forEach(([key, value]) => value ? url.searchParams.set(key, value) : url.searchParams.delete(key));
  return url;
}
/** Preview sessions can hide their query parameter; the rendered theme is the fallback source of truth. */
export function themePreviewUrl(target: URL, current: URL, theme?: { id?: string | number; role?: string }): URL {
  const url = new URL(target);
  if (url.origin !== current.origin) return url;
  const explicit = current.searchParams.get('preview_theme_id');
  const rendered = theme?.role && theme.role !== 'main' ? String(theme.id || '') : '';
  const preview = explicit && /^\d+$/.test(explicit) ? explicit : rendered;
  if (/^\d+$/.test(preview)) url.searchParams.set('preview_theme_id', preview);
  return url;
}
export function reconcileSelection(s: Selection, b: Bootstrap): Selection {
  const next = { ...s };
  const family = settingFor(b, next);
  b = settingCatalog(b, next);
  if (next.metal && b.rules && !b.rules.metals.includes(next.metal)) next.metal = '';
  if (next.shape && b.rules && !b.rules.shapes.includes(next.shape)) next.shape = '';
  if (!family || !b.diamonds.some(d => d.id === next.diamondId && d.shape === next.shape && d.available && diamondFits(family, d))) next.diamondId = '';
  if (!b.setting.variants.some(v => v.metal === next.metal && v.size === next.size && v.available)) next.size = '';
  if (!b.engraving.available || characterCount(next.engraving) > b.engraving.maxLength) { next.engraving = ''; next.engravingEnabled = false; }
  return next;
}
/** A saved record describes history; current inventory only determines whether it can be purchased again. */
export function savedDesignState(design: SavedDesign, catalog: Bootstrap) {
  const selection = { ...design.selection };
  const family = settingFor(catalog, selection);
  if (catalog.settings && family && !selection.settingId) { selection.settingId = family.id; selection.bandId = 'high-polish'; }
  return { selection, step: 'review' as Step, needsReplacement: !stepComplete('review', selection, catalog) };
}
