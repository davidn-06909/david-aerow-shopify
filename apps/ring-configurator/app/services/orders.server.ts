import { createHash, randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { CartLineInput } from '../../shared/contract';
import prisma from '../db.server';
import { auditOrderGroup, properties, type OrderLine } from './order-audit';
import { verifyReference } from './signing.server';
import { activeManifest } from './catalog-state.server';
import { registerComponents } from './components.server';
import { orderId, retryDelay, safeFailure, type AuditEvidence, type OrderFacts } from './order-lifecycle';
import { readOrder } from './order-read.server';
import type { AdminClient } from './catalog.server';
import { PilotError } from './errors.server';

export interface PilotOrder { id: string | number; financial_status?: string; line_items: OrderLine[] }
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export function orderDigest(facts: OrderFacts, evidence: AuditEvidence) {
  const stable = { ...facts, lines: facts.lines.map(l => ({ ...l, properties: [...(l.properties || [])].sort((a, b) => a.name.localeCompare(b.name)) })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) };
  return createHash('sha256').update(JSON.stringify({ facts: stable, evidence })).digest('hex');
}

export async function synchronizeOrder(shop: string, facts: OrderFacts, source: string, observedVersion?: number | null) {
  orderId(facts.id);
  const active = await activeManifest(shop);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`${shop}:order:${facts.id}`}))`;
    const prior = await tx.configuredOrder.findUnique({ where: { shop_orderId: { shop, orderId: facts.id } } });
    if (observedVersion !== undefined && (prior?.version ?? null) !== observedVersion) throw new PilotError('ORDER_SYNC_CONFLICT', 'The order changed during synchronization. Retry using its current Shopify state.', 409);
    if (prior && prior.sourceUpdatedAt > new Date(facts.updatedAt)) return { relevant: true, stale: true, id: prior.id };
    await registerComponents(tx, shop, active.manifest);
    const memberships = await tx.managedComponent.findMany({ where: { shop } });
    const managed = new Set(memberships.map(m => `${m.kind}:${m.referenceId}`));
    const grouped = new Map<string, OrderLine[]>();
    const warnings: string[] = [];
    for (const line of facts.lines) {
      const p = properties(line), group = p._configuration_id;
      const relevant = managed.has(`variant:${line.variant_id}`) || managed.has(`product:${line.product_id}`) || Object.keys(p).some(k => k.startsWith('_aevow_'));
      if (group) grouped.set(group, [...(grouped.get(group) || []), line]);
      else if (relevant) warnings.push(`missing_configuration:${line.variant_id}`);
    }
    const historical = prior || await tx.orderDesign.findFirst({ where: { shop, orderId: facts.id }, select: { id: true } });
    if (!historical && !grouped.size && !warnings.length) return { relevant: false, stale: false };
    if (historical && !grouped.size) warnings.push('all_configuration_groups_removed');
    const evidence: AuditEvidence = { version: 'order-audit-v2', groups: [], warnings };
    const associations: { configurationId: string; designId: string; discrepancies: string[] }[] = [];
    for (const [configurationId, lines] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const p = properties(lines[0]);
      const design = await tx.design.findFirst({ where: { id: p._aevow_design_id || '', shop }, include: { quote: true } });
      if (!design) { evidence.groups.push({ configurationId, discrepancies: ['unknown_design'] }); continue; }
      const snapshot = design.snapshot as unknown as { items: CartLineInput[]; selection?: { settingId?: string } };
      const discrepancies = auditOrderGroup(snapshot.items, lines);
      const claims = verifyReference(p._aevow_reference || '', shop, 0);
      if (!claims || claims.d !== design.id || claims.g !== configurationId || claims.q !== design.quoteId || design.quote.signature !== p._aevow_reference) discrepancies.push('signed_reference');
      evidence.groups.push({ configurationId, designId: design.id, settingId: snapshot.selection?.settingId || 'lumen', discrepancies });
      associations.push({ configurationId, designId: design.id, discrepancies });
    }
    evidence.warnings.sort();
    const verification = evidence.warnings.length || evidence.groups.some(g => g.discrepancies.length) ? 'review_required' : 'verified';
    const digest = orderDigest(facts, evidence);
    const data = { name: facts.name, paymentState: facts.paymentState, cancelled: facts.cancelled, sourceUpdatedAt: new Date(facts.updatedAt), synchronizedAt: new Date(), verification, digest, facts: json(facts), settingIds: [...new Set(evidence.groups.flatMap(g => g.settingId ? [g.settingId] : []))] };
    const record = prior
      ? await tx.configuredOrder.update({ where: { id: prior.id }, data: { ...data, version: prior.digest === digest ? prior.version : prior.version + 1 } })
      : await tx.configuredOrder.create({ data: { ...data, shop, orderId: facts.id } });
    if (!prior || prior.digest !== digest) await tx.orderAuditRun.create({ data: { configuredOrderId: record.id, source, version: record.version, digest, verification, evidence: json(evidence) } });
    const currentGroups = new Set(associations.map(a => a.configurationId));
    const removed = await tx.orderDesign.findMany({ where: { shop, orderId: facts.id } });
    for (const old of removed) if (!currentGroups.has(old.configurationId)) await tx.orderDesign.update({ where: { id: old.id }, data: { status: 'review_required', discrepancies: ['configuration_removed'] } });
    for (const a of associations) {
      const data = { designId: a.designId, status: a.discrepancies.length ? 'review_required' : facts.cancelled ? 'verified_cancelled' : Number(facts.refunded) > 0 ? 'verified_refund_recorded' : facts.paymentState === 'PAID' ? 'verified_paid' : 'verified_payment_pending', discrepancies: json(a.discrepancies) };
      await tx.orderDesign.upsert({ where: { shop_orderId_configurationId: { shop, orderId: facts.id, configurationId: a.configurationId } }, create: { shop, orderId: facts.id, configurationId: a.configurationId, ...data }, update: data });
    }
    return { relevant: true, stale: false, id: record.id, verification };
  }, { timeout: 20_000 });
}

export async function refreshOrder(shop: string, id: string, admin: AdminClient, source: string) {
  const prior = await prisma.configuredOrder.findUnique({ where: { shop_orderId: { shop, orderId: orderId(id) } }, select: { version: true } });
  return synchronizeOrder(shop, await readOrder(admin, id), source, prior?.version ?? null);
}

export async function processOrderReceipt(receiptId: string, admin: AdminClient) {
  const token = randomUUID(), now = new Date();
  const claimed = await prisma.webhookReceipt.updateMany({ where: { id: receiptId, OR: [ { status: { in: ['pending', 'failed'] }, nextAttemptAt: { lte: now } }, { status: 'processing', leaseUntil: { lt: now } } ] }, data: { status: 'processing', leaseToken: token, leaseUntil: new Date(Date.now() + 120_000), attempts: { increment: 1 } } });
  if (!claimed.count) return { claimed: false };
  const receipt = await prisma.webhookReceipt.findUniqueOrThrow({ where: { id: receiptId } });
  try {
    const payload = receipt.payload as { id?: unknown; order_id?: unknown };
    const id = orderId(receipt.topic === 'REFUNDS_CREATE' ? payload.order_id : payload.id);
    const result = await refreshOrder(receipt.shop, id, admin, `webhook:${receipt.topic}`);
    await prisma.webhookReceipt.updateMany({ where: { id: receiptId, leaseToken: token }, data: { status: result.verification === 'review_required' ? 'review_required' : 'processed', processedAt: new Date(), leaseToken: null, leaseUntil: null, consecutiveFailures: 0, lastError: null } });
    return { claimed: true, ...result };
  } catch (error) {
    const failures = receipt.consecutiveFailures + 1;
    await prisma.webhookReceipt.updateMany({ where: { id: receiptId, leaseToken: token }, data: { status: failures >= 8 ? 'dead_letter' : 'failed', consecutiveFailures: failures, nextAttemptAt: new Date(Date.now() + retryDelay(failures)), leaseToken: null, leaseUntil: null, lastError: safeFailure(error) } });
    throw error;
  }
}
