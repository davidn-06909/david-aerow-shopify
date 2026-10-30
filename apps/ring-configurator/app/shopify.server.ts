import "@shopify/shopify-app-react-router/adapters/node";
import { ApiVersion, AppDistribution, shopifyApp } from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { requestClientCredentialsSession } from "./services/client-credentials.server";
// Do not open PostgreSQL for the explicitly read-only visual preview. Authenticated
// app operations initialize the real Prisma adapter on first use.
type PrismaStorage = PrismaSessionStorage<typeof prisma>;
let prismaStorage: PrismaStorage | undefined;
const storage = () => prismaStorage ||= new PrismaSessionStorage(prisma);
const renewing = new Map<string, ReturnType<typeof requestClientCredentialsSession>>();
async function loadSession(id: string) {
  const current = await storage().loadSession(id);
  const shop = process.env.PILOT_ALLOWED_SHOP;
  if (process.env.CLIENT_CREDENTIALS_AUTH !== "true" || !shop || id !== `offline_${shop}` || (current && (!current.expires || current.expires.getTime() > Date.now() + 120_000))) return current;
  let renewal = renewing.get(shop);
  if (!renewal) {
    renewal = requestClientCredentialsSession(shop).then(async session => { await storage().storeSession(session); return session; }).finally(() => renewing.delete(shop));
    renewing.set(shop, renewal);
  }
  return renewal;
}
const lazySessionStorage = {
  storeSession: (...args: Parameters<PrismaStorage["storeSession"]>) => storage().storeSession(...args),
  loadSession,
  deleteSession: (...args: Parameters<PrismaStorage["deleteSession"]>) => storage().deleteSession(...args),
  deleteSessions: (...args: Parameters<PrismaStorage["deleteSessions"]>) => storage().deleteSessions(...args),
  findSessionsByShop: (...args: Parameters<PrismaStorage["findSessionsByShop"]>) => storage().findSessionsByShop(...args),
};
const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY || "configuration-required",
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "configuration-required",
  apiVersion: ApiVersion.October26,
  scopes: (process.env.SCOPES || "read_products,read_inventory,read_orders,write_app_proxy").split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "http://localhost:3000",
  authPathPrefix: "/auth",
  sessionStorage: lazySessionStorage,
  distribution: AppDistribution.SingleMerchant,
  future: { expiringOfflineAccessTokens: true },
});
export default shopify;
export const { authenticate, unauthenticated, login, registerWebhooks, sessionStorage, addDocumentResponseHeaders } = shopify;
