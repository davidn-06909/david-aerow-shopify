import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { previewCatalog } from "../services/preview.server";
import { filterDiamonds } from "../services/catalog.server";
import { apiError, PilotError } from "../services/errors.server";
export async function loader({ request, params }: LoaderFunctionArgs) {
  try {
    if (process.env.ENABLE_READ_ONLY_PREVIEW !== "true") throw new PilotError("NOT_FOUND", "Preview is disabled.", 404);
    const catalog = await previewCatalog();
    if (params["*"] === "bootstrap") return Response.json(catalog, { headers: { "Cache-Control": "no-store" } });
    if (params["*"] === "diamonds") return Response.json({ diamonds: filterDiamonds(catalog.diamonds, new URL(request.url).searchParams) });
    throw new PilotError("NOT_FOUND", "Preview endpoint not found.", 404);
  } catch (error) { return apiError(error); }
}
export async function action(_args: ActionFunctionArgs) { return apiError(new PilotError("INSTALLATION_REQUIRED", "This is a read-only visual preview. Install and configure the Shopify app before saving designs or purchasing.", 503)); }
