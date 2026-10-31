import type { LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { loadCatalog } from "../services/catalog.server";
import { settingsOf } from "../../shared/compatibility";
import prisma from "../db.server";
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  let catalog = null; let catalogError = "";
  try { catalog = await loadCatalog(admin, session.shop); } catch (error) { catalogError = error instanceof Error ? error.message : "Catalog unavailable"; }
  const orders = await prisma.orderDesign.findMany({ where: { shop: session.shop }, orderBy: { createdAt: "desc" }, take: 15, select: { orderId: true, configurationId: true, designId: true, status: true, discrepancies: true } });
  const storageProvider = process.env.PREVIEW_STORAGE || "database";
  const pending = await prisma.webhookReceipt.count({ where: { shop: session.shop, status: { not: "processed" } } });
  const settings = catalog ? settingsOf(catalog).map(s => ({ id: s.id, title: s.title, variants: s.variants.length, assetVersion: s.assetVersion || catalog.assetVersion })) : [];
  return { shop: session.shop, catalog, catalogError, settings, orders, pending, storageProvider, storageReady: storageProvider === "database" || Boolean(process.env.R2_ENDPOINT && process.env.R2_BUCKET && process.env.R2_PUBLIC_URL && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY), signingReady: (process.env.CONFIGURATION_SIGNING_SECRET?.length || 0) >= 32 };
};
export default function Diagnostics() {
  const d = useLoaderData<typeof loader>();
  return <main style={{ fontFamily: "system-ui", maxWidth: 1100, padding: 32, margin: "auto", lineHeight: 1.65 }}><h1>Aevow · Ring pilot diagnostics</h1><p><Link to="/app/catalog">Manage catalog, configuration and published versions</Link></p><p>Authenticated Shopify connection: <strong>{d.shop}</strong></p><p>Fitting: representative, physically unverified.</p><ul><li>Product mappings: {d.catalog ? "Connected" : d.catalogError}</li><li>Preview storage ({d.storageProvider}): {d.storageReady ? "Configured" : "Configuration required"}</li><li>Quote signing: {d.signingReady ? "Configured" : "Configuration required"}</li><li>Pending/failed webhook receipts: {d.pending}</li></ul>{d.catalog && <><h2>Catalog mappings</h2><ul>{d.settings.map(s => <li key={s.id}>{s.title} &#183; {s.variants} setting variants &#183; model {s.assetVersion}</li>)}</ul><p>Engraving variant {d.catalog.engraving.variantId}</p><table style={{ width: "100%", textAlign: "left" }}><thead><tr><th>Diamond</th><th>Source variant</th><th>Store variant</th><th>Status</th></tr></thead><tbody>{d.catalog.diamonds.map(v => <tr key={v.id}><td>{v.title}</td><td>{v.sourceVariantId}</td><td>{v.id}</td><td>{v.available ? "Purchasable" : "Unavailable"}</td></tr>)}</tbody></table></>}<h2>Recent configured orders</h2>{d.orders.length ? <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(d.orders, null, 2)}</pre> : <p>No configured order has been verified yet.</p>}<p>Publishing the theme app block and completing development-store checkout are separate required acceptance checks.</p></main>;
}
