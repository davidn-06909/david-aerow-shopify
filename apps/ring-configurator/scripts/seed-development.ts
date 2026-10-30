/** One-time, rerunnable fixture copies. Never writes to the reference shop or
 * resets inventory of an existing pilot product. Requires a real installed app. */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { unauthenticated } from "../app/shopify.server";
import prisma from "../app/db.server";
const shop = process.env.PILOT_ALLOWED_SHOP;
if (!shop || !/^[a-z0-9-]+\.myshopify\.com$/.test(shop) || shop === "aevow.myshopify.com") throw new Error("Set PILOT_ALLOWED_SHOP to the development store. The reference store can never be seeded.");
const { admin } = await unauthenticated.admin(shop);
const query = async (document: string, variables?: Record<string, unknown>) => {
  let response: Response; try { response = await admin.graphql(document, { variables }); } catch (error) { throw new Error(error instanceof Error ? error.message : "Shopify request failed"); } const body = await response.json() as { data: Record<string, any>; errors?: { message: string }[] };
  if (body.errors) throw new Error(`Shopify operation failed: ${body.errors.map((e: { message: string }) => e.message).join("; ")}`);
  for (const value of Object.values(body.data || {})) { const errors = (value as { userErrors?: { message: string }[] } | null)?.userErrors; if (errors?.length) throw new Error(errors.map(e => e.message).join("; ")); }
  return body.data;
};
const context = await query(`query SeedContext { shop { myshopifyDomain currencyCode plan { partnerDevelopment } } currentAppInstallation { accessScopes { handle } } location { id isActive fulfillsOnlineOrders } publications(first: 50) { nodes { id name } } }`);
if (context.shop.myshopifyDomain !== shop || !context.shop.plan.partnerDevelopment) throw new Error("Seeding is restricted to the explicitly allowed Shopify partner development store.");
const capture = JSON.parse(await readFile("config/reference-catalog.json", "utf8"));
if (context.shop.currencyCode !== capture.currency) throw new Error("Set the development store base currency to USD before copying the captured USD fixtures.");
const scopes = new Set(context.currentAppInstallation.accessScopes.map((s: { handle: string }) => s.handle));
const required = ["write_products", "write_inventory", "write_publications", "read_locations"];
if (required.some(s => !scopes.has(s))) throw new Error(`Fixture setup requires temporary scopes: ${required.join(", ")}. Reauthorize the development app, run this script, then reduce scopes.`);
const location = context.location;
const publication = context.publications.nodes.find((p: { name: string }) => p.name === "Online Store");
if (!location?.isActive || !location.fulfillsOnlineOrders || !publication) throw new Error("An active online fulfillment location and Online Store publication are required.");
const tag = "aevow-ring-pilot-v1";
const fields = `id handle tags variants(first: 100) { nodes { id selectedOptions { name value } inventoryItem { id } } }`;
const imageFile = (url: string) => ({ originalSource: url.startsWith("//") ? `https:${url}` : url, contentType: "IMAGE" });
const variant = (price: number, quantity: number, optionValues: { optionName: string; name: string }[], sourceId?: string) => ({ price: (price / 100).toFixed(2), optionValues, inventoryPolicy: "DENY", inventoryItem: { tracked: true, requiresShipping: true }, inventoryQuantities: [{ locationId: location.id, name: "available", quantity }], ...(sourceId ? { metafields: [{ namespace: "aevow_pilot", key: "source_variant_id", type: "single_line_text_field", value: sourceId }] } : {}) });
async function copy(handle: string, input: Record<string, unknown>) {
  const existing = (await query(`query ExistingPilot($query: String!) { products(first: 2, query: $query) { nodes { ${fields} } } }`, { query: `handle:${handle}` })).products.nodes.find((p: { handle: string }) => p.handle === handle);
  let product = existing;
  if (existing && !existing.tags.includes(tag)) throw new Error(`Handle ${handle} belongs to an existing unrelated product; no changes were made to it.`);
  if (!product) product = (await query(`mutation CopyPilot($input: ProductSetInput!) { productSet(input: $input, synchronous: true) { product { ${fields} } userErrors { message } } }`, { input: { ...input, handle, status: "ACTIVE", tags: [tag], vendor: "Aevow visual pilot", descriptionHtml: "<p>Development-store pilot copy. Representative visual proportions; physical fitting and copied certification metadata are unverified.</p>" } })).productSet.product;
  if (!product || product.handle !== handle) throw new Error(`Could not create the expected pilot product ${handle}.`);
  await query(`mutation PublishPilot($id: ID!, $input: [PublicationInput!]!) { publishablePublish(id: $id, input: $input) { userErrors { message } } }`, { id: product.id, input: [{ publicationId: publication.id }] });
  console.log(`${existing ? "Reused" : "Created"} development pilot product ${handle}; inventory on reused products was preserved.`);
  return product as { id: string; variants: { nodes: { id: string; selectedOptions: { name: string; value: string }[] }[] } };
}
try {
  const metals = [...new Set(capture.setting.variants.map((v: { options: string[] }) => v.options[0]))]; const sizes = [...new Set(capture.setting.variants.map((v: { options: string[] }) => v.options[1]))];
  const setting = await copy("aevow-pilot-the-lumen", { title: "The Lumen", files: [imageFile(capture.setting.image)], productOptions: [{ name: "Metal", position: 1, values: metals.map(name => ({ name })) }, { name: "Ring size", position: 2, values: sizes.map(name => ({ name })) }], variants: capture.setting.variants.map((v: { id: number; price: number; options: string[] }) => variant(v.price, 100, [{ optionName: "Metal", name: v.options[0] }, { optionName: "Ring size", name: v.options[1] }], String(v.id))) });
  const mapping = JSON.parse(await readFile("config/pilot.example.json", "utf8")); mapping.shop = shop; mapping.settingProductId = setting.id; mapping.sourceSettingHandle = capture.setting.handle;
  const sourceVariants = capture.setting.variants.map((v: { id: number; options: string[] }) => { const target = setting.variants.nodes.find(target => target.selectedOptions.find(o => o.name === "Metal")?.value === v.options[0] && target.selectedOptions.find(o => o.name === "Ring size")?.value === v.options[1]); if (!target) throw new Error("The copied setting is missing a required metal/size variant."); return { sourceId: String(v.id), targetId: target.id, metal: v.options[0], size: v.options[1] }; });
  for (const d of capture.diamonds) {
    const product = await copy(`aevow-pilot-${d.diamondHandle}`, { title: d.diamondTitle, files: [imageFile(d.diamondImage)], productOptions: [{ name: "Title", position: 1, values: [{ name: "Default Title" }] }], variants: [variant(Number(d.diamondPrice), 1, [{ optionName: "Title", name: "Default Title" }], d.diamondId)] });
    const target = mapping.diamonds.find((m: { sourceVariantId: string }) => m.sourceVariantId === d.diamondId); target.variantId = product.variants.nodes[0].id;
  }
  const engraving = await copy("aevow-pilot-engraving", { title: "Personal engraving", productOptions: [{ name: "Title", position: 1, values: [{ name: "Default Title" }] }], variants: [variant(capture.engravingPrice, 1000, [{ optionName: "Title", name: "Default Title" }], capture.engravingVariant)] });
  mapping.engravingVariantId = engraving.variants.nodes[0].id;
  const target = resolve(process.env.PILOT_MANIFEST_PATH || "config/pilot.local.json");
  await writeFile(target, JSON.stringify(mapping, null, 2) + "\n");
  await writeFile("config/pilot.mapping.json", JSON.stringify({ shop, sourceShop: capture.shop, sourceCapturedAt: capture.capturedAt, settingProductId: setting.id, settingVariants: sourceVariants, diamonds: mapping.diamonds, engraving: { sourceVariantId: capture.engravingVariant, targetVariantId: mapping.engravingVariantId }, certificationStatus: "copied test metadata — independently unverified" }, null, 2) + "\n");
  console.log("Development fixture mapping saved. Review diagnostics and catalog before enabling purchase quotes. No existing stock was reset.");
} finally { await prisma.$disconnect(); }
