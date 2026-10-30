import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { requestClientCredentialsSession } from "../app/services/client-credentials.server";
beforeEach(() => { vi.stubEnv("PILOT_ALLOWED_SHOP", "allowed.myshopify.com"); vi.stubEnv("SHOPIFY_API_KEY", "test-key"); vi.stubEnv("SHOPIFY_API_SECRET", "test-secret"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
test("offline grant never calls an arbitrary shop or sends credentials to it", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(requestClientCredentialsSession("attacker.example")).rejects.toThrow(/explicitly allowed/);
  expect(fetcher).not.toHaveBeenCalled();
});
test("a verified installed single-merchant grant becomes an expiring server-side offline session", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ access_token: "test-offline-token", scope: "read_products", expires_in: 86400 })));
  const session = await requestClientCredentialsSession("allowed.myshopify.com");
  expect(session.id).toBe("offline_allowed.myshopify.com"); expect(session.isOnline).toBe(false); expect(session.scope).toBe("read_products");
  expect(session.expires!.getTime()).toBeGreaterThan(Date.now() + 86_000_000);
});
test("failed grants expose a safe installation error", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error_description: "private upstream detail" }, { status: 401 })));
  await expect(requestClientCredentialsSession("allowed.myshopify.com")).rejects.toThrow("Shopify could not authorize this app.");
});
