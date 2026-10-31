import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { merchant } from "./merchant.server";
import { saveCatalogDraft } from "./catalog-state.server";
import { publishCatalog, searchShopifyVariants, validateDraft } from "./catalog-management.server";
import { PilotError } from "./errors.server";
export async function catalogAdminAction({ request }: ActionFunctionArgs) {
  const { admin, session, actor } = await merchant(request);
  try {
    if (request.method !== "POST") throw new PilotError("METHOD_NOT_ALLOWED", "Use POST for merchant changes.", 405);
    const text = await request.text();
    if (text.length > 500_000) throw new PilotError("PAYLOAD_TOO_LARGE", "The catalog form is too large.", 413);
    const form = new URLSearchParams(text), intent = form.get("intent") || "";
    if (intent === "search") return { ok: true, intent, results: await searchShopifyVariants(admin, form.get("query") || "", form.get("after") || undefined) };
    const revision = Number(form.get("revision"));
    if (!Number.isSafeInteger(revision) || revision < 1) throw new PilotError("DRAFT_CONFLICT", "Reload the latest catalog revision.", 409);
    if (intent === "save") {
      let payload; try { payload = JSON.parse(form.get("manifest") || ""); } catch { throw new PilotError("INVALID_CATALOG", "The catalog form could not be read."); }
      await saveCatalogDraft(session.shop, revision, payload);
      return { ok: true, intent, message: "Draft saved. Customer options have not changed." };
    }
    if (intent === "validate") return { ok: true, intent, report: (await validateDraft(admin, session.shop, revision)).report, message: "Saved draft checked against current Shopify data." };
    if (intent === "publish" || intent === "restore") {
      const result = await publishCatalog(admin, session.shop, revision, actor, intent === "restore" ? form.get("version") || "missing" : undefined);
      return { ok: true, intent, ...result, message: intent === "restore" ? "Previous configuration restored using current Shopify prices and availability." : "Catalog published. New configurations use this version." };
    }
    throw new PilotError("INVALID_ACTION", "Choose a catalog action.", 400);
  } catch (e) {
    if (!(e instanceof PilotError)) throw e;
    return data({ ok: false, intent: "error", message: e.message, fields: e.fields || {} }, { status: e.status });
  }
}
