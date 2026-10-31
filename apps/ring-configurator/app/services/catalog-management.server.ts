import { shopifyRead } from './shopify-read.server';
import prisma from "../db.server";
import { activateCatalog, initializeCatalog, parseManifest } from "./catalog-state.server";
import { inspectMappedCatalog, type AdminClient } from "./catalog.server";
import { PilotError } from "./errors.server";
import { settingMappings } from './manifest.server';
import { verifyAssets } from './assets.server';
import { extendCheckoutGuard } from './checkout-guard.server';
export async function validateDraft(admin: AdminClient, shop: string, revision: number) {
  const state = await initializeCatalog(shop);
  if (state.revision !== revision) throw new PilotError("DRAFT_CONFLICT", "The draft changed. Reload before validating or publishing.", 409);
  const manifest = parseManifest(state.draft, shop);
  const inspected = await inspectMappedCatalog(admin, shop, manifest);
  return { ...inspected, manifest };
}
export async function publishCatalog(admin: AdminClient, shop: string, revision: number, actor: string, restoredFrom?: string) {
  let manifest;
  if (restoredFrom) {
    const release = await prisma.catalogRelease.findFirst({ where: { id: restoredFrom, shop } });
    if (!release) throw new PilotError("VERSION_NOT_FOUND", "This catalog version could not be found.", 404);
    manifest = parseManifest(release.manifest, shop);
  } else {
    const state = await initializeCatalog(shop);
    if (state.revision !== revision) throw new PilotError("DRAFT_CONFLICT", "The draft changed. Reload before publishing.", 409);
    manifest = parseManifest(state.draft, shop);
  }
  // Recheck immediately before activation; never trust a browser's old validation result.
  const { report } = await inspectMappedCatalog(admin, shop, manifest);
  for (const s of settingMappings(manifest).filter(s => s.enabled)) report.errors.push(...(await verifyAssets(s.assetVersion)).map(e => `${s.title}: ${e}`));
  if (report.errors.length) throw new PilotError("PUBLICATION_BLOCKED", "Resolve catalog validation errors before publishing.", 422, Object.fromEntries(report.errors.map((message, i) => [`validation.${i}`, message])));
  await extendCheckoutGuard(admin, shop, manifest);
  return { version: await activateCatalog(shop, revision, manifest, report, actor, restoredFrom), report };
}
export async function searchShopifyVariants(admin: AdminClient, query: string, after?: string) {
  if (query.length > 100 || (after?.length || 0) > 1000) throw new PilotError("INVALID_SEARCH", "Shorten the product search.", 400);
  const id = query.match(/^(?:gid:\/\/shopify\/ProductVariant\/)?(\d+)$/)?.[1];
  const response = await shopifyRead(admin, `query MerchantVariantSearch($query: String!, $after: String) { productVariants(first: 12, after: $after, query: $query) { nodes { id title sku price product { id title handle status } } pageInfo { hasNextPage endCursor } } }`, { variables: { query: id ? `id:${id}` : query.trim(), after: after || null } });
  const result = await response.json();
  if (!response.ok || result.errors || !result.data?.productVariants) throw new PilotError("SHOPIFY_SEARCH", "Shopify product search is unavailable. Please retry.", 503);
  return result.data.productVariants as { nodes: { id: string; title: string; sku: string; price: string; product: { id: string; title: string; handle: string; status: string } }[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
}
