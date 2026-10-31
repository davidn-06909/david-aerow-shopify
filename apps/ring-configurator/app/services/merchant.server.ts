import { authenticate } from "../shopify.server";
import { PilotError } from "./errors.server";
export async function merchant(request: Request) {
  const context = await authenticate.admin(request);
  if (context.session.shop !== process.env.PILOT_ALLOWED_SHOP) throw new PilotError("SHOP_MISMATCH", "This app is configured for a different development store.", 403);
  return { ...context, actor: "sessionToken" in context ? String(context.sessionToken.sub || "merchant") : "merchant" };
}
