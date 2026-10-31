import type { Bootstrap, Metal, Shape, PilotDiamond, RingSetting, Selection } from './contract';
import { assembly } from './assets';

export function settingsOf(catalog: Bootstrap): RingSetting[] {
  return catalog.settings || [{ ...catalog.setting, id: 'lumen', assetVersion: catalog.assetVersion, rules: catalog.rules }];
}
export function settingFor(catalog: Bootstrap, selection: Pick<Selection, 'settingId' | 'style'>): RingSetting | undefined {
  const settings = settingsOf(catalog);
  if (selection.settingId) return settings.find(s => s.id === selection.settingId);
  // Requests without IDs are supported only through an unambiguous legacy style.
  const matches = settings.filter(s => s.style === selection.style);
  return matches.length === 1 ? matches[0] : undefined;
}
export function diamondFits(setting: RingSetting, diamond: PilotDiamond) {
  const rules = setting.rules;
  return (!rules || (rules.shapes.includes(diamond.shape) && diamond.carat >= (rules.minCarat ?? 0) && diamond.carat <= (rules.maxCarat ?? Infinity) && (!rules.diamondIds?.length || rules.diamondIds.includes(diamond.id))));
}
export function settingCatalog(catalog: Bootstrap, selection: Pick<Selection, 'settingId' | 'style'>): Bootstrap {
  const setting = settingFor(catalog, selection);
  if (!setting) return { ...catalog, setting: { ...catalog.setting, variants: [] }, canPurchase: false };
  return { ...catalog, setting, rules: setting.rules || catalog.rules, assetVersion: setting.assetVersion || catalog.assetVersion,
    engraving: { ...catalog.engraving, available: catalog.engraving.available && (setting.rules?.engravingEnabled ?? true), maxLength: setting.rules?.engravingMaxLength || catalog.engraving.maxLength } };
}
/** Semantic errors are independent of stock. The server separately rechecks commerce availability. */
export function compatibilityErrors(catalog: Bootstrap, selection: Selection): string[] {
  const setting = settingFor(catalog, selection);
  if (!setting || selection.style !== setting.style || selection.shank !== setting.shank || (selection.bandId && selection.bandId !== 'high-polish')) return ['SETTING_INVALID'];
  const rules = setting.rules || catalog.rules;
  const errors: string[] = [];
  if (rules && (!rules.metals.includes(selection.metal as Metal) || !rules.shapes.includes(selection.shape as Shape))) errors.push('OPTION_DISABLED');
  if (!assembly(setting.assetVersion || catalog.assetVersion, selection.shape)) errors.push('ASSET_UNAVAILABLE');
  const diamond = catalog.diamonds.find(d => d.id === selection.diamondId || d.sourceVariantId === selection.diamondId);
  if (diamond && (!diamondFits(setting, diamond) || diamond.shape !== selection.shape)) errors.push('INCOMPATIBLE_DIAMOND');
  if (selection.engravingEnabled && rules?.engravingEnabled === false) errors.push('ENGRAVING_UNAVAILABLE');
  return errors;
}
