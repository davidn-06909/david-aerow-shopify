/** Exact approved development setup; no Lumen/diamond copies are created. Dry
 * run by default. Applying also requires explicit runtime approval. */
import { readFile, writeFile } from "node:fs/promises";
import { unauthenticated } from "../app/shopify.server";
import prisma from "../app/db.server";
import { gid, numericId, readManifest } from "../app/services/manifest.server";
const apply = process.argv.includes("--apply");
if (apply && process.env.PILOT_COMMERCE_SETUP_APPROVED !== "true") throw new Error("Applying requires explicit user approval and PILOT_COMMERCE_SETUP_APPROVED=true.");
const manifest = await readManifest();
const capture = JSON.parse(await readFile("config/reference-catalog.json", "utf8"));
const shop = process.env.PILOT_ALLOWED_SHOP;
if (shop !== manifest.shop || shop === manifest.sourceShop || !shop) throw new Error("Setup can only target the explicitly allowed development store, never the reference shop.");
const sourceIds = new Set(["55882563911753", "55882563944521", "55882564042825", "55882564108361"]);
if (manifest.diamonds.length !== 4 || manifest.diamonds.some(d => !sourceIds.has(d.sourceVariantId))) throw new Error("Only the four approved pilot diamond mappings may be configured.");
const { admin } = await unauthenticated.admin(shop);
const query = async (document: string, variables?: Record<string, unknown>) => {
  let response: Response; try { response = await admin.graphql(document, { variables }); } catch (error) { throw new Error(error instanceof Error ? error.message : "Shopify request failed"); }
  const body = await response.json() as { data: Record<string, any>; errors?: { message: string }[] };
  if (body.errors) throw new Error(body.errors.map(e => e.message).join("; "));
  for (const value of Object.values(body.data || {})) { const errors = (value as { userErrors?: { message: string }[] } | null)?.userErrors; if (errors?.length) throw new Error(errors.map(e => e.message).join("; ")); }
  return body.data;
};
try {
  const data = await query(`query PilotSetup($ids: [ID!]!) {
    shop { myshopifyDomain currencyCode plan { partnerDevelopment } }
    currentAppInstallation { accessScopes { handle } }
    nodes(ids: $ids) { ... on ProductVariant { id inventoryPolicy inventoryQuantity product { id handle } inventoryItem { id tracked inventoryLevels(first: 20) { nodes { location { id } quantities(names: ["available"]) { name quantity } } } } } }
    engraving: products(first: 2, query: "handle:aevow-pilot-engraving") { nodes { id handle tags variants(first: 2) { nodes { id price } } } }
  }`, { ids: manifest.diamonds.map(d => gid("ProductVariant", d.variantId)) });
  if (!data.shop.plan.partnerDevelopment || data.shop.myshopifyDomain !== shop || data.shop.currencyCode !== "USD") throw new Error("Expected the explicitly allowed USD Shopify partner development store.");
  if (data.nodes.some((v: unknown) => !v)) throw new Error("A mapped diamond variant could not be found.");
  for (const d of manifest.diamonds) {
    const v = data.nodes.find((v: { id: string }) => numericId(v.id) === numericId(d.variantId));
    const source = capture.diamonds.find((s: { diamondId: string }) => s.diamondId === d.sourceVariantId);
    if (v.product.handle !== source.diamondHandle) throw new Error("Mapped variant handle does not match the approved pilot diamond.");
  }
  const baseline = data.nodes.map((v: any) => ({ variantId: v.id, inventoryItemId: v.inventoryItem.id, handle: v.product.handle, tracked: v.inventoryItem.tracked, inventoryPolicy: v.inventoryPolicy, inventoryQuantity: v.inventoryQuantity, levels: v.inventoryItem.inventoryLevels.nodes }));
  const report = { shop, capturedAt: new Date().toISOString(), applyRequested: apply, approvedDiamondCount: 4, before: baseline, proposed: { trackInventory: true, initialQuantityForPreviouslyUntracked: 1, inventoryPolicy: "DENY", engraving: { handle: "aevow-pilot-engraving", price: "45.00", currency: "USD" } }, operations: [] as { variantId?: string; action: string; outcome: string }[] };
  await writeFile(".cache/commerce-setup.review.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ shop, applyRequested: apply, diamonds: baseline.map((v: any) => ({ variantId: numericId(v.variantId), handle: v.handle, tracked: v.tracked, policy: v.inventoryPolicy, quantity: v.inventoryQuantity })), engravingExists: data.engraving.nodes.length > 0 }));
  if (!apply) { console.log("Dry run only. Exact setup recorded in .cache/commerce-setup.review.json. No Shopify data changed."); }
  else {
    const scopes = new Set(data.currentAppInstallation.accessScopes.map((s: { handle: string }) => s.handle));
    const required = ["write_products", "write_inventory", "write_publications", "read_locations"];
    if (required.some(s => !scopes.has(s))) throw new Error(`Temporary approved setup scopes are not granted: ${required.filter(s => !scopes.has(s)).join(", ")}. No setup mutations were executed.`);
    const locationId = process.env.PILOT_SETUP_LOCATION_ID || process.env.PILOT_FULFILLMENT_LOCATION_ID || manifest.fulfillmentLocationId;
    const locations = await query(`query SetupLocations($id: ID) { location(id: $id) { id isActive fulfillsOnlineOrders } publications(first: 50) { nodes { id name } } }`, { id: locationId ? `gid://shopify/Location/${numericId(locationId)}` : null });
    const location = locations.location;
    const publication = locations.publications.nodes.find((p: { name: string }) => p.name === "Online Store");
    if (!location?.isActive || !location.fulfillsOnlineOrders || !publication) throw new Error("An active online location and Online Store publication are required before setup.");
    for (const v of data.nodes) {
      if (v.inventoryPolicy !== "DENY") await query(`mutation DenyPilotOversell($productId: ID!, $variants: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { message } } }`, { productId: v.product.id, variants: [{ id: v.id, inventoryPolicy: "DENY" }] });
      const level = v.inventoryItem.inventoryLevels.nodes.find((l: { location: { id: string } }) => l.location.id === location.id);
      const current = level?.quantities.find((q: { name: string }) => q.name === "available")?.quantity || 0;
      if (v.inventoryItem.tracked) {
        report.operations.push({ variantId: v.id, action: "inventory", outcome: `Preserved existing tracked quantity ${current}; reruns never restock a sold stone.` });
        continue;
      }
      await query(`mutation TrackPilotStone($id: ID!, $input: InventoryItemInput!) { inventoryItemUpdate(id: $id, input: $input) { userErrors { message } } }`, { id: v.inventoryItem.id, input: { tracked: true } });
      const key = `aevow-ring-pilot-initial-stock-${numericId(v.id)}`;
      if (!level) await query(`mutation ActivatePilotStone($item: ID!, $location: ID!, $key: String!) { inventoryActivate(inventoryItemId: $item, locationId: $location, available: 1) @idempotent(key: $key) { userErrors { message } } }`, { item: v.inventoryItem.id, location: location.id, key });
      else await query(`mutation StockPilotStone($input: InventorySetQuantitiesInput!, $key: String!) { inventorySetQuantities(input: $input) @idempotent(key: $key) { userErrors { message } } }`, { key, input: { name: "available", reason: "correction", referenceDocumentUri: "aevow://ring-pilot/approved-development-setup", quantities: [{ inventoryItemId: v.inventoryItem.id, locationId: location.id, quantity: 1, changeFromQuantity: current }] } });
      report.operations.push({ variantId: v.id, action: "inventory", outcome: `Enabled tracking and set initial available quantity ${current} -> 1 using Shopify idempotency and compare-and-swap.` });
      await writeFile(".cache/commerce-setup.applied.json", JSON.stringify(report, null, 2));
    }
    const existing = data.engraving.nodes.find((p: { handle: string }) => p.handle === "aevow-pilot-engraving");
    if (existing && !existing.tags.includes("aevow-ring-pilot-v1")) throw new Error("The engraving handle belongs to another product; it was preserved.");
    const engraving = existing || (await query(`mutation CreatePilotEngraving($input: ProductSetInput!) { productSet(input: $input, synchronous: true) { product { id variants(first: 1) { nodes { id price } } } userErrors { message } } }`, { input: { title: "Personal engraving", handle: "aevow-pilot-engraving", status: "ACTIVE", tags: ["aevow-ring-pilot-v1"], vendor: "Aevow", descriptionHtml: "<p>Optional personal engraving for the Aevow development ring pilot.</p>", productOptions: [{ name: "Title", position: 1, values: [{ name: "Default Title" }] }], variants: [{ optionValues: [{ optionName: "Title", name: "Default Title" }], price: "45.00", inventoryItem: { tracked: false, requiresShipping: false } }] } })).productSet.product;
    if (!engraving?.variants.nodes[0]) throw new Error("Engraving service creation did not return a variant.");
    await query(`mutation PublishPilotEngraving($id: ID!, $input: [PublicationInput!]!) { publishablePublish(id: $id, input: $input) { userErrors { message } } }`, { id: engraving.id, input: [{ publicationId: publication.id }] });
    manifest.engravingVariantId = engraving.variants.nodes[0].id;
    await writeFile(process.env.PILOT_MANIFEST_PATH || "config/pilot.local.json", JSON.stringify(manifest, null, 2));
    report.operations.push({ action: "engraving", outcome: `${existing ? "Reused" : "Created"} and published ${engraving.id}; variant ${manifest.engravingVariantId}; current price ${engraving.variants.nodes[0].price} USD.` });
    await writeFile(".cache/commerce-setup.applied.json", JSON.stringify(report, null, 2));
    console.log("Exact pilot setup completed. Remove temporary product/inventory/publication/location scopes and renew the read-only app session before continuing.");
  }
} finally { await prisma.$disconnect(); }
