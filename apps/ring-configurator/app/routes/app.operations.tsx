import copy from '../locales/en.json';
import { useEffect, useState } from 'react';
import type { LoaderFunctionArgs } from 'react-router';
import { Form, Link, useActionData, useLoaderData, useNavigation } from 'react-router';
import prisma from '../db.server';
import { merchant } from '../services/merchant.server';
import { orderAction } from '../services/order-management.server';
import { shopifyRead } from '../services/shopify-read.server';
import '../styles/orders.css';

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await merchant(request);
  const [counts, jobs, failed, storage, orders] = await Promise.all([
    prisma.webhookReceipt.groupBy({ by: ['status'], where: { shop: session.shop }, _count: true }),
    prisma.jobCheckpoint.findMany({ where: { shop: session.shop }, select: { kind: true, lastSuccessAt: true, lastError: true, leaseUntil: true, updatedAt: true } }),
    prisma.webhookReceipt.findMany({ where: { shop: session.shop, status: { in: ['failed', 'dead_letter'] } }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, topic: true, attempts: true, lastError: true, nextAttemptAt: true } }),
    prisma.$queryRaw<{ bytes: bigint; designs: bigint }[]>`SELECT COALESCE(SUM(octet_length("previewData")), 0)::bigint AS bytes, COUNT(*)::bigint AS designs FROM "Design" WHERE shop = ${session.shop}`,
    prisma.configuredOrder.count({ where: { shop: session.shop } }),
  ]);
  let plan: { publicDisplayName: string; shopifyPlus: boolean; partnerDevelopment: boolean } | null = null;
  try { const response = await shopifyRead(admin, '{ shop { plan { publicDisplayName shopifyPlus partnerDevelopment } } }'); const b = await response.json(); if (!b.errors) plan = b.data?.shop?.plan; } catch { /* Current projection remains readable during Shopify downtime. */ }
  return { counts, jobs, failed: failed.map(r => ({ ...r, lastError: r.lastError && /^[A-Z0-9_]{1,50}$/.test(r.lastError) ? r.lastError : 'PROCESSING_FAILED' })), bytes: Number(storage[0]?.bytes || 0), designs: Number(storage[0]?.designs || 0), orders, plan, enabled: process.env.ENABLE_OPERATIONS === 'true', checkout: copy.preCartValidationActiveCheckoutEnforcementHas };
}
export const action = orderAction;
export default function Operations() {
  const d = useLoaderData<typeof loader>(), result = useActionData<typeof action>(), navigation = useNavigation();
  const [requestId, setRequestId] = useState('');
  useEffect(() => { setRequestId(crypto.randomUUID()); }, [result]);
  return <main className="ao"><header><div><p className="ao-eyebrow">{copy.aevowIntegrationHealth}</p><h1>{copy.orderOperations}</h1><p>{copy.durableProcessingRecoveryAndPilotCapacity}</p></div><nav><Link to="/app/orders">{copy.configuredOrders}</Link><Link to="/app/catalog">{copy.catalog}</Link><Link to="/app">{copy.overview}</Link></nav></header>
    {result && <p role={result.ok ? 'status' : 'alert'} className={result.ok ? 'ao-message' : 'ao-alert'}>{result.message}</p>}
    <section className="ao-status-grid"><div className="ao-card"><h2>{copy.processing}</h2><strong>{d.enabled ? copy.scheduledProcessingEnabled : copy.scheduledProcessingDisabled}</strong><p>{copy.workerEvery5MinutesReconciliationEvery15}</p></div><div className="ao-card"><h2>{copy.storedEvidence}</h2><strong>{d.orders} {copy.configuredOrders2}</strong><p>{d.designs} {copy.savedDesigns}{(d.bytes / 1048576).toFixed(2)} {copy.mibOfPreviewData}</p><p>{copy.historicalDesignsAndPreviewsAreRetained}</p></div><div className="ao-card"><h2>{copy.storeAndCheckout}</h2><strong>{d.plan?.publicDisplayName || 'Plan unavailable'}</strong><p>{d.plan?.partnerDevelopment ? copy.developmentStore : copy.merchantStore} · {d.plan?.shopifyPlus ? copy.plusCapabilityReported : copy.plusCapabilityNotConfirmed}</p><p>{d.checkout}</p></div></section>
    <section className="ao-card"><h2>{copy.durableInbox}</h2>{d.counts.length ? <dl>{d.counts.map(c => <div key={c.status}><dt>{c.status.replaceAll('_', ' ')}</dt><dd>{c._count}</dd></div>)}</dl> : <p>{copy.noOrderEventsReceived}</p>}</section>
    <section className="ao-card"><h2>{copy.scheduledJobs}</h2>{d.jobs.length ? d.jobs.map(j => <article key={j.kind}><strong>{j.kind}</strong><p>{copy.lastCompleted}{j.lastSuccessAt ? new Date(j.lastSuccessAt).toLocaleString() : copy.notYetCompleted}</p>{j.leaseUntil && new Date(j.leaseUntil) > new Date() && <p>{copy.processingLeaseActive}</p>}{j.lastError && <p className="ao-alert">{j.lastError}</p>}</article>) : <p>{copy.noProcessingTickHasCompletedVerifyThe}</p>}</section>
    <section className="ao-card"><h2>{copy.failedReceipts}</h2>{d.failed.length ? d.failed.map(r => <article key={r.id}><strong>{r.topic}</strong><p>{r.lastError} · {r.attempts} {copy.attempts}</p><Form method="post"><input type="hidden" name="intent" value="retry" /><input type="hidden" name="requestId" value={requestId} /><input type="hidden" name="receiptId" value={r.id} /><button disabled={navigation.state !== 'idle' || !requestId}>{copy.queueAnotherAttempt}</button></Form></article>) : <p>{copy.noFailedOrTerminalReceipts}</p>}</section>
    <section className="ao-card"><h2>{copy.freePilotLimits}</h2><p>{copy.storefrontBrowsing300RequestsMinutePerShop}</p><p>{copy.hostingCreditUsageMustAlsoBeChecked}</p><p>{copy.reconciliationUsesTheGrantedRecentOrderAccess}</p></section>
  </main>;
}
