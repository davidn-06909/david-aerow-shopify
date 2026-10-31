import { readFile } from "node:fs/promises";
import { beforeEach, expect, test } from "vitest";
import { manifestSchema } from "../app/services/manifest.server";
import { searchDiamonds } from "../app/services/diamond-search";
import { previewCatalog } from "../app/services/preview.server";
import type { Bootstrap } from "../shared/contract";
import { inspectMappedCatalog } from "../app/services/catalog.server";
let catalog: Bootstrap;
beforeEach(async () => { catalog = await previewCatalog(); catalog.catalogVersion = "release-1"; });
test("a curated catalog supports 200 stones, with deterministic price/carats pagination", () => {
  catalog.diamonds = Array.from({ length: 200 }, (_, i) => ({ ...catalog.diamonds[i % 4], id: String(1000 + i), sourceVariantId: "", price: { currency: "USD", amount: (i % 7) * 100 }, carat: 1 + (i % 3) }));
  const ids: string[] = [];
  for (let page = 1; page <= 17; page++) { const result = searchDiamonds(catalog, new URLSearchParams({ page: String(page), sort: "price-asc" })); expect(result.total).toBe(200); ids.push(...result.diamonds.map(d => d.id)); }
  expect(ids).toHaveLength(200); expect(new Set(ids).size).toBe(200);
  expect(searchDiamonds(catalog, new URLSearchParams("sort=carat-desc")).diamonds[0].carat).toBe(3);
});
test("filters combine metadata, certificate search, currency-aware prices and shape", () => {
  const stone = catalog.diamonds[0];
  const params = new URLSearchParams({ shape: stone.shape, origin: stone.origin, color: stone.color.toLowerCase(), clarity: stone.clarity, q: stone.certificateNumber, minCarat: String(stone.carat), maxCarat: String(stone.carat), minPrice: String(stone.price.amount / 100), maxPrice: String(stone.price.amount / 100) });
  expect(searchDiamonds(catalog, params).diamonds.map(d => d.id)).toContain(stone.id);
  params.set("q", "never-a-real-certificate"); expect(searchDiamonds(catalog, params).total).toBe(0);
});
test("invalid filters and release changes fail explicitly rather than mixing results", () => {
  for (const query of ["minCarat=2&maxCarat=1", "minPrice=-1", "page=0", "page=1.5", "pageSize=10000", "maxPrice=Infinity", "sort=unknown", "version=old"]) expect(() => searchDiamonds(catalog, new URLSearchParams(query))).toThrow();
});
async function manifest() {
  const m = JSON.parse(await readFile("config/pilot.example.json", "utf8"));
  return { ...m, settingProductId: "9000", engravingVariantId: "9001", diamonds: m.diamonds.map((d: object, i: number) => ({ ...d, variantId: String(9100 + i) })) };
}
test("legacy four-stone setup receives defaults and no longer imposes a four-stone limit", async () => {
  const m = manifestSchema.parse(await manifest());
  expect(m.rules.engravingMaxLength).toBe(20); expect(m.diamonds.every(d => d.enabled)).toBe(true);
  m.diamonds.pop(); expect(manifestSchema.parse(m).diamonds).toHaveLength(3);
});
test("existing Shopify GID mappings normalize before alias checks and merchant editing", async () => {
  const m = await manifest();
  m.settingProductId = `gid://shopify/Product/${m.settingProductId}`;
  m.engravingVariantId = `gid://shopify/ProductVariant/${m.engravingVariantId}`;
  expect(manifestSchema.parse(m).settingProductId).toBe("9000");
});
test("duplicate aliases and engraving overlap cannot authorize ambiguous components", async () => {
  const m = manifestSchema.parse(await manifest());
  m.diamonds[1].sourceVariantId = m.diamonds[0].variantId; expect(() => manifestSchema.parse(m)).toThrow();
  m.diamonds[1].sourceVariantId = "9001"; expect(() => manifestSchema.parse(m)).toThrow();
});
test("incomplete disabled draft entries are allowed but cannot be enabled or bypass supported shapes", async () => {
  const m = manifestSchema.parse(await manifest());
  m.diamonds.push({ ...m.diamonds[0], variantId: "9200", sourceVariantId: "", enabled: false, carat: 0, color: "", cut: "", clarity: "" });
  expect(manifestSchema.parse(m).diamonds).toHaveLength(5);
  m.diamonds[4].enabled = true; expect(() => manifestSchema.parse(m)).toThrow();
  m.diamonds[4].enabled = false; expect(() => manifestSchema.parse({ ...m, rules: { ...m.rules, shapes: ["Pear"] } })).toThrow();
});
test("200 mapped stones load from bounded Shopify batches without exposing invented commerce data", async () => {
  const m = manifestSchema.parse(await manifest()); m.fulfillmentLocationId = "9002"; m.rules.metals = ["Platinum"];
  m.diamonds = Array.from({ length: 200 }, (_, i) => ({ ...m.diamonds[i % 4], variantId: String(10000 + i), sourceVariantId: "" }));
  const requests: number[] = [];
  const variant = (id: string) => ({ id, title: "Fixture stone", price: "100.00", availableForSale: true, sellableOnlineQuantity: 1, inventoryQuantity: 1, inventoryPolicy: "DENY", inventoryItem: { tracked: true, inventoryLevel: { quantities: [{ name: "available", quantity: 1 }] } }, selectedOptions: [{ name: "Metal", value: "Platinum" }, { name: "Ring size", value: "4.5" }], product: { id: "gid://shopify/Product/999", title: "Fixture stone", handle: "fixture", status: "ACTIVE", publishedAt: "2026-01-01", featuredImage: null } });
  const admin = { async graphql(query: string, options?: { variables?: Record<string, unknown> }) {
    const ids = options?.variables?.components as string[]; requests.push(ids.length);
    return Response.json({ data: { shop: { currencyCode: "USD", plan: { partnerDevelopment: true } }, setting: { title: "Fixture Lumen", handle: "fixture-lumen", variants: { nodes: [variant("gid://shopify/ProductVariant/9999")], pageInfo: { hasNextPage: false } } }, components: ids.map(variant) } });
  } };
  const { catalog, report } = await inspectMappedCatalog(admin, m.shop, m);
  expect(report.errors).toEqual([]); expect(catalog.diamonds).toHaveLength(200); expect(requests).toHaveLength(9); expect(Math.max(...requests)).toBeLessThanOrEqual(25);
});

test('setting variant pagination reads every page and rejects a repeated cursor', async () => {
  const m = manifestSchema.parse(await manifest()); m.fulfillmentLocationId = '9002'; m.rules.metals = ['Platinum'];
  const variant = (id: string, size = '4.5') => ({ id, title: 'Pagination fixture', price: '100.00', availableForSale: true, sellableOnlineQuantity: 1, inventoryQuantity: 1, inventoryPolicy: 'DENY', inventoryItem: { tracked: true, inventoryLevel: { quantities: [{ name: 'available', quantity: 1 }] } }, selectedOptions: [{ name: 'Metal', value: 'Platinum' }, { name: 'Ring size', value: size }], product: { id: 'gid://shopify/Product/999', title: 'Fixture', handle: 'fixture', status: 'ACTIVE', publishedAt: '2026-01-01', featuredImage: null } });
  const visited: string[] = []; let repeat = false;
  const admin = { async graphql(query: string, options?: { variables?: Record<string, unknown> }) {
    const after = String(options?.variables?.after || '0'), offset = Number(after); if (offset) visited.push(after);
    const next = Math.min(offset + 50, 151);
    return Response.json({ data: { shop: { currencyCode: 'USD', plan: { partnerDevelopment: true } }, setting: { title: 'Fixture', handle: 'fixture', variants: { nodes: Array.from({ length: next - offset }, (_, i) => variant(`gid://shopify/ProductVariant/${100000 + offset + i}`, String(offset + i))), pageInfo: { hasNextPage: next < 151, endCursor: repeat && offset ? after : String(next) } } }, components: ((options?.variables?.components || []) as string[]).map(id => variant(id)) } });
  } };
  const result = await inspectMappedCatalog(admin, m.shop, m);
  expect(result.catalog.setting.variants).toHaveLength(151); expect(visited).toEqual(['50', '100', '150']);
  repeat = true; await expect(inspectMappedCatalog(admin, m.shop, m)).rejects.toThrow(/invalid or oversized/);
});
