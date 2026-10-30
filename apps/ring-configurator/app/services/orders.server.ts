import type { Prisma } from "@prisma/client";
import type { CartLineInput } from "../../shared/contract";
import prisma from "../db.server";
import { auditOrderGroup, properties, type OrderLine } from "./order-audit";
import { verifyReference } from "./signing.server";
import { readManifest, numericId } from "./manifest.server";
export interface PilotOrder { id: string | number; financial_status?: string; line_items: OrderLine[] }
export async function processOrderReceipt(receiptId: string) {
  const receipt = await prisma.webhookReceipt.findUniqueOrThrow({ where: { id: receiptId } });
  if (receipt.status === "processed" || receipt.status === "review_required") return;
  const order = receipt.payload as unknown as PilotOrder;
  await prisma.webhookReceipt.update({ where: { id: receiptId }, data: { attempts: { increment: 1 } } });
  try {
    const groups = new Map<string, OrderLine[]>();
    const manifest = await readManifest();
    const pilotVariants = new Set([manifest.engravingVariantId, ...manifest.diamonds.map(d => d.variantId)].map(numericId));
    const warnings: string[] = [];
    for (const line of order.line_items) {
      const props = properties(line); const id = props._configuration_id;
      const pilotLine = Object.keys(props).some(k => k.startsWith("_aevow_")) || pilotVariants.has(String(line.variant_id)) || String(line.product_id) === numericId(manifest.settingProductId);
      if (id) groups.set(id, [...(groups.get(id) || []), line]);
      else if (pilotLine) warnings.push(`missing_configuration:${line.variant_id}`);
    }
    await prisma.$transaction(async tx => {
      for (const [configurationId, lines] of groups) {
        const first = properties(lines[0]);
        const design = await tx.design.findFirst({ where: { id: first._aevow_design_id || "", shop: receipt.shop }, include: { quote: true } });
        if (!design) { warnings.push(`unknown_design:${configurationId}`); continue; }
        const expected = (design.snapshot as unknown as { items: CartLineInput[] }).items;
        const discrepancies = auditOrderGroup(expected, lines);
        const claims = verifyReference(first._aevow_reference || "", receipt.shop, 0);
        if (!claims || claims.d !== design.id || claims.g !== configurationId || design.quote.signature !== first._aevow_reference) discrepancies.push("signed_reference");
        if (discrepancies.length) warnings.push(`configuration_requires_review:${configurationId}`);
        const data = { designId: design.id, status: discrepancies.length ? "review_required" : order.financial_status === "paid" ? "verified_paid" : "verified_payment_pending", discrepancies: discrepancies as Prisma.InputJsonValue };
        await tx.orderDesign.upsert({ where: { shop_orderId_configurationId: { shop: receipt.shop, orderId: String(order.id), configurationId } }, create: { shop: receipt.shop, orderId: String(order.id), configurationId, ...data }, update: data });
      }
      await tx.webhookReceipt.update({ where: { id: receiptId }, data: { status: warnings.length ? "review_required" : "processed", processedAt: new Date(), lastError: warnings.length ? warnings.join("; ").slice(0, 1000) : null } });
    });
  } catch (error) {
    await prisma.webhookReceipt.update({ where: { id: receiptId }, data: { status: "failed", lastError: error instanceof Error ? error.message.slice(0, 500) : "Order audit failed" } });
    throw error;
  }
}
