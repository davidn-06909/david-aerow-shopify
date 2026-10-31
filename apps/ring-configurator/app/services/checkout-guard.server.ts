import prisma from '../db.server';
import type { PilotManifest } from './manifest.server';
import { numericId, settingMappings } from './manifest.server';
import type { AdminClient } from './catalog.server';
import { checkoutPublicKey } from './checkout-ticket.server';
import { PilotError } from './errors.server';
import { shopifyRead } from './shopify-read.server';

export const GUARD_KIND = 'checkout_guard';
export const GUARD_HANDLE = 'ring-checkout-validation';
const KEY = 'aevow_checkout_config';
const NAMESPACE = '$app';

export interface GuardConfig {
  version: 1;
  keys: { id: string; public_key: string }[];
  products: string[];
  variants: string[];
}

function gid(kind: 'Product' | 'ProductVariant', id: string) { return `gid://shopify/${kind}/${numericId(id)}`; }
function sorted(values: Iterable<string>) { return [...new Set(values)].sort(); }

export async function buildGuardConfig(shop: string, manifest?: PilotManifest, previous?: GuardConfig): Promise<GuardConfig> {
  const rows = await prisma.managedComponent.findMany({ where: { shop }, select: { kind: true, referenceId: true } });
  const products = rows.filter(r => r.kind === 'product').map(r => gid('Product', r.referenceId));
  const variants = rows.filter(r => r.kind === 'variant').map(r => gid('ProductVariant', r.referenceId));
  if (manifest) {
    products.push(...settingMappings(manifest).map(s => gid('Product', s.productId)));
    variants.push(gid('ProductVariant', manifest.engravingVariantId), ...manifest.diamonds.map(d => gid('ProductVariant', d.variantId)));
  }
  const current = checkoutPublicKey();
  const keys = [...(previous?.keys || []).filter(k => k.id !== current.id), current];
  if (keys.length > 3) throw new PilotError('GUARD_KEYS', 'Retire an old checkout key before publishing.', 409);
  return { version: 1, keys, products: sorted([...products, ...(previous?.products || [])]), variants: sorted([...variants, ...(previous?.variants || [])]) };
}

interface ValidationRecord { id: string; enabled: boolean; blockOnFailure: boolean; metafield: { id: string; value: string; namespace: string } | null }
async function readValidation(admin: AdminClient, id: string): Promise<ValidationRecord> {
  const response = await shopifyRead(admin, 'query AevowValidation($id: ID!) { validation(id: $id) { id enabled blockOnFailure metafield(key: "aevow_checkout_config") { id value namespace } } }', { variables: { id } });
  const body = await response.json();
  if (!response.ok || body.errors || !body.data?.validation) throw new PilotError('GUARD_MISSING', 'The installed checkout guard cannot be verified.', 503);
  return body.data.validation as ValidationRecord;
}

function parseConfig(value: string): GuardConfig {
  let config: GuardConfig;
  try { config = JSON.parse(value); } catch { throw new PilotError('GUARD_CONFIG', 'Checkout guard configuration is invalid.', 503); }
  if (config.version !== 1 || !Array.isArray(config.keys) || !Array.isArray(config.products) || !Array.isArray(config.variants)) throw new PilotError('GUARD_CONFIG', 'Checkout guard configuration is invalid.', 503);
  return config;
}

export async function checkoutGuardStatus(admin: AdminClient, shop: string) {
  const row = await prisma.jobCheckpoint.findUnique({ where: { shop_kind: { shop, kind: GUARD_KIND } } });
  const id = (row?.checkpoint as { id?: string } | null)?.id;
  if (!id) return { installed: false, enabled: false, id: null };
  const validation = await readValidation(admin, id);
  return { installed: true, enabled: validation.enabled, id, blockOnFailure: validation.blockOnFailure,
    products: parseConfig(validation.metafield?.value || '').products.length,
    variants: parseConfig(validation.metafield?.value || '').variants.length };
}

/** Expand the protected registry before making a catalog release active. */
export async function extendCheckoutGuard(admin: AdminClient, shop: string, manifest: PilotManifest) {
  const row = await prisma.jobCheckpoint.findUnique({ where: { shop_kind: { shop, kind: GUARD_KIND } } });
  const id = (row?.checkpoint as { id?: string } | null)?.id;
  if (!id) return;
  const validation = await readValidation(admin, id);
  if (!validation.enabled || !validation.blockOnFailure || !validation.metafield?.id) throw new PilotError('GUARD_DISABLED', 'Enable and verify the checkout guard before publishing.', 409);
  const current = parseConfig(validation.metafield.value);
  const next = await buildGuardConfig(shop, manifest, current);
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  const response = await admin.graphql('mutation UpdateAevowValidation($id: ID!, $validation: ValidationUpdateInput!) { validationUpdate(id: $id, validation: $validation) { validation { id enabled metafield(key: "aevow_checkout_config") { value } } userErrors { field message } } }', { variables: {
    id, validation: { metafields: [{ id: validation.metafield.id, key: KEY, namespace: NAMESPACE, type: 'json', value: JSON.stringify(next) }] },
  } });
  const body = await response.json();
  const result = body.data?.validationUpdate;
  if (!response.ok || body.errors || result?.userErrors?.length || result?.validation?.id !== id || !result.validation.enabled || result.validation.metafield?.value !== JSON.stringify(next))
    throw new PilotError('GUARD_UPDATE_FAILED', 'The checkout guard could not be expanded. Catalog publication was stopped.', 503);
}

/** Only an explicit development-store setup script calls this. */
export async function installCheckoutGuard(admin: AdminClient, shop: string) {
  if (shop !== process.env.PILOT_ALLOWED_SHOP || !/^[a-z0-9-]+\.myshopify\.com$/.test(shop)) throw new PilotError('SHOP_MISMATCH', 'Checkout guard setup requires the allowed development store.', 403);
  const existing = await prisma.jobCheckpoint.findUnique({ where: { shop_kind: { shop, kind: GUARD_KIND } } });
  if (existing) throw new PilotError('GUARD_EXISTS', 'The checkout guard already has an installation record.', 409);
  const config = await buildGuardConfig(shop);
  const response = await admin.graphql('mutation CreateAevowValidation($validation: ValidationCreateInput!) { validationCreate(validation: $validation) { validation { id enabled blockOnFailure metafield(key: "aevow_checkout_config") { id value namespace } } userErrors { field message } } }', { variables: { validation: {
    title: 'Aevow configured ring integrity', functionHandle: GUARD_HANDLE, enable: true, blockOnFailure: true,
    metafields: [{ key: KEY, namespace: NAMESPACE, type: 'json', value: JSON.stringify(config) }],
  } } });
  const body = await response.json();
  const result = body.data?.validationCreate;
  if (!response.ok || body.errors || result?.userErrors?.length || !result?.validation?.id || !result.validation.enabled || !result.validation.blockOnFailure || result.validation.metafield?.value !== JSON.stringify(config))
    throw new PilotError('GUARD_INSTALL_FAILED', 'Shopify did not confirm an enabled checkout guard.', 503);
  await prisma.jobCheckpoint.create({ data: { shop, kind: GUARD_KIND, checkpoint: { id: result.validation.id, keyId: config.keys.at(-1)?.id, installedAt: new Date().toISOString() } } });
  return { id: result.validation.id, products: config.products.length, variants: config.variants.length };
}
