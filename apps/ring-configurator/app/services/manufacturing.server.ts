import { z } from 'zod';
import prisma from '../db.server';
import { PilotError } from './errors.server';
import { orderId, type OrderFacts } from './order-lifecycle';

export interface ManufacturingEvidence {
  paymentState: string;
  cancelled: boolean;
  refunded: string;
  verification: string;
  associationStatus: string;
  fittingStatus?: string;
  fittingReleaseId?: string;
  activeFittingReleaseId?: string | null;
}

export function manufacturingEligibility(evidence: ManufacturingEvidence): { ready: boolean; reason: string } {
  if (evidence.cancelled) return { ready: false, reason: 'The Shopify order was cancelled.' };
  const refunded = Number(evidence.refunded);
  if (!Number.isFinite(refunded) || refunded < 0) return { ready: false, reason: 'The Shopify refund amount requires review.' };
  if (refunded > 0) return { ready: false, reason: 'A refund was recorded for this order.' };
  if (evidence.paymentState !== 'PAID') return { ready: false, reason: 'The Shopify payment is not settled.' };
  if (evidence.verification !== 'verified' || evidence.associationStatus !== 'verified_paid')
    return { ready: false, reason: 'Purchased components require review.' };
  if (evidence.fittingStatus !== 'manufacturer-approved' || !evidence.fittingReleaseId)
    return { ready: false, reason: 'This saved design has no manufacturer fitting approval.' };
  if (evidence.fittingReleaseId !== evidence.activeFittingReleaseId)
    return { ready: false, reason: 'The fitting release changed or was suspended. Recheck with the manufacturer.' };
  return { ready: true, reason: 'Ready for an authorized manufacturer review.' };
}

const inputSchema = z.object({
  requestId: z.uuid(),
  auditId: z.uuid(),
  configurationId: z.uuid(),
  version: z.coerce.number().int().positive(),
  decision: z.enum(['approved', 'hold', 'rejected']),
  reason: z.string().trim().min(5).max(1000),
});

export async function recordManufacturingDecision(shop: string, id: string, actor: string, input: unknown) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new PilotError('INVALID_MANUFACTURING_DECISION', 'Choose a ring, decision and reason.', 422);
  if (!actor || actor === 'merchant') throw new PilotError('OPERATOR_REQUIRED', 'A verified Shopify operator must record manufacturing decisions.', 403);
  const orderNumber = orderId(id), form = parsed.data;
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`${shop}:order:${orderNumber}`}))`;
    const order = await tx.configuredOrder.findUnique({ where: { shop_orderId: { shop, orderId: orderNumber } },
      include: { audits: { orderBy: { version: 'desc' }, take: 1 } } });
    if (!order) throw new PilotError('ORDER_NOT_FOUND', 'This configured order could not be found.', 404);
    const prior = await tx.manufacturingDecision.findUnique({ where: { shop_requestId: { shop, requestId: form.requestId } } });
    if (prior) {
      if (prior.configuredOrderId !== order.id || prior.configurationId !== form.configurationId || prior.auditId !== form.auditId
        || prior.actor !== actor || prior.decision !== form.decision || prior.reason !== form.reason)
        throw new PilotError('DECISION_CONFLICT', 'This action ID was used for another manufacturing decision.', 409);
      return prior;
    }
    if (order.version !== form.version || order.audits[0]?.id !== form.auditId)
      throw new PilotError('ORDER_CHANGED', 'The Shopify order changed. Review the latest audit before deciding.', 409);
    const association = await tx.orderDesign.findUnique({ where: { shop_orderId_configurationId: { shop, orderId: orderNumber, configurationId: form.configurationId } },
      include: { design: { select: { snapshot: true } } } });
    if (!association) throw new PilotError('RING_NOT_FOUND', 'This ring group is not associated with the order.', 404);
    const snapshot = association.design.snapshot as { fittingStatus?: string; fittingReleaseId?: string };
    const state = await tx.fittingState.findUnique({ where: { shop } });
    const facts = order.facts as unknown as OrderFacts;
    const gate = manufacturingEligibility({ paymentState: facts.paymentState, cancelled: facts.cancelled, refunded: facts.refunded,
      verification: order.verification, associationStatus: association.status, fittingStatus: snapshot.fittingStatus,
      fittingReleaseId: snapshot.fittingReleaseId, activeFittingReleaseId: state?.activeVersion });
    if (form.decision === 'approved' && !gate.ready)
      throw new PilotError('MANUFACTURING_BLOCKED', gate.reason, 409);
    return tx.manufacturingDecision.create({ data: {
      shop, requestId: form.requestId, configuredOrderId: order.id, configurationId: form.configurationId, auditId: form.auditId,
      fitReleaseId: snapshot.fittingReleaseId || '', actor, decision: form.decision, reason: form.reason,
    } });
  });
}
