import '@shopify/shopify-app-react-router/adapters/node';
import { writeFile } from 'node:fs/promises';
import { requestClientCredentialsSession } from '../app/services/client-credentials.server';
import { inspectMappedCatalog, type AdminClient } from '../app/services/catalog.server';
import { parseManifest, saveCatalogDraft } from '../app/services/catalog-state.server';
import { settingMappings } from '../app/services/manifest.server';

// Default: inspect only. --save-draft never publishes a customer configuration.
const shop = process.env.PILOT_ALLOWED_SHOP;
const productId = process.env.SOLITAIRE_PRODUCT_ID;
if (!shop || !productId || !/^\d+$/.test(productId)) throw new Error('Provide PILOT_ALLOWED_SHOP and the verified development-store SOLITAIRE_PRODUCT_ID.');
const url = new URL(process.env.DATABASE_URL!); url.searchParams.set('connect_timeout', '30'); process.env.DATABASE_URL = url.href;
const prisma = (await import('../app/db.server')).default;
try {
  const session = await requestClientCredentialsSession(shop);
  const admin: AdminClient = { graphql: async (query, options) => fetch(`https://${shop}/admin/api/2026-10/graphql.json`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': session.accessToken! }, body: JSON.stringify({ query, variables: options?.variables }), signal: AbortSignal.timeout(30_000) }) };
  const guard = await (await admin.graphql('{ shop { plan { partnerDevelopment } } }')).json();
  if (!guard.data?.shop.plan.partnerDevelopment) throw new Error('Setup is limited to a Shopify partner development store.');
  const state = await prisma.catalogState.findUniqueOrThrow({ where: { shop } });
  const manifest = parseManifest(state.draft, shop);
  if (manifest.settings?.some(s => s.id === 'solitaire')) throw new Error('Solitaire is already mapped. Edit its existing draft in Admin.');
  const settings = settingMappings(manifest);
  if (settings.length !== 1 || settings[0].id !== 'lumen') throw new Error('Review the existing setting draft before applying this two-family setup.');
  manifest.schemaVersion = 2;
  manifest.settings = [{ ...settings[0], assetVersion: 'lumen-visual-v3' }, { ...settings[0], id: 'solitaire', title: 'The Aevow Solitaire', style: 'Solitaire', family: 'solitaire', productId, assetVersion: 'solitaire-visual-v1', rules: { ...settings[0].rules } }];
  const { report, catalog } = await inspectMappedCatalog(admin, shop, manifest);
  const mapping = { shop, checkedAt: report.checkedAt, errors: report.errors, warnings: report.warnings, settings: catalog.settings?.map(s => ({ id: s.id, title: s.title, handle: s.handle, model: s.assetVersion, variants: s.variants.map(v => ({ id: v.id, metal: v.metal, size: v.size, available: v.available })) })) };
  await writeFile('.cache/milestone-3-mapping-report.json', JSON.stringify(mapping, null, 2));
  if (report.errors.length) throw new Error(`Resolve ${report.errors.length} mapping errors before saving.`);
  if (process.argv.includes('--save-draft')) await saveCatalogDraft(shop, state.revision, manifest);
  console.log(JSON.stringify({ inspected: true, savedDraft: process.argv.includes('--save-draft'), settings: mapping.settings?.map(s => ({ id: s.id, variants: s.variants.length })), published: false }));
} catch (error) { console.error(error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, '[database redacted]') : 'Setup failed'); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
