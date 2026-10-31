import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { Bootstrap, CartLineInput, Quote, SavedDesign, Selection } from "../../shared/contract";
import prisma from "../db.server";
import { validateSelection } from "./validation";
import { PilotError } from "./errors.server";
import { savePreview } from "./storage.server";
import { signReference, verifyReference } from "./signing.server";
import { RULE_VERSION } from '../../shared/assets';
import { signCheckoutTicket } from './checkout-ticket.server';
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export async function createQuote(input: unknown, catalog: Bootstrap): Promise<Quote> {
  const validated = validateSelection(input, catalog);
  const { selection, setting, family, diamond, prices, request } = validated;
  const assetVersion = family.assetVersion || catalog.assetVersion;
  const requestId = (request as typeof request & { requestId?: string }).requestId;
  const requestHash = createHash("sha256").update(JSON.stringify({ selection, cartGroupId: request.cartGroupId || "" })).digest("hex");
  const existingQuote = async () => {
    if (!requestId) return null;
    const prior = await prisma.quote.findUnique({ where: { shop_requestId: { shop: catalog.shop, requestId } } });
    if (!prior) return null;
    if (prior.requestHash !== requestHash) throw new PilotError("REQUEST_CONFLICT", "This request ID was already used for a different configuration.", 409);
    if (prior.expiresAt <= new Date()) throw new PilotError("QUOTE_EXPIRED", "Refresh the quote using a new request ID.", 409);
    if ((prior.snapshot as unknown as Quote).catalogVersion !== catalog.catalogVersion) throw new PilotError("CATALOG_CHANGED", "The collection changed since this quote. Refresh the studio and try again.", 409);
    const previousPrices = (prior.snapshot as unknown as Quote).prices;
    if ((["setting", "diamond", "engraving", "total"] as const).some(role => previousPrices[role].amount !== prices[role].amount || previousPrices[role].currency !== prices[role].currency)) throw new PilotError("QUOTE_EXPIRED", "Shopify prices changed. Request a fresh quote before purchasing.", 409);
    return prior.snapshot as unknown as Quote;
  };
  const existing = await existingQuote();
  if (existing) return existing;
  const id = randomUUID(); const designId = randomUUID(); const configurationId = request.cartGroupId || randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60_000);
  const reference = signReference({ q: id, d: designId, g: configurationId, s: catalog.shop, e: expiresAt.getTime() });
  const checkoutTicket = signCheckoutTicket({ group: configurationId, design: designId, reference,
    settingVariant: setting.id, diamondVariant: diamond.id,
    engravingVariant: selection.engravingEnabled ? catalog.engraving.variantId : undefined,
    engraving: selection.engravingEnabled ? selection.engraving : undefined });
  const preview = await savePreview(catalog.shop, designId, request.previewDataUrl);
  const previewUrl = preview.url;
  const common = { _configuration_id: configurationId, _aevow_design_id: designId, _aevow_reference: reference, _aevow_checkout: checkoutTicket, _aevow_asset_version: assetVersion, _aevow_setting_id: family.id || 'lumen', _aevow_band_id: 'high-polish', _aevow_rule_version: RULE_VERSION, ...(catalog.catalogVersion ? { _aevow_catalog_version: catalog.catalogVersion } : {}), Setting: family.title, Band: selection.shank, Metal: selection.metal, Shape: selection.shape, "Ring size": selection.size, "3D fitting": "Representative — physical fitting unverified" };
  const items: CartLineInput[] = [
    { id: setting.id, quantity: 1, properties: { ...common, _aevow_role: "setting", ...(selection.engravingEnabled ? { Engraving: selection.engraving } : {}) } },
    { id: diamond.id, quantity: 1, properties: { ...common, _aevow_role: "diamond", Diamond: diamond.title, ...(diamond.certificateNumber ? { Certificate: `${diamond.certificateLab} ${diamond.certificateNumber}` } : {}) } },
  ];
  if (selection.engravingEnabled) items.push({ id: catalog.engraving.variantId, quantity: 1, properties: { ...common, _aevow_role: "engraving", Engraving: selection.engraving } });
  if (previewUrl) for (const item of items) item.properties._aevow_preview = previewUrl;
  const shareUrl = `https://${catalog.shop}/pages/design-your-ring?design=${designId}&step=review`;
  const quote: Quote = { id, designId, configurationId, reference, expiresAt: expiresAt.toISOString(), selection, items, prices, previewUrl, shareUrl, catalogVersion: catalog.catalogVersion };
  const snapshot = { schemaVersion: 2, selection, settingTitle: family.title, ruleVersion: RULE_VERSION, items, prices, diamond, catalogVersion: catalog.catalogVersion, pilotVersion: catalog.pilotVersion, assetVersion, fittingStatus: "visual-unverified", previewUrl, source: { shop: catalog.shop, quotedAt: new Date().toISOString() } };
  try { await prisma.$transaction(async tx => {
    if (preview.data) {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`${catalog.shop}:preview-budget`}))`;
      const usage = await tx.$queryRaw<{ bytes: bigint }[]>`SELECT COALESCE(SUM(octet_length("previewData")), 0)::bigint AS bytes FROM "Design" WHERE shop = ${catalog.shop}`;
      if (Number(usage[0]?.bytes || 0) + preview.data.byteLength > 350 * 1048576) throw new PilotError('PREVIEW_CAPACITY', 'Saved preview storage has reached the pilot allowance. Please contact the store before retrying.', 503);
    }
    if (catalog.catalogVersion && catalog.catalogVersion !== "legacy-pilot") {
      const active = await tx.$queryRaw<{ activeVersion: string }[]>`SELECT "activeVersion" FROM "CatalogState" WHERE "shop" = ${catalog.shop} FOR SHARE`;
      if (active[0]?.activeVersion !== catalog.catalogVersion) throw new PilotError("CATALOG_CHANGED", "The collection changed while checking your ring. Reload the studio and try again.", 409);
    }
    await tx.quote.create({ data: { id, shop: catalog.shop, snapshot: json(quote), signature: reference, expiresAt, requestId, requestHash } });
    await tx.design.create({ data: { id: designId, shop: catalog.shop, quoteId: id, snapshot: json(snapshot), previewUrl, previewData: preview.data, previewMime: preview.mime } });
  }); } catch (error) {
    if ((error as { code?: string }).code === "P2002") { const duplicate = await existingQuote(); if (duplicate) return duplicate; }
    throw error;
  }
  return quote;
}
export async function getDesign(shop: string, id: string): Promise<SavedDesign> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new PilotError("DESIGN_NOT_FOUND", "This saved design could not be found.", 404);
  const row = await prisma.design.findFirst({ where: { id, shop }, select: { id: true, snapshot: true, previewUrl: true, createdAt: true } });
  if (!row) throw new PilotError("DESIGN_NOT_FOUND", "This saved design could not be found.", 404);
  const data = row.snapshot as unknown as { selection: Selection; pilotVersion: string; assetVersion: string; settingTitle?: string; ruleVersion?: string; prices?: Quote["prices"]; catalogVersion?: string; diamond?: SavedDesign["diamond"]; items?: CartLineInput[] };
  // Database previews are addressed by immutable design ID. Restore them through
  // the current host after moving the same database from a development tunnel;
  // the original quote, cart properties and stored snapshot remain untouched.
  const previewUrl = row.previewUrl?.endsWith(`/previews/${row.id}`) && process.env.SHOPIFY_APP_URL
    ? `${process.env.SHOPIFY_APP_URL.replace(/\/$/, "")}/previews/${row.id}`
    : row.previewUrl || undefined;
  return { id: row.id, selection: data.selection, settingTitle: data.settingTitle || data.items?.[0]?.properties.Setting, ruleVersion: data.ruleVersion, previewUrl, createdAt: row.createdAt.toISOString(), pilotVersion: data.pilotVersion, assetVersion: data.assetVersion, fittingStatus: "visual-unverified", priceContext: data.prices, catalogVersion: data.catalogVersion, diamond: data.diamond, diamondTitle: data.diamond?.title || data.items?.find(i => i.properties._aevow_role === "diamond")?.properties.Diamond };
}
export async function saveDesign(shop: string, input: unknown): Promise<SavedDesign> {
  if (!input || typeof input !== "object") throw new PilotError("INVALID_DESIGN", "Provide a current quote reference.");
  const { quoteId, reference } = input as Record<string, unknown>;
  if (typeof quoteId !== "string" || typeof reference !== "string") throw new PilotError("INVALID_DESIGN", "Provide a current quote reference.");
  const claims = verifyReference(reference, shop);
  if (!claims || claims.q !== quoteId) throw new PilotError("QUOTE_EXPIRED", "This quote has expired. Refresh prices and try again.");
  const quote = await prisma.quote.findFirst({ where: { id: quoteId, shop, signature: reference, expiresAt: { gt: new Date() } } });
  if (!quote) throw new PilotError("QUOTE_EXPIRED", "This quote is no longer valid.");
  return getDesign(shop, claims.d);
}
