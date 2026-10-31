import type { LoaderFunctionArgs } from "react-router";
import { merchant } from "../services/merchant.server";
import { initializeCatalog, parseManifest } from "../services/catalog-state.server";
import { inspectMappedCatalog } from "../services/catalog.server";
import { apiError, PilotError } from "../services/errors.server";
import { searchDiamonds } from "../services/diamond-search";
export async function loader({ request, params }: LoaderFunctionArgs) {
  const { admin, session } = await merchant(request);
  try {
    const state = await initializeCatalog(session.shop);
    const { catalog } = await inspectMappedCatalog(admin, session.shop, parseManifest(state.draft, session.shop), `draft-${state.revision}`);
    catalog.mode = "read-only"; catalog.previewMode = "merchant-draft";
    catalog.canPurchase = false; catalog.notices.unshift("Merchant draft preview. Changes are not published. Saving designs and purchasing are disabled.");
    if (params["*"] === "bootstrap") return Response.json(catalog, { headers: { "Cache-Control": "no-store" } });
    if (params["*"] === "diamonds") return Response.json(searchDiamonds(catalog, new URL(request.url).searchParams), { headers: { "Cache-Control": "no-store" } });
    if (params["*"]?.startsWith("diamonds/")) { const id = params["*"].slice(9); const d = catalog.diamonds.find(d => d.id === id || d.sourceVariantId === id); if (d) return Response.json(d, { headers: { "Cache-Control": "no-store" } }); }
    throw new PilotError("NOT_FOUND", "Draft endpoint not found.", 404);
  } catch (error) { return apiError(error); }
}
export async function action() { return apiError(new PilotError("PREVIEW_ONLY", "Purchases and saved designs are disabled in draft preview.", 403)); }
