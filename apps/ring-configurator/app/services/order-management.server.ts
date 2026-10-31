import copy from '../locales/en.json';
import { z } from 'zod';
import { data, type ActionFunctionArgs } from 'react-router';
import prisma from '../db.server';
import { merchant } from './merchant.server';
import { PilotError } from './errors.server';
import { refreshOrder } from './orders.server';
import { requestLimit } from './limits.server';
import { orderId } from './order-lifecycle';

export const orderFilters = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  q: z.string().trim().max(50).default(''),
  payment: z.enum(['', 'PENDING', 'AUTHORIZED', 'PARTIALLY_PAID', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'VOIDED', 'EXPIRED']).default(''),
  verification: z.enum(['', 'verified', 'review_required']).default(''),
  setting: z.string().max(60).regex(/^[a-z0-9-]*$/).default(''),
});
const reviewInput = z.object({ requestId: z.uuid(), auditId: z.uuid(), version: z.coerce.number().int().positive(), decision: z.enum(['acknowledged', 'needs_attention']), reason: z.string().trim().min(5).max(1000) });

export async function recordReview(shop: string, id: string, actor: string, input: unknown) {
  const parsed = reviewInput.safeParse(input);
  if (!parsed.success) throw new PilotError('INVALID_REVIEW', copy.chooseADecisionAndGiveAReason, 422);
  if (!actor || actor === 'merchant') throw new PilotError('OPERATOR_REQUIRED', copy.aVerifiedShopifyOperatorIsRequiredFor, 403);
  const form = parsed.data;
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`${shop}:order:${orderId(id)}`}))`;
    const order = await tx.configuredOrder.findUnique({ where: { shop_orderId: { shop, orderId: id } }, include: { audits: { orderBy: { version: 'desc' }, take: 1 } } });
    if (!order) throw new PilotError('ORDER_NOT_FOUND', copy.thisConfiguredOrderCouldNotBeFound, 404);
    const prior = await tx.merchantOrderAction.findUnique({ where: { shop_requestId: { shop, requestId: form.requestId } } });
    if (prior) {
      if (prior.configuredOrderId !== order.id || prior.auditId !== form.auditId || prior.actor !== actor || prior.decision !== form.decision || prior.reason !== form.reason) throw new PilotError('REVIEW_CONFLICT', copy.thisActionIdWasAlreadyUsedFor, 409);
      return prior;
    }
    if (order.version !== form.version || order.audits[0]?.id !== form.auditId) throw new PilotError('REVIEW_STALE', copy.theOrderChangedReviewTheLatestAudit, 409);
    return tx.merchantOrderAction.create({ data: { shop, requestId: form.requestId, configuredOrderId: order.id, actor, auditId: form.auditId, decision: form.decision, reason: form.reason } });
  });
}

export async function orderAction({ request, params }: ActionFunctionArgs) {
  const { admin, session, actor } = await merchant(request);
  try {
    if (request.method !== 'POST') throw new PilotError('METHOD_NOT_ALLOWED', copy.usePostForOrderActions, 405);
    const reader = request.body?.getReader(); let text = '', bytes = 0;
    if (!reader) throw new PilotError('INVALID_ACTION', copy.chooseAnOrderAction, 400);
    const decoder = new TextDecoder();
    for (;;) { const { value, done } = await reader.read(); if (done) break; bytes += value.length; if (bytes > 12_000) { await reader.cancel(); throw new PilotError('PAYLOAD_TOO_LARGE', copy.thisOrderActionIsTooLarge, 413); } text += decoder.decode(value, { stream: true }); }
    text += decoder.decode();
    const form = Object.fromEntries(new URLSearchParams(text));
    await requestLimit(session.shop, 'operator', 30);
    if (!actor || actor === 'merchant') throw new PilotError('OPERATOR_REQUIRED', copy.aVerifiedShopifyOperatorIsRequiredFor2, 403);
    if (form.intent === 'retry') {
      if (!z.uuid().safeParse(form.requestId).success || (form.receiptId || '').length > 500) throw new PilotError('INVALID_ACTION', copy.reloadBeforeRetryingThisReceipt, 400);
      await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`${session.shop}:retry:${form.requestId}`}))`;
        const prior = await tx.operationAction.findUnique({ where: { shop_requestId: { shop: session.shop, requestId: form.requestId } } });
        if (prior) { if (prior.target !== form.receiptId || prior.actor !== actor) throw new PilotError('REVIEW_CONFLICT', copy.thisRequestIdBelongsToAnotherAction, 409); return; }
        const changed = await tx.webhookReceipt.updateMany({ where: { id: form.receiptId, shop: session.shop, status: { in: ['failed', 'dead_letter'] } }, data: { status: 'pending', nextAttemptAt: new Date(), consecutiveFailures: 0 } });
        if (!changed.count) throw new PilotError('RECEIPT_NOT_FOUND', copy.thisFailedReceiptIsNoLongerAvailable, 409);
        await tx.operationAction.create({ data: { shop: session.shop, requestId: form.requestId, actor, intent: 'retry', target: form.receiptId } });
      });
      return { ok: true, message: copy.receiptQueuedForTheNextProcessingRun };
    }
    let id: string; try { id = orderId(params.orderId || form.orderId); } catch { throw new PilotError('INVALID_ORDER', copy.chooseAValidShopifyOrder, 400); }
    if (form.intent === 'recheck') {
      await refreshOrder(session.shop, id, admin, `merchant:${actor}`);
      return { ok: true, message: copy.currentShopifyOrderDataCheckedOriginalAudit };
    }
    if (form.intent === 'review') {
      await recordReview(session.shop, id, actor, form);
      return { ok: true, message: copy.reviewDecisionRecordedVerificationEvidenceAndManufacturing };
    }
    throw new PilotError('INVALID_ACTION', copy.chooseAnOrderAction, 400);
  } catch (error) {
    if (!(error instanceof PilotError)) return data({ ok: false, message: copy.theOrderOperationCouldNotCompleteRetry }, { status: 503 });
    return data({ ok: false, message: error.message }, { status: error.status });
  }
}
