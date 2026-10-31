/** Real disposable PostgreSQL integration. Shopify responses are explicit test doubles. */
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ActionFunctionArgs } from "react-router";
import { preparePostgresRuntime } from "../scripts/postgres-runtime";
const directory = resolve(".cache", `postgres-${randomUUID()}`);
await mkdir(directory, { recursive: true });
const port = 15432 + Math.floor(Math.random() * 1000);
const password = randomBytes(24).toString("hex");
const externalUrl = process.env.TEST_DATABASE_URL;
const externalSchema = `integration_${randomBytes(8).toString('hex')}`;
let pg: any;
if (!externalUrl) {
  await preparePostgresRuntime();
  const dependency = 'embedded-postgres';
  const { default: EmbeddedPostgres } = await import(dependency);
  pg = new EmbeddedPostgres({ databaseDir: resolve(directory, 'data'), port, user: 'postgres', password, persistent: true, initdbFlags: ['--encoding=UTF8', '--locale=C'], postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: () => {} });
}
// pg_ctl creates the restricted Windows token required when the parent shell
// has administrator rights. Direct postgres.exe deliberately refuses that token.
const binaryPackage = "@embedded-postgres/windows-x64";
const pgCtl: string | undefined = !externalUrl && process.platform === "win32" ? (await import(binaryPackage)).pg_ctl : undefined;
let started = false;
process.env.DATABASE_URL = `postgresql://postgres:${password}@127.0.0.1:${port}/postgres?schema=public`;
if (externalUrl) {
  const url = new URL(externalUrl);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('TEST_DATABASE_MUST_BE_LOCAL');
  url.searchParams.set('schema', externalSchema); process.env.DATABASE_URL = url.href;
}
process.env.SHOPIFY_API_KEY = "integration-test-key";
process.env.SHOPIFY_API_SECRET = randomBytes(32).toString("hex");
process.env.SHOPIFY_APP_URL = "https://ring-integration.example.test";
process.env.CONFIGURATION_SIGNING_SECRET = randomBytes(32).toString("hex");
process.env.PILOT_ALLOWED_SHOP = "ring-integration.myshopify.com";
process.env.ENABLE_PURCHASES = "true";
// Prisma can load a local .env during initialization; never let a developer's
// real auth-mode flag turn this isolated webhook test into a network grant.
process.env.CLIENT_CREDENTIALS_AUTH = "false";
process.env.PREVIEW_STORAGE = "database";
const manifestPath = resolve(directory, "pilot.json");
process.env.PILOT_MANIFEST_PATH = manifestPath;
const capture = JSON.parse(await readFile("config/reference-catalog.json", "utf8"));
const example = JSON.parse(await readFile("config/pilot.example.json", "utf8"));
const targetShop = process.env.PILOT_ALLOWED_SHOP;
const manifest = { ...example, shop: targetShop, settingProductId: "900000", fulfillmentLocationId: "900100", engravingVariantId: "900001", diamonds: example.diamonds.map((d: Record<string, unknown>, i: number) => ({ ...d, variantId: String(900010 + i) })) };
await writeFile(manifestPath, JSON.stringify(manifest));
let prisma: (typeof import("../app/db.server"))["default"] | undefined;
let passed = 0;
const check = (label: string) => { passed++; console.log(`PASS ${label}`); };
try {
  if (pg) {
    await pg.initialise();
    if (pgCtl) execFileSync(pgCtl, ["-D", resolve(directory, "data"), "-l", resolve(directory, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port}`, "start", "-w"], { stdio: "ignore" });
    else await pg.start();
    started = true;
  }
  execFileSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], { env: process.env, stdio: "pipe" });
  prisma = (await import("../app/db.server")).default;
  assert.equal(await prisma.quote.count(), 0); check("committed migration creates a real PostgreSQL schema");
  const { loadCatalog } = await import("../app/services/catalog.server");
  let isDevelopment = true; let atLocationStock = 1;
  const makeVariant = (id: string, title: string, price: string, selectedOptions: { name: string; value: string }[] = [], productId = "900000") => ({ id: `gid://shopify/ProductVariant/${id}`, title, price, availableForSale: true, sellableOnlineQuantity: 1, inventoryQuantity: 1, inventoryPolicy: "DENY", inventoryItem: { tracked: true, inventoryLevel: { quantities: [{ name: "available", quantity: atLocationStock }] } }, selectedOptions, product: { id: `gid://shopify/Product/${productId}`, title, handle: title.toLowerCase().replaceAll(" ", "-"), status: "ACTIVE", publishedAt: "2026-01-01T00:00:00Z", onlineStoreUrl: `https://${targetShop}/products/test`, featuredImage: null } });
  const admin = { async graphql() { return Response.json({ data: { shop: { currencyCode: "USD", plan: { partnerDevelopment: isDevelopment } }, setting: { title: "Test Lumen", handle: "test-lumen", variants: { nodes: capture.setting.variants.map((v: { id: number; options: string[]; price: number }, i: number) => makeVariant(String(910000 + i), "Test Lumen", (v.price / 100).toFixed(2), [{ name: "Metal", value: v.options[0] }, { name: "Ring size", value: v.options[1] }])), pageInfo: { hasNextPage: false } } }, components: [makeVariant("900001", "Test engraving", "45.00", [], "900002"), ...manifest.diamonds.map((d: Record<string, unknown>) => { const source = capture.diamonds.find((s: Record<string, string>) => s.diamondId === d.sourceVariantId); return makeVariant(String(d.variantId), "Test diamond", (Number(source.diamondPrice) / 100).toFixed(2), [], String(Number(d.variantId) + 100)); })] } }); } };
  const catalog = await loadCatalog(admin, targetShop);
  assert.equal(catalog.canPurchase, true); assert.equal(catalog.mode, "connected"); check("connected catalog reads prices and mappings from Shopify test double, never preview snapshot");
  atLocationStock = 0; assert.ok((await loadCatalog(admin, targetShop)).diamonds.every(d => !d.available)); atLocationStock = 1;
  check("stock in another location cannot authorize a pilot diamond at the configured fulfillment location");
  isDevelopment = false; assert.equal((await loadCatalog(admin, targetShop)).canPurchase, false); isDevelopment = true;
  process.env.PILOT_ALLOWED_SHOP = "different.myshopify.com"; assert.equal((await loadCatalog(admin, targetShop)).canPurchase, false); process.env.PILOT_ALLOWED_SHOP = targetShop;
  check("purchase guard rejects merchant stores and non-allowlisted shops");
  const { createQuote, getDesign, saveDesign } = await import("../app/services/designs.server");
  const previewDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+kB8kAAAAASUVORK5CYII=";
  const request = { requestId: randomUUID(), previewDataUrl, selection: { style: "Hidden halo", shank: "High polish", metal: "Platinum", shape: "Round", diamondId: "55882563911753", size: "4.5", engraving: "3ertyui", engravingEnabled: true } };
  const quote = await createQuote(request, catalog);
  assert.equal(quote.prices.total.amount, 559500); assert.notEqual(quote.selection.diamondId, request.selection.diamondId);
  const design = await getDesign(targetShop, quote.designId); assert.equal(design.selection.engraving, "3ertyui"); assert.equal(design.fittingStatus, "visual-unverified");
  check("quote and immutable manufacturing snapshot persist atomically with canonical target IDs");
  const storedPreview = await prisma.design.findUniqueOrThrow({ where: { id: quote.designId }, select: { previewData: true, previewMime: true } });
  assert.equal(storedPreview.previewMime, "image/png"); assert.equal(Buffer.from(storedPreview.previewData!).toString("base64"), previewDataUrl.split(",")[1]);
  const { loader: previewLoader } = await import("../app/routes/previews.$id");
  const previewResponse = await previewLoader({ request: new Request(quote.previewUrl!), params: { id: quote.designId }, context: {} } as unknown as import("react-router").LoaderFunctionArgs);
  assert.equal(previewResponse.status, 200); assert.equal(previewResponse.headers.get("Content-Type"), "image/png"); assert.equal(Buffer.from(await previewResponse.arrayBuffer()).toString("base64"), previewDataUrl.split(",")[1]);
  check("database preview bytes persist with the design and the public resource returns the exact bounded image");
  const originalHost = process.env.SHOPIFY_APP_URL;
  process.env.SHOPIFY_APP_URL = "https://migrated-ring.example.test/";
  assert.equal((await getDesign(targetShop, quote.designId)).previewUrl, `https://migrated-ring.example.test/previews/${quote.designId}`);
  assert.equal((await prisma.design.findUniqueOrThrow({ where: { id: quote.designId } })).previewUrl, quote.previewUrl);
  process.env.SHOPIFY_APP_URL = originalHost;
  check("moving hosts restores the database preview without changing the original immutable record");
  assert.equal((await createQuote(request, catalog)).id, quote.id); assert.equal(await prisma.quote.count(), 1); assert.equal(await prisma.design.count(), 1);
  const concurrent = { ...request, requestId: randomUUID() };
  const duplicates = await Promise.all([createQuote(concurrent, catalog), createQuote(concurrent, catalog)]);
  assert.equal(duplicates[0].id, duplicates[1].id); assert.equal(await prisma.quote.count(), 2); check("sequential and concurrent retry IDs return one saved quote/design");
  await assert.rejects(createQuote({ ...request, selection: { ...request.selection, metal: "14K white gold" } }, catalog), /different configuration/);
  assert.equal((await saveDesign(targetShop, { quoteId: quote.id, reference: quote.reference })).id, quote.designId);
  await assert.rejects(getDesign("another.myshopify.com", quote.designId), /could not be found/); check("conflicting retries and cross-shop design reads are rejected");
  const { action } = await import("../app/routes/webhooks.orders.create");
  const { processOrderReceipt, synchronizeOrder } = await import('../app/services/orders.server');
  const orderResponses = new Map<string, any>();
  const orderAdmin = { async graphql(_query: string, options?: { variables?: Record<string, unknown> }) {
    const id = String(options?.variables?.id || '').split('/').pop()!;
    const o = orderResponses.get(id);
    return Response.json({ data: { order: o ? {
      id: `gid://shopify/Order/${id}`, name: `#${id}`,
      updatedAt: o.updated_at || '2026-10-31T12:00:00.000Z',
      displayFinancialStatus: (o.financial_status || 'pending').toUpperCase(),
      cancelledAt: o.cancelled_at || null, test: true, currencyCode: 'USD',
      currentTotalPriceSet: { shopMoney: { amount: '5595.00', currencyCode: 'USD' } },
      totalRefundedSet: { shopMoney: { amount: o.refunded || '0.00', currencyCode: 'USD' } },
      lineItems: { nodes: o.line_items.map((l: any) => ({
        variant: { id: `gid://shopify/ProductVariant/${l.variant_id}` },
        product: l.product_id ? { id: `gid://shopify/Product/${l.product_id}` } : null,
        quantity: l.quantity, currentQuantity: l.current_quantity ?? l.quantity,
        customAttributes: (l.properties || []).map((p: any) => ({ key: p.name, value: p.value })),
        originalUnitPriceSet: { shopMoney: { amount: '1.00' } },
        priceAfterAllDiscountsBeforeTaxesSet: { shopMoney: { amount: '1.00' } },
      })), pageInfo: { hasNextPage: false } },
    } : null } });
  } };
  const webhook = async (order: unknown, eventId = randomUUID(), valid = true) => {
    const body = JSON.stringify(order);
    const signature = valid ? createHmac("sha256", process.env.SHOPIFY_API_SECRET!).update(body).digest("base64") : "invalid-signature";
    const response = await action({ request: new Request("https://ring-integration.example.test/webhooks/orders/create", { method: "POST", headers: { "content-type": "application/json", "x-shopify-topic": "orders/create", "x-shopify-shop-domain": targetShop, "x-shopify-webhook-id": eventId, "x-shopify-hmac-sha256": signature, "x-shopify-api-version": "2026-10" }, body }), params: {}, context: {} } as ActionFunctionArgs);
    if (valid && response.ok) {
      const o = order as { id: string }; orderResponses.set(String(o.id), o);
      await processOrderReceipt(`${targetShop}:ORDERS_CREATE:${eventId}`, orderAdmin);
    }
    return response;
  };
  const order = { id: "800001", financial_status: "paid", line_items: quote.items.map(i => ({ variant_id: i.id, quantity: 1, properties: Object.entries(i.properties).map(([name, value]) => ({ name, value })) })) };
  const eventId = randomUUID();
  assert.equal((await webhook(order, eventId)).status, 200); assert.equal((await webhook(order, eventId)).status, 200);
  assert.equal(await prisma.orderDesign.count(), 1); assert.equal((await prisma.orderDesign.findFirstOrThrow()).status, "verified_paid"); check("actual SDK webhook HMAC and duplicate receipts produce one verified order association");
  const before = await prisma.webhookReceipt.count();
  try { const invalid = await webhook(order, randomUUID(), false); assert.equal(invalid.status, 401); } catch (error) { assert.ok(error instanceof Response && error.status === 401); }
  assert.equal(await prisma.webhookReceipt.count(), before); check("invalid raw-body webhook signature performs no receipt writes");
  const missing = { ...order, id: "800002", line_items: [{ variant_id: manifest.diamonds[0].variantId, quantity: 1, properties: [] }] };
  assert.equal((await webhook(missing)).status, 200); assert.equal(await prisma.webhookReceipt.count({ where: { status: "review_required" } }), 1); check("pilot diamond with removed configuration markers is retained for review");
  const changed = { ...order, id: "800003", line_items: order.line_items.map((l, i) => i === 0 ? { ...l, quantity: 2 } : l) };
  assert.equal((await webhook(changed)).status, 200); assert.equal((await prisma.orderDesign.findFirstOrThrow({ where: { orderId: changed.id } })).status, "review_required"); check("manipulated quantities are held for review");
  const { activeManifest, initializeCatalog, saveCatalogDraft } = await import("../app/services/catalog-state.server");
  const { publishCatalog, validateDraft } = await import("../app/services/catalog-management.server");
  const initializations = await Promise.all([initializeCatalog(targetShop), initializeCatalog(targetShop)]);
  assert.equal(initializations[0].activeVersion, initializations[1].activeVersion); assert.equal(await prisma.catalogRelease.count(), 1);
  check("concurrent initialization creates one tenant catalog without changing prior designs");
  const initial = initializations[0];
  const draft = (await activeManifest(targetShop)).manifest;
  draft.diamonds[0].enabled = false;
  await saveCatalogDraft(targetShop, initial.revision, draft);
  assert.ok((await loadCatalog(admin, targetShop)).diamonds.some(d => d.id === manifest.diamonds[0].variantId));
  check("saving a draft leaves the published storefront unchanged");
  const competing = await Promise.allSettled([saveCatalogDraft(targetShop, 2, draft), saveCatalogDraft(targetShop, 2, draft)]);
  assert.equal(competing.filter(r => r.status === "fulfilled").length, 1); assert.equal((await prisma.catalogState.findUniqueOrThrow({ where: { shop: targetShop } })).revision, 3);
  check("compare-and-swap rejects concurrent draft overwrite");
  await assert.rejects(validateDraft(admin, targetShop, 2), /changed/);
  const published = await publishCatalog(admin, targetShop, 3, "test-merchant");
  const activeCatalog = await loadCatalog(admin, targetShop);
  assert.equal(activeCatalog.catalogVersion, published.version); assert.ok(!activeCatalog.diamonds.some(d => d.id === manifest.diamonds[0].variantId));
  assert.equal((await getDesign(targetShop, quote.designId)).selection.diamondId, quote.selection.diamondId);
  check("publication changes eligible selections while historical saved records remain intact");
  const liveDraft = (await activeManifest(targetShop)).manifest;
  liveDraft.diamonds[1].variantId = "999999";
  await saveCatalogDraft(targetShop, 4, liveDraft);
  await assert.rejects(publishCatalog(admin, targetShop, 5, "test-merchant"), /validation errors/);
  assert.equal((await activeManifest(targetShop)).version, published.version);
  check("fresh Shopify mapping validation blocks invalid publication without changing the active version");
  await assert.rejects(publishCatalog(admin, targetShop, 5, "test-merchant", "another-shop-release"), /could not be found/);
  const restored = await publishCatalog(admin, targetShop, 5, "test-merchant", initial.activeVersion);
  const restoredCatalog = await loadCatalog(admin, targetShop);
  assert.notEqual(restored.version, initial.activeVersion); assert.equal(restoredCatalog.diamonds.length, 4);
  assert.equal((await prisma.catalogRelease.findUniqueOrThrow({ where: { id: restored.version } })).restoredFrom, initial.activeVersion);
  check("rollback creates an audited release, revalidates current Shopify data, and restores eligible options");
  await assert.rejects(createQuote(request, restoredCatalog), /collection changed/);
  const nextRequest = { ...request, requestId: randomUUID() };
  const nextQuote = await createQuote(nextRequest, restoredCatalog);
  assert.equal(nextQuote.catalogVersion, restored.version); assert.ok(nextQuote.items.every(i => i.properties._aevow_catalog_version === restored.version));
  assert.equal((await getDesign(targetShop, nextQuote.designId)).diamond?.id, nextQuote.selection.diamondId);
  check("new immutable designs and all order components retain the published catalog version and diamond facts");
  const changedPriceCatalog = { ...restoredCatalog, diamonds: restoredCatalog.diamonds.map(d => d.id === nextQuote.selection.diamondId ? { ...d, price: { ...d.price, amount: d.price.amount + 100 } } : d) };
  await assert.rejects(createQuote(nextRequest, changedPriceCatalog), /prices changed/);
  const countBeforeConflict = await prisma.design.count();
  await assert.rejects(createQuote({ ...request, requestId: randomUUID() }, { ...restoredCatalog, catalogVersion: randomUUID() }), /changed while checking/);
  assert.equal(await prisma.design.count(), countBeforeConflict);
  check("price changes and stale active-version snapshots cannot reuse or persist an outdated purchase quote");
  await assert.rejects(saveCatalogDraft("another.myshopify.com", 6, { ...liveDraft, shop: "another.myshopify.com" }), /Another tab|changed this draft/);
  assert.equal(await prisma.catalogRelease.count({ where: { shop: "another.myshopify.com" } }), 0);
  check("merchant draft operations cannot modify another tenant's catalog");
  const { catalogAdminAction: adminAction } = await import("../app/services/catalog-actions.server");
  const revisionBefore = (await prisma.catalogState.findUniqueOrThrow({ where: { shop: targetShop } })).revision;
  let authenticationChallenge = false;
  try { await adminAction({ request: new Request("https://ring-integration.example.test/app/catalog", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "intent=save&revision=6" }), params: {}, context: {} } as ActionFunctionArgs); }
  catch (e) { assert.ok(e instanceof Response); authenticationChallenge = e.status >= 300 || (await e.text()).includes("app-bridge"); }
  assert.ok(authenticationChallenge);
  assert.equal((await prisma.catalogState.findUniqueOrThrow({ where: { shop: targetShop } })).revision, revisionBefore);
  check("unauthenticated admin submissions cannot change merchant drafts");
  const { settingMappings } = await import('../app/services/manifest.server');
  const familyAdmin = { async graphql(query: string, options?: { variables?: Record<string, unknown> }) {
    const result = await admin.graphql(); const body = await result.json();
    if (String(options?.variables?.setting).endsWith('/900500')) {
      body.data.setting.title = 'Fixture Solitaire'; body.data.setting.handle = 'fixture-solitaire';
      body.data.setting.variants.nodes = body.data.setting.variants.nodes.map((v: { id: string; price: string; product: object }) => ({ ...v, id: v.id.replace('/91', '/93'), price: (Number(v.price) - 1000).toFixed(2), product: { ...v.product, id: 'gid://shopify/Product/900500' } }));
    }
    return Response.json(body);
  } };
  const oldState = await prisma.catalogState.findUniqueOrThrow({ where: { shop: targetShop } });
  const twoFamily = (await activeManifest(targetShop)).manifest;
  const lumenMapping = { ...settingMappings(twoFamily)[0], assetVersion: 'lumen-visual-v3' };
  twoFamily.schemaVersion = 2;
  twoFamily.settings = [lumenMapping, { ...lumenMapping, rules: { ...lumenMapping.rules }, id: 'solitaire', style: 'Solitaire', family: 'solitaire', title: 'Fixture Solitaire', productId: '900500', assetVersion: 'solitaire-visual-v1' }];
  await saveCatalogDraft(targetShop, oldState.revision, twoFamily);
  const familyRelease = await publishCatalog(familyAdmin, targetShop, oldState.revision + 1, 'test-merchant');
  const familyCatalog = await loadCatalog(familyAdmin, targetShop);
  assert.equal(familyCatalog.settings?.length, 2);
  const familyRequest = { ...request, requestId: randomUUID(), selection: { ...request.selection, settingId: 'solitaire', bandId: 'high-polish', style: 'Solitaire' } };
  const familyQuote = await createQuote(familyRequest, familyCatalog);
  assert.equal(familyQuote.prices.total.amount, 459500);
  assert.ok(familyQuote.items[0].id.startsWith('93'));
  assert.ok(familyQuote.items.every(i => i.properties._aevow_setting_id === 'solitaire' && i.properties._aevow_asset_version === 'solitaire-visual-v1' && i.properties._aevow_rule_version === 'multi-setting-v1'));
  check('two-family publication resolves separate Shopify variants, prices and immutable model/rule references');
  const familyDesign = await getDesign(targetShop, familyQuote.designId);
  assert.equal(familyDesign.settingTitle, 'Fixture Solitaire'); assert.equal(familyDesign.assetVersion, 'solitaire-visual-v1');
  const familyOrder = { id: '800004', financial_status: 'paid', line_items: familyQuote.items.map((item, i) => ({ id: i + 1, variant_id: item.id, quantity: item.quantity, properties: Object.entries(item.properties).map(([name, value]) => ({ name, value })) })) };
  assert.equal((await webhook(familyOrder)).status, 200);
  assert.equal((await prisma.orderDesign.findFirstOrThrow({ where: { designId: familyQuote.designId } })).status, 'verified_paid');
  check('signed webhook retains and verifies family, band and rule-version properties');
  const beforeTampering = await prisma.design.count();
  await assert.rejects(createQuote({ ...familyRequest, requestId: randomUUID(), selection: { ...familyRequest.selection, style: 'Hidden halo' } }, familyCatalog), /not supported/);
  assert.equal(await prisma.design.count(), beforeTampering);
  check('contradictory family selections cannot create a design or charge another setting price');
  const familyState = await prisma.catalogState.findUniqueOrThrow({ where: { shop: targetShop } });
  const missingAsset = structuredClone(twoFamily); missingAsset.settings![1].assetVersion = 'not-deployed';
  await saveCatalogDraft(targetShop, familyState.revision, missingAsset);
  await assert.rejects(publishCatalog(familyAdmin, targetShop, familyState.revision + 1, 'test-merchant'), /validation errors/);
  assert.equal((await activeManifest(targetShop)).version, familyRelease.version);
  check('unavailable model releases cannot replace the published setting catalog');
  const snapshotBefore = JSON.stringify((await prisma.design.findUniqueOrThrow({ where: { id: familyQuote.designId } })).snapshot);
  await publishCatalog(familyAdmin, targetShop, familyState.revision + 1, 'test-merchant', restored.version);
  assert.equal((await loadCatalog(familyAdmin, targetShop)).settings?.length, 1);
  assert.equal(JSON.stringify((await prisma.design.findUniqueOrThrow({ where: { id: familyQuote.designId } })).snapshot), snapshotBefore);
  assert.equal((await getDesign(targetShop, familyQuote.designId)).selection.settingId, 'solitaire');
  check('rollback to a legacy release preserves the newer Solitaire snapshot and historical model reference');
  const { readOrder } = await import('../app/services/order-read.server');
  const deliverOnly = async (payload: object, topic = 'orders/updated', eventId = randomUUID()) => {
    const body = JSON.stringify(payload), signature = createHmac('sha256', process.env.SHOPIFY_API_SECRET!).update(body).digest('base64');
    const response = await action({ request: new Request('https://ring-integration.example.test/webhooks/orders/lifecycle', { method: 'POST', headers: { 'content-type': 'application/json', 'x-shopify-topic': topic, 'x-shopify-shop-domain': targetShop, 'x-shopify-webhook-id': eventId, 'x-shopify-hmac-sha256': signature, 'x-shopify-api-version': '2026-10' }, body }), params: {}, context: {} } as ActionFunctionArgs);
    return { response, receiptId: `${targetShop}:${topic.replaceAll('/', '_').toUpperCase()}:${eventId}` };
  };
  const lifecycleOrder = { ...familyOrder, id: '800010', financial_status: 'pending', updated_at: '2026-10-31T12:01:00.000Z', email: 'never-retain@example.test' };
  orderResponses.set(lifecycleOrder.id, lifecycleOrder);
  const delivered = await deliverOnly(lifecycleOrder, 'orders/create');
  assert.equal(delivered.response.status, 200);
  assert.deepEqual((await prisma.webhookReceipt.findUniqueOrThrow({ where: { id: delivered.receiptId } })).payload, { id: lifecycleOrder.id });
  assert.equal(await prisma.configuredOrder.count({ where: { orderId: lifecycleOrder.id } }), 0);
  check('verified webhook acknowledges only after persisting a minimal durable pointer, before processing');
  const concurrentProcessing = await Promise.all([processOrderReceipt(delivered.receiptId, orderAdmin), processOrderReceipt(delivered.receiptId, orderAdmin)]);
  assert.equal(concurrentProcessing.filter(r => r.claimed).length, 1);
  assert.equal((await prisma.webhookReceipt.findUniqueOrThrow({ where: { id: delivered.receiptId } })).attempts, 1);
  let projection = await prisma.configuredOrder.findUniqueOrThrow({ where: { shop_orderId: { shop: targetShop, orderId: lifecycleOrder.id } } });
  assert.equal(projection.paymentState, 'PENDING'); assert.equal(projection.verification, 'verified');
  check('concurrent workers claim one receipt and keep pending payment separate from component verification');
  const paid = { ...lifecycleOrder, financial_status: 'paid', updated_at: '2026-10-31T12:02:00.000Z' };
  orderResponses.set(paid.id, paid);
  const latePending = await deliverOnly(lifecycleOrder);
  await processOrderReceipt(latePending.receiptId, orderAdmin);
  projection = await prisma.configuredOrder.findUniqueOrThrow({ where: { id: projection.id } });
  assert.equal(projection.paymentState, 'PAID'); assert.equal(projection.version, 2);
  const beforeDuplicate = await prisma.orderAuditRun.count({ where: { configuredOrderId: projection.id } });
  const duplicateState = await deliverOnly(paid, 'orders/paid'); await processOrderReceipt(duplicateState.receiptId, orderAdmin);
  assert.equal(await prisma.orderAuditRun.count({ where: { configuredOrderId: projection.id } }), beforeDuplicate);
  check('late events read current Shopify state and equivalent deliveries do not duplicate audit history');
  const oldFacts = { ...await readOrder(orderAdmin, paid.id), paymentState: 'PENDING', updatedAt: lifecycleOrder.updated_at };
  assert.equal((await synchronizeOrder(targetShop, oldFacts, 'test:old-read')).stale, true);
  assert.equal((await prisma.configuredOrder.findUniqueOrThrow({ where: { id: projection.id } })).paymentState, 'PAID');
  check('an older in-flight Shopify read cannot regress a newer projection');
  await assert.rejects(synchronizeOrder(targetShop, await readOrder(orderAdmin, paid.id), 'test:concurrent-read', 1), /changed during synchronization/);
  assert.equal((await prisma.configuredOrder.findUniqueOrThrow({ where: { id: projection.id } })).version, 2);
  check('optimistic order versions reject concurrent reads even when Shopify timestamps have equal precision');
  const { recordReview, orderAction } = await import('../app/services/order-management.server');
  const latestAudit = await prisma.orderAuditRun.findFirstOrThrow({ where: { configuredOrderId: projection.id }, orderBy: { createdAt: 'desc' } });
  const review = { requestId: randomUUID(), auditId: latestAudit.id, version: projection.version, decision: 'acknowledged', reason: 'Checked current component evidence.' };
  const [decision1, decision2] = await Promise.all([recordReview(targetShop, paid.id, '123456', review), recordReview(targetShop, paid.id, '123456', review)]);
  assert.equal(decision1.id, decision2.id);
  await assert.rejects(recordReview(targetShop, paid.id, '123456', { ...review, reason: 'Changed decision payload.' }), /another review/);
  await assert.rejects(recordReview('another.myshopify.com', paid.id, '123456', { ...review, requestId: randomUUID() }), /could not be found/);
  check('merchant decisions are immutable, idempotent and isolated per authenticated shop');
  const refunded = { ...paid, financial_status: 'partially_refunded', refunded: '45.00', updated_at: '2026-10-31T12:03:00.000Z' };
  orderResponses.set(paid.id, refunded);
  const refundDelivery = await deliverOnly({ id: '99001', order_id: paid.id, unrelated_contact: 'private' }, 'refunds/create');
  await processOrderReceipt(refundDelivery.receiptId, orderAdmin);
  assert.equal((await prisma.configuredOrder.findUniqueOrThrow({ where: { id: projection.id } })).paymentState, 'PARTIALLY_REFUNDED');
  assert.equal((await prisma.orderDesign.findFirstOrThrow({ where: { orderId: paid.id } })).status, 'verified_refund_recorded');
  await assert.rejects(recordReview(targetShop, paid.id, '123456', { ...review, requestId: randomUUID() }), /order changed/);
  assert.equal((await prisma.merchantOrderAction.findUniqueOrThrow({ where: { id: decision1.id } })).auditId, latestAudit.id);
  check('refund processing preserves decisions but invalidates a review against changed order evidence');
  orderResponses.set(paid.id, { ...refunded, cancelled_at: '2026-10-31T12:04:00.000Z', updated_at: '2026-10-31T12:04:00.000Z' });
  const cancellation = await deliverOnly({ id: paid.id }, 'orders/cancelled'); await processOrderReceipt(cancellation.receiptId, orderAdmin);
  assert.equal((await prisma.configuredOrder.findUniqueOrThrow({ where: { id: projection.id } })).cancelled, true);
  assert.equal((await prisma.orderDesign.findFirstOrThrow({ where: { orderId: paid.id } })).status, 'verified_cancelled');
  check('cancellation is reflected without inventory writes or changing immutable designs');
  orderResponses.set('800011', { ...paid, id: '800011', line_items: paid.line_items.slice(0, 1), updated_at: '2026-10-31T12:05:00.000Z' });
  const editDelivery = await deliverOnly({ id: '800011' }); await processOrderReceipt(editDelivery.receiptId, orderAdmin);
  assert.equal((await prisma.configuredOrder.findUniqueOrThrow({ where: { shop_orderId: { shop: targetShop, orderId: '800011' } } })).verification, 'review_required');
  check('order edits that remove a required component produce retained discrepancies');
  orderResponses.set('800014', { ...paid, id: '800014', line_items: paid.line_items.map((l, i) => i ? l : { ...l, current_quantity: 0 }) });
  const removedUnit = await deliverOnly({ id: '800014' }); await processOrderReceipt(removedUnit.receiptId, orderAdmin);
  const removedUnitProjection = await prisma.configuredOrder.findUniqueOrThrow({ where: { shop_orderId: { shop: targetShop, orderId: '800014' } } });
  assert.equal(removedUnitProjection.verification, 'review_required');
  check('Shopify retained original quantities cannot hide units removed or refunded after purchase');
  orderResponses.set('800012', { ...paid, id: '800012', line_items: [{ product_id: '900500', variant_id: '930000', quantity: 1, properties: [] }] });
  const removedMapping = await deliverOnly({ id: '800012' }); await processOrderReceipt(removedMapping.receiptId, orderAdmin);
  assert.equal((await prisma.configuredOrder.findUniqueOrThrow({ where: { shop_orderId: { shop: targetShop, orderId: '800012' } } })).verification, 'review_required');
  check('historical component registry identifies stripped properties after setting removal from the published catalog');
  const extra = { ...paid, id: '800013', line_items: paid.line_items.map((l, i) => i ? l : { ...l, properties: [...l.properties, { name: 'customer_email', value: 'never-retain@example.test' }] }) };
  orderResponses.set(extra.id, extra);
  const extraReceipt = await deliverOnly({ id: extra.id }); await processOrderReceipt(extraReceipt.receiptId, orderAdmin);
  const extraProjection = await prisma.configuredOrder.findUniqueOrThrow({ where: { shop_orderId: { shop: targetShop, orderId: extra.id } } });
  assert.equal(extraProjection.verification, 'review_required'); assert.ok(!JSON.stringify(extraProjection.facts).includes('never-retain'));
  check('unexpected personalization properties are detected without retaining unrelated values');
  const retryReceipt = await deliverOnly({ id: '800099' });
  await prisma.webhookReceipt.update({ where: { id: retryReceipt.receiptId }, data: { consecutiveFailures: 7 } });
  await assert.rejects(processOrderReceipt(retryReceipt.receiptId, orderAdmin));
  const dead = await prisma.webhookReceipt.findUniqueOrThrow({ where: { id: retryReceipt.receiptId } });
  assert.equal(dead.status, 'dead_letter'); assert.equal(dead.lastError, 'ORDER_UNAVAILABLE'); assert.ok(dead.nextAttemptAt > new Date());
  assert.equal((await processOrderReceipt(dead.id, orderAdmin)).claimed, false);
  check('bounded failures reach a terminal state and store safe error codes rather than raw exception data');
  const leased = await deliverOnly({ id: paid.id });
  await prisma.webhookReceipt.update({ where: { id: leased.receiptId }, data: { status: 'processing', leaseToken: 'interrupted-worker', leaseUntil: new Date(Date.now() - 1000) } });
  assert.equal((await processOrderReceipt(leased.receiptId, orderAdmin)).claimed, true);
  check('expired receipt leases recover an interrupted worker');
  const { requestLimit } = await import('../app/services/limits.server');
  const limitResults = await Promise.allSettled(Array.from({ length: 20 }, () => requestLimit(targetShop, 'parallel-test', 5)));
  assert.equal(limitResults.filter(r => r.status === 'fulfilled').length, 5);
  assert.ok(limitResults.filter(r => r.status === 'rejected').every(r => (r as PromiseRejectedResult).reason.status === 429));
  check('database request limits remain exact across concurrent instances');
  const actionsBefore = await prisma.merchantOrderAction.count();
  try { await orderAction({ request: new Request('https://ring-integration.example.test/app/orders/800010', { method: 'POST', body: 'intent=review' }), params: { orderId: paid.id }, context: {} } as unknown as ActionFunctionArgs); assert.fail('Authentication required'); } catch (error) { assert.ok(error instanceof Response); }
  assert.equal(await prisma.merchantOrderAction.count(), actionsBefore);
  check('unauthenticated order mutations cannot record merchant decisions');
  const { runOperations } = await import('../app/services/operations.server');
  const reconciliationAdmin = { async graphql(query: string, options?: { variables?: Record<string, unknown> }) {
    if (query.includes('UpdatedConfiguredOrders')) return Response.json({ data: { orders: { nodes: [{ id: 'gid://shopify/Order/800020' }], pageInfo: { hasNextPage: false } } } });
    return orderAdmin.graphql(query, options);
  } };
  orderResponses.set('800020', { ...paid, id: '800020' });
  const tick1 = await runOperations(targetShop, reconciliationAdmin);
  assert.equal(tick1.reconciled, 1);
  assert.equal(await prisma.configuredOrder.count({ where: { orderId: '800020' } }), 0);
  await runOperations(targetShop, reconciliationAdmin);
  assert.equal((await prisma.configuredOrder.findUniqueOrThrow({ where: { shop_orderId: { shop: targetShop, orderId: '800020' } } })).verification, 'verified');
  assert.ok((await prisma.jobCheckpoint.findUniqueOrThrow({ where: { shop_kind: { shop: targetShop, kind: 'reconciliation' } } })).lastSuccessAt);
  check('checkpointed reconciliation queues and recovers a missed Shopify order without its webhook');
  await prisma.jobCheckpoint.update({ where: { shop_kind: { shop: targetShop, kind: 'operations' } }, data: { leaseUntil: new Date(Date.now() + 60000), leaseToken: 'another-active-worker' } });
  assert.equal((await runOperations(targetShop, reconciliationAdmin)).skipped, true);
  await prisma.jobCheckpoint.update({ where: { shop_kind: { shop: targetShop, kind: 'operations' } }, data: { leaseUntil: null, leaseToken: null } });
  check('an active operations lease prevents overlapping scheduled runs');
  const { captureBackup, encryptBackup, decryptBackup, restoreBackup } = await import('../scripts/pilot-backup');
  const backup = await captureBackup(prisma), key = randomBytes(32).toString('hex');
  const encrypted = encryptBackup(backup, key), decoded = decryptBackup(encrypted, key);
  assert.ok(!encrypted.includes(Buffer.from('M3 OVAL'))); assert.ok(!('session' in backup.tables));
  const tampered = Buffer.from(encrypted); tampered[tampered.length - 1] ^= 1;
  assert.throws(() => decryptBackup(tampered, key));
  const restoreSchema = `restore_${randomBytes(8).toString('hex')}`;
  const restoreUrl = new URL(process.env.DATABASE_URL!); restoreUrl.searchParams.set('schema', restoreSchema);
  execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: restoreUrl.href }, stdio: 'pipe' });
  const { PrismaClient } = await import('@prisma/client');
  const restoredClient = new PrismaClient({ datasources: { db: { url: restoreUrl.href } } });
  try {
    const restoreProof = await restoreBackup(restoredClient, decoded);
    assert.equal(restoreProof.verified, true); assert.equal(restoreProof.sessionTokensCopied, 0);
    assert.equal((await restoredClient.design.findUniqueOrThrow({ where: { id: quote.designId } })).previewData?.toString(), (await prisma.design.findUniqueOrThrow({ where: { id: quote.designId } })).previewData?.toString());
    await assert.rejects(restoreBackup(restoredClient, decoded), /NOT_EMPTY/);
    assert.deepEqual((await captureBackup(prisma)).hashes, backup.hashes);
  } finally { if (/^restore_[a-f0-9]{16}$/.test(restoreSchema)) await restoredClient.$executeRawUnsafe(`DROP SCHEMA "${restoreSchema}" CASCADE`); await restoredClient.$disconnect(); }
  check('authenticated encrypted backup restores every table and preview into an empty isolated database schema with matching hashes');
  assert.equal(JSON.stringify((await prisma.design.findUniqueOrThrow({ where: { id: familyQuote.designId } })).snapshot), snapshotBefore);
  check('all lifecycle, recovery and review operations preserve the original immutable ring design');
  console.log(`PostgreSQL integration complete: ${passed} checks passed. No external Shopify order was placed.`);
} finally {
  if (externalUrl && prisma && /^integration_[a-f0-9]{16}$/.test(externalSchema)) await prisma.$executeRawUnsafe(`DROP SCHEMA "${externalSchema}" CASCADE`);
  await prisma?.$disconnect();
  if (started && pgCtl) execFileSync(pgCtl, ["-D", resolve(directory, "data"), "stop", "-m", "fast", "-w"], { stdio: "ignore" });
  else if (started) await pg.stop();
}
