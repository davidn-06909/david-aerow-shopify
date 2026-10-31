import { z } from "zod";
import type { Bootstrap, QuoteRequest, Selection } from "../../shared/contract";
import { METALS, SHAPES } from "../../shared/contract";
import { PilotError } from "./errors.server";
import { compatibilityErrors, settingCatalog, settingFor } from '../../shared/compatibility';
export const requestSchema = z.object({
  selection: z.object({ settingId: z.string().regex(/^[a-z][a-z0-9-]{0,59}$/).optional(), bandId: z.literal('high-polish').optional(), style: z.string().min(1).max(80), shank: z.literal("High polish"), metal: z.enum(METALS), shape: z.enum(SHAPES), diamondId: z.string().min(1).max(100), size: z.string().min(1).max(20), engraving: z.string().max(80), engravingEnabled: z.boolean() }).strict(),
  cartGroupId: z.string().regex(/^[a-zA-Z0-9_-]{8,80}$/).optional(),
  requestId: z.string().uuid().optional(),
  previewDataUrl: z.string().max(720_000).optional(),
}).strict();
export function validateSelection(input: unknown, catalog: Bootstrap) {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) throw new PilotError("INVALID_CONFIGURATION", "Complete the ring selections before continuing.", 422, Object.fromEntries(parsed.error.issues.map(i => [i.path.join("."), i.message])));
  const request = parsed.data as QuoteRequest;
  const selection: Selection = { ...request.selection, engraving: request.selection.engravingEnabled ? request.selection.engraving : "" };
  if (!catalog.canPurchase || catalog.mode !== "connected") throw new PilotError("INSTALLATION_REQUIRED", "Connect the Shopify app before requesting a purchase quote.", 503);
  const issues = compatibilityErrors(catalog, selection);
  if (issues.length) throw new PilotError(issues[0], issues[0] === 'INCOMPATIBLE_DIAMOND' ? 'Choose a diamond matching the selected shape and setting rules.' : 'This combination is not supported by the selected setting. Review your selections.', 422);
  const family = settingFor(catalog, selection)!;
  catalog = settingCatalog(catalog, selection);
  if (catalog.rules && (!catalog.rules.metals.includes(selection.metal as typeof METALS[number]) || !catalog.rules.shapes.includes(selection.shape as typeof SHAPES[number]))) throw new PilotError("OPTION_DISABLED", "This option is no longer offered. Choose from the current collection.");
  const setting = catalog.setting.variants.find(v => v.metal === selection.metal && v.size === selection.size);
  if (!setting || !setting.available) throw new PilotError("SETTING_UNAVAILABLE", "This setting, metal and size combination is unavailable.");
  const diamond = catalog.diamonds.find(d => d.id === selection.diamondId || d.sourceVariantId === selection.diamondId);
  if (!diamond || diamond.shape !== selection.shape) throw new PilotError("INCOMPATIBLE_DIAMOND", "Choose a pilot diamond matching the selected shape.");
  if (!diamond.available) throw new PilotError("DIAMOND_UNAVAILABLE", "This diamond is no longer available. Please choose another stone.");
  selection.diamondId = diamond.id;
  if (selection.engravingEnabled) {
    if (!selection.engraving.trim() || Array.from(selection.engraving).length > catalog.engraving.maxLength || /[\u0000-\u001f\u007f]/.test(selection.engraving)) throw new PilotError("INVALID_ENGRAVING", `Enter between 1 and ${catalog.engraving.maxLength} characters without line breaks.`, 422, { engraving: "Check engraving text." });
    if (!catalog.engraving.available) throw new PilotError("ENGRAVING_UNAVAILABLE", "The engraving service is unavailable.");
  }
  const currency = catalog.currency;
  if ([setting.price.currency, diamond.price.currency, catalog.engraving.price.currency].some(c => c !== currency)) throw new PilotError("CURRENCY_MISMATCH", "The selected components use inconsistent currencies.", 503);
  const engraving = selection.engravingEnabled ? catalog.engraving.price : { amount: 0, currency };
  return { request, selection, setting, family, diamond, prices: { setting: setting.price, diamond: diamond.price, engraving, total: { amount: setting.price.amount + diamond.price.amount + engraving.amount, currency } } };
}
