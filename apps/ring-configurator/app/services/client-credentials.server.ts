import { Session } from "@shopify/shopify-app-react-router/server";
import { PilotError } from "./errors.server";
/** Single-merchant Dev Dashboard apps can obtain short-lived offline tokens
 * through this grant. No token is exposed to the storefront or logs. */
export async function requestClientCredentialsSession(shop: string): Promise<Session> {
  if (shop !== process.env.PILOT_ALLOWED_SHOP || !/^[a-z0-9-]+\.myshopify\.com$/.test(shop) || !process.env.SHOPIFY_API_KEY || !process.env.SHOPIFY_API_SECRET) throw new PilotError("INSTALLATION_REQUIRED", "Configure the explicitly allowed Shopify app installation.", 503);
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: process.env.SHOPIFY_API_KEY, client_secret: process.env.SHOPIFY_API_SECRET, grant_type: "client_credentials" }), signal: AbortSignal.timeout(15_000) });
  const body = await response.json().catch(() => null) as { access_token?: string; scope?: string; expires_in?: number } | null;
  if (!response.ok || !body?.access_token || !body.expires_in) throw new PilotError("INSTALLATION_REQUIRED", "Shopify could not authorize this app. Verify the installation and development-store access.", 401);
  return new Session({ id: `offline_${shop}`, shop, state: "client_credentials", isOnline: false, accessToken: body.access_token, scope: body.scope, expires: new Date(Date.now() + body.expires_in * 1000) });
}
