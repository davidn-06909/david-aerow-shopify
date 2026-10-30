import { PilotError } from "./errors.server";
export function assertShopifyConfigured() {
  if (!process.env.SHOPIFY_API_KEY || !process.env.SHOPIFY_API_SECRET || !process.env.SHOPIFY_APP_URL || !process.env.DATABASE_URL) throw new PilotError("INSTALLATION_REQUIRED", "Configure and install the Shopify app before using authenticated ring services.", 503);
}
