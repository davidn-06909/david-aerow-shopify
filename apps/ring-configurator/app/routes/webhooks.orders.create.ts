import type { ActionFunctionArgs } from "react-router";
import type { Prisma } from "@prisma/client";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { processOrderReceipt, type PilotOrder } from "../services/orders.server";
import { assertShopifyConfigured } from "../services/configured.server";
export async function action({ request }: ActionFunctionArgs) {
  assertShopifyConfigured();
  const { shop, topic, payload, webhookId } = await authenticate.webhook(request);
  const order = payload as unknown as PilotOrder;
  const id = `${shop}:${topic}:${webhookId}`;
  // Retain only manufacturing fields; unrelated customer/order PII is deliberately excluded.
  const allowedProperties = new Set(["_configuration_id", "_aevow_design_id", "_aevow_reference", "_aevow_asset_version", "_aevow_catalog_version", "_aevow_role", "_aevow_preview", "Setting", "Band", "Metal", "Shape", "Ring size", "3D fitting", "Engraving", "Diamond", "Certificate"]);
  const minimal: PilotOrder = { id: order.id, financial_status: order.financial_status, line_items: order.line_items.map(line => ({ variant_id: line.variant_id, product_id: line.product_id, quantity: line.quantity, properties: line.properties?.filter(p => allowedProperties.has(p.name)) })) };
  await prisma.webhookReceipt.upsert({ where: { id }, create: { id, shop, topic, payload: JSON.parse(JSON.stringify(minimal)) as Prisma.InputJsonValue }, update: {} });
  try { await processOrderReceipt(id); return new Response(null, { status: 200 }); }
  catch { return new Response("Order audit pending retry", { status: 500 }); }
}
