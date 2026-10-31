import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import prisma from '../db.server';
import type { AdminClient } from './catalog.server';
import { processOrderReceipt } from './orders.server';
import { updatedOrderPage } from './order-read.server';
import { safeFailure, ORDER_TOPICS } from './order-lifecycle';

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
interface ReconciliationCursor { since: string; until: string; after?: string; ids?: string[]; next?: string; hasNext?: boolean }

export async function runOperations(shop: string, admin: AdminClient, budgetMs = 15_000) {
  if (shop !== process.env.PILOT_ALLOWED_SHOP) throw new Error('SHOP_MISMATCH');
  const started = Date.now(), token = randomUUID();
  await prisma.jobCheckpoint.upsert({ where: { shop_kind: { shop, kind: 'operations' } }, create: { shop, kind: 'operations' }, update: {} });
  const lease = await prisma.jobCheckpoint.updateMany({ where: { shop, kind: 'operations', OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] }, data: { leaseToken: token, leaseUntil: new Date(Date.now() + 120_000) } });
  if (!lease.count) return { skipped: true, processed: 0, failures: 0, reconciled: 0 };
  let processed = 0, failures = 0, reconciled = 0;
  try {
    const now = new Date();
    const receipts = await prisma.webhookReceipt.findMany({ where: { shop, topic: { in: [...ORDER_TOPICS] }, OR: [{ status: { in: ['pending', 'failed'] }, nextAttemptAt: { lte: now } }, { status: 'processing', leaseUntil: { lt: now } }] }, orderBy: { createdAt: 'asc' }, take: 10, select: { id: true } });
    for (const receipt of receipts) {
      if (Date.now() - started > budgetMs * 0.65) break;
      try { const result = await processOrderReceipt(receipt.id, admin); if (result.claimed) processed++; }
      catch { failures++; }
    }
    await prisma.jobCheckpoint.upsert({ where: { shop_kind: { shop, kind: 'reconciliation' } }, create: { shop, kind: 'reconciliation' }, update: {} });
    const checkpoint = await prisma.jobCheckpoint.findUniqueOrThrow({ where: { shop_kind: { shop, kind: 'reconciliation' } } });
    if (Date.now() - started < budgetMs && (checkpoint.checkpoint || !checkpoint.lastSuccessAt || Date.now() - checkpoint.lastSuccessAt.getTime() >= 15 * 60_000)) {
      let cursor = checkpoint.checkpoint as unknown as ReconciliationCursor | null;
      if (!cursor) cursor = { since: new Date(Math.max(Date.now() - 59 * 86400_000, (checkpoint.lastSuccessAt?.getTime() || Date.now() - 58 * 86400_000) - 86400_000)).toISOString(), until: new Date().toISOString() };
      let batches = 0;
      while (Date.now() - started < budgetMs && batches++ < 2) {
        if (!cursor.ids) {
          const page = await updatedOrderPage(admin, cursor.since, cursor.until, cursor.after);
          if (page.pageInfo.hasNextPage && (!page.pageInfo.endCursor || page.pageInfo.endCursor === cursor.after)) throw new Error('RECONCILIATION_CURSOR');
          cursor = { ...cursor, ids: page.ids, next: page.pageInfo.endCursor, hasNext: page.pageInfo.hasNextPage };
          await prisma.jobCheckpoint.update({ where: { shop_kind: { shop, kind: 'reconciliation' } }, data: { checkpoint: json(cursor) } });
        }
        while (cursor.ids?.length && Date.now() - started < budgetMs) {
          const id = cursor.ids[0];
          const receiptId = `${shop}:ORDERS_UPDATED:reconcile:${cursor.until}:${id}`;
          await prisma.webhookReceipt.upsert({ where: { id: receiptId }, create: { id: receiptId, shop, topic: 'ORDERS_UPDATED', payload: { id } }, update: {} });
          cursor.ids.shift(); reconciled++;
          await prisma.jobCheckpoint.update({ where: { shop_kind: { shop, kind: 'reconciliation' } }, data: { checkpoint: json(cursor) } });
        }
        if (cursor.ids?.length) break;
        if (!cursor.hasNext) {
          await prisma.jobCheckpoint.update({ where: { shop_kind: { shop, kind: 'reconciliation' } }, data: { checkpoint: Prisma.JsonNull, lastSuccessAt: new Date(cursor.until), lastError: null } });
          break;
        }
        cursor = { since: cursor.since, until: cursor.until, after: cursor.next };
        await prisma.jobCheckpoint.update({ where: { shop_kind: { shop, kind: 'reconciliation' } }, data: { checkpoint: json(cursor) } });
      }
    }
    // Only ephemeral request accounting expires. Historical evidence is retained.
    await prisma.requestBucket.deleteMany({ where: { shop, expiresAt: { lt: new Date() } } });
    await prisma.jobCheckpoint.updateMany({ where: { shop, kind: 'operations', leaseToken: token }, data: { lastSuccessAt: new Date(), lastError: failures ? 'RECEIPT_RETRY_PENDING' : null } });
    return { skipped: false, processed, failures, reconciled };
  } catch (error) {
    await prisma.jobCheckpoint.updateMany({ where: { shop, kind: 'operations', leaseToken: token }, data: { lastError: safeFailure(error) } });
    throw error;
  } finally {
    await prisma.jobCheckpoint.updateMany({ where: { shop, kind: 'operations', leaseToken: token }, data: { leaseUntil: null, leaseToken: null } });
  }
}
