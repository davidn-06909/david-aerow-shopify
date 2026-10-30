import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { loadCatalog, filterDiamonds } from "../services/catalog.server";
import { createQuote, getDesign, saveDesign } from "../services/designs.server";
import { apiError, PilotError, readJson } from "../services/errors.server";
import { assertShopifyConfigured } from "../services/configured.server";
async function context(request: Request) {
  assertShopifyConfigured();
  const proxy = await authenticate.public.appProxy(request);
  if (!proxy.admin || !proxy.session) throw new PilotError("INSTALLATION_REQUIRED", "Install and authorize the Shopify app before using the ring service.", 401);
  return { admin: proxy.admin, shop: proxy.session.shop };
}
function json(value: unknown, status = 200) { return Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }); }
export async function loader({ request, params }: LoaderFunctionArgs) {
  try {
    const { admin, shop } = await context(request);
    const endpoint = params["*"] || "";
    if (endpoint === "bootstrap") return json(await loadCatalog(admin, shop));
    if (endpoint === "diamonds") return json({ diamonds: filterDiamonds((await loadCatalog(admin, shop)).diamonds, new URL(request.url).searchParams) });
    if (endpoint.startsWith("designs/")) return json(await getDesign(shop, endpoint.slice(8)));
    throw new PilotError("NOT_FOUND", "Ring service endpoint not found.", 404);
  } catch (error) { return apiError(error); }
}
export async function action({ request, params }: ActionFunctionArgs) {
  try {
    if (request.method !== "POST") throw new PilotError("METHOD_NOT_ALLOWED", "Use POST for this endpoint.", 405);
    const { admin, shop } = await context(request);
    const input = await readJson(request);
    if (params["*"] === "quotes") return json(await createQuote(input, await loadCatalog(admin, shop)), 201);
    if (params["*"] === "designs") return json(await saveDesign(shop, input), 201);
    throw new PilotError("NOT_FOUND", "Ring service endpoint not found.", 404);
  } catch (error) { return apiError(error); }
}
