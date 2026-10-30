import type { Bootstrap, Metal, PilotDiamond } from "../../shared/contract";
import { METALS } from "../../shared/contract";
import { PilotError } from "./errors.server";
import { ASSET_VERSION, PILOT_VERSION, assertMapping, gid, numericId, readManifest, type PilotManifest } from "./manifest.server";
export type AdminClient = { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> };
type VariantNode = { id: string; title: string; price: string; availableForSale: boolean; sellableOnlineQuantity: number; inventoryQuantity: number | null; inventoryPolicy: string; inventoryItem: { tracked: boolean; inventoryLevel?: { quantities: { name: string; quantity: number }[] } | null }; selectedOptions: { name: string; value: string }[]; product: { id: string; title: string; handle: string; status: string; publishedAt: string | null; onlineStoreUrl: string | null; featuredImage: { url: string } | null } };
export function minorUnits(decimal: string, currency: string): number {
  const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits || 0;
  if (!/^\d+(\.\d+)?$/.test(decimal)) throw new PilotError("INVALID_PRICE", "Shopify returned an invalid price.", 503);
  const [integer, fraction = ""] = decimal.split(".");
  const cents = Number(integer) * 10 ** digits + Number((fraction + "0".repeat(digits)).slice(0, digits));
  if (!Number.isSafeInteger(cents)) throw new PilotError("INVALID_PRICE", "Price exceeds the supported range.", 503);
  return cents;
}
function canPurchase(v: VariantNode) { return v.product.status === "ACTIVE" && Boolean(v.product.publishedAt && new Date(v.product.publishedAt).getTime() <= Date.now()) && v.availableForSale && (!v.inventoryItem.tracked || v.inventoryPolicy === "CONTINUE" || v.sellableOnlineQuantity > 0); }
function variantOptions(v: VariantNode): { metal?: Metal; size?: string } {
  const rawMetal = v.selectedOptions.find(o => /metal|material/i.test(o.name))?.value;
  const metal = METALS.find(m => m.toLowerCase() === rawMetal?.toLowerCase());
  const size = v.selectedOptions.find(o => /size/i.test(o.name))?.value.replace(/^US\s*/i, "").trim();
  return { metal, size };
}
export async function loadCatalog(admin: AdminClient, shop: string): Promise<Bootstrap> {
  const manifest = await readManifest(); assertMapping(manifest, shop);
  let fulfillmentLocation = process.env.PILOT_FULFILLMENT_LOCATION_ID || manifest.fulfillmentLocationId;
  if (!fulfillmentLocation) {
    const location = await (await admin.graphql(`query PilotPrimaryLocation { location { id } }`)).json();
    fulfillmentLocation = location.data?.location?.id;
  }
  if (!fulfillmentLocation) throw new PilotError("FULFILLMENT_LOCATION_REQUIRED", "Map the pilot's online fulfillment location before checking diamond stock.", 503);
  const response = await admin.graphql(`query PilotCatalog($setting: ID!, $components: [ID!]!, $fulfillmentLocation: ID!) {
    shop { currencyCode plan { partnerDevelopment } }
    setting: product(id: $setting) { id title handle status publishedAt onlineStoreUrl featuredImage { url } variants(first: 100) { nodes { ...Variant } pageInfo { hasNextPage } } }
    components: nodes(ids: $components) { ... on ProductVariant { ...Variant } }
  }
  fragment Variant on ProductVariant { id title price availableForSale sellableOnlineQuantity inventoryQuantity inventoryPolicy inventoryItem { tracked inventoryLevel(locationId: $fulfillmentLocation) { quantities(names: ["available"]) { name quantity } } } selectedOptions { name value } product { id title handle status publishedAt onlineStoreUrl featuredImage { url } } }`, { variables: { setting: gid("Product", manifest.settingProductId), components: [manifest.engravingVariantId, ...manifest.diamonds.map(d => d.variantId)].filter(Boolean).map(id => gid("ProductVariant", id)), fulfillmentLocation: gid("Location", fulfillmentLocation) } });
  const body = await response.json();
  if (!response.ok || body.errors || !body.data?.setting) throw new PilotError("SHOPIFY_CATALOG", "Shopify could not provide the mapped pilot catalog. Check access scopes and product IDs.", 503);
  const data = body.data as { shop: { currencyCode: string; plan: { partnerDevelopment: boolean } }; setting: { title: string; handle: string; featuredImage?: { url: string }; variants: { nodes: VariantNode[]; pageInfo: { hasNextPage: boolean } } }; components: (VariantNode | null)[] };
  if (data.setting.variants.pageInfo.hasNextPage) throw new PilotError("SETTING_VARIANTS", "The pilot setting has more than 100 variants; narrow the product mapping.", 503);
  const currency = data.shop.currencyCode;
  const variants = data.setting.variants.nodes.flatMap(v => { const o = variantOptions(v); return o.metal && o.size ? [{ id: numericId(v.id), metal: o.metal, size: o.size, price: { amount: minorUnits(v.price, currency), currency }, available: canPurchase(v) }] : []; });
  if (!variants.length) throw new PilotError("SETTING_OPTIONS", "The mapped setting must have recognized Metal and Size options.", 503);
  const engravingNode = data.components.find(v => v && numericId(v.id) === numericId(manifest.engravingVariantId));
  const diamonds = manifest.diamonds.map(d => {
    const v = data.components.find(v => v && numericId(v.id) === numericId(d.variantId));
    if (!v) throw new PilotError("DIAMOND_MAPPING", `A mapped ${d.shape} ${d.origin} diamond could not be found.`, 503);
    return { ...d, id: numericId(v.id), handle: v.product.handle, title: v.product.title, price: { amount: minorUnits(v.price, currency), currency }, available: canPurchase(v) && v.inventoryItem.tracked && v.inventoryPolicy === "DENY" && v.sellableOnlineQuantity === 1 && v.inventoryItem.inventoryLevel?.quantities.find(q => q.name === "available")?.quantity === 1, imageUrl: v.product.featuredImage?.url || "" } satisfies PilotDiamond;
  });
  const purchaseEnabled = process.env.ENABLE_PURCHASES === "true" && process.env.PILOT_ALLOWED_SHOP === shop && data.shop.plan.partnerDevelopment;
  return { mode: "connected", canPurchase: purchaseEnabled, shop, currency, pilotVersion: PILOT_VERSION, assetVersion: ASSET_VERSION, assetBaseUrl: process.env.ASSET_BASE_URL || `${process.env.SHOPIFY_APP_URL || "http://localhost:3000"}/model-assets`, notices: [...(!engravingNode ? ["Engraving is unavailable: map the development-store engraving service before quoting it. No live engraving fee is available."] : []), ...(purchaseEnabled ? [] : ["Purchasing is disabled. Enable the explicitly allowed Shopify development store after reviewing diagnostics."]), "Representative 3D preview. Physical gemstone fitting is unverified.", "Selecting a diamond does not reserve it.", "Pilot pricing uses the development store's base currency."], setting: { handle: data.setting.handle, title: data.setting.title, style: "Hidden halo", shank: "High polish", imageUrl: data.setting.featuredImage?.url || "", variants }, engraving: { variantId: engravingNode ? numericId(engravingNode.id) : "", price: { amount: engravingNode ? minorUnits(engravingNode.price, currency) : 0, currency }, available: engravingNode ? canPurchase(engravingNode) : false, maxLength: 20 }, diamonds };
}
export function filterDiamonds(diamonds: PilotDiamond[], params: URLSearchParams) {
  const shape = params.get("shape"); const origin = params.get("origin");
  const min = Number(params.get("minCarat") || 0); const max = Number(params.get("maxCarat") || Infinity);
  if (!Number.isFinite(min) || min < 0 || (max !== Infinity && !Number.isFinite(max)) || max < min) throw new PilotError("INVALID_FILTER", "Enter a valid carat range.", 400);
  return diamonds.filter(d => (!shape || d.shape === shape) && (!origin || d.origin === origin) && d.carat >= min && d.carat <= max);
}
