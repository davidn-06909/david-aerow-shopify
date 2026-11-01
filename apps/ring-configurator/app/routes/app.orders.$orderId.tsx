import copy from '../locales/en.json';
import { useEffect, useState } from 'react';
import type { LoaderFunctionArgs } from 'react-router';
import { Form, Link, useActionData, useLoaderData, useNavigation } from 'react-router';
import prisma from '../db.server';
import { merchant } from '../services/merchant.server';
import { orderAction } from '../services/order-management.server';
import { orderId, reviewGate, type AuditEvidence, type OrderFacts } from '../services/order-lifecycle';
import { formatOrderMoney } from '../services/money-display';
import { manufacturingEligibility } from '../services/manufacturing.server';
import type { SavedDesign, Selection, Quote } from '../../shared/contract';
import '../styles/orders.css';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await merchant(request);
  let id: string; try { id = orderId(params.orderId); } catch { throw new Response(copy.orderNotFound, { status: 404 }); }
  const record = await prisma.configuredOrder.findUnique({ where: { shop_orderId: { shop: session.shop, orderId: id } }, include: { audits: { orderBy: { version: 'desc' }, take: 30 }, actions: { orderBy: { createdAt: 'desc' }, take: 30 }, manufacturingDecisions: { orderBy: { createdAt: 'desc' }, take: 100 } } });
  if (!record) throw new Response(copy.thisConfiguredOrderHasNotBeenSynchronized, { status: 404 });
  const facts = record.facts as unknown as OrderFacts;
  const fittingState = await prisma.fittingState.findUnique({ where: { shop: session.shop }, select: { activeVersion: true } });
  const associations = await prisma.orderDesign.findMany({ where: { shop: session.shop, orderId: id }, include: { design: true } });
  const groups = associations.map(a => {
    const s = a.design.snapshot as unknown as SavedDesign & { selection: Selection; settingTitle?: string; items: { id: string; properties: Record<string, string> }[]; prices: Quote['prices'];
      fittingEvidence?: { assemblyId: string; headRevision: string; drawingDigest: string; stoneMeasurements: { lengthMm: number; widthMm: number; depthMm: number }; measurementDigest: string; approvalDigest: string; approvedBy: string; approvedAt: string } };
    const gate = manufacturingEligibility({ paymentState: facts.paymentState, cancelled: facts.cancelled, refunded: facts.refunded,
      verification: record.verification, associationStatus: a.status, fittingStatus: s.fittingStatus,
      fittingReleaseId: s.fittingReleaseId, activeFittingReleaseId: fittingState?.activeVersion });
    const decisions = record.manufacturingDecisions.filter(v => v.configurationId === a.configurationId);
    return { id: a.configurationId, designId: a.designId, status: a.status, selection: s.selection, title: s.settingTitle || s.items?.[0]?.properties.Setting || 'Ring', assetVersion: s.assetVersion, ruleVersion: s.ruleVersion, catalogVersion: s.catalogVersion,
      fittingStatus: s.fittingStatus || 'visual-unverified', fittingReleaseId: s.fittingReleaseId, fittingApprovalId: s.fittingApprovalId,
      fittingEvidence: s.fittingEvidence, manufacturingGate: gate,
      manufacturingDecision: decisions[0] ? { decision: decisions[0].decision, actor: decisions[0].actor, reason: decisions[0].reason,
        current: gate.ready && decisions[0].auditId === record.audits[0]?.id && decisions[0].fitReleaseId === s.fittingReleaseId } : null,
      price: s.prices?.total, diamond: s.diamond?.title || s.items?.find(i => i.properties._aevow_role === 'diamond')?.properties.Diamond,
      preview: a.design.previewUrl?.endsWith(`/previews/${a.design.id}`) ? `${process.env.SHOPIFY_APP_URL}/previews/${a.design.id}` : a.design.previewUrl };
  });
  // Do not serialize signed references into the administrative page's view model.
  return { shop: session.shop, id, name: record.name, version: record.version, verification: record.verification, synchronizedAt: record.synchronizedAt.toISOString(), sourceUpdatedAt: record.sourceUpdatedAt.toISOString(), gate: reviewGate(facts, record.verification), facts: { ...facts, lines: facts.lines.map(l => ({ variant: String(l.variant_id), quantity: l.quantity, role: l.properties?.find(p => p.name === '_aevow_role')?.value as string || 'Unrecognized component', unitPrice: l.unitPrice, discountedTotal: l.discountedTotal })) }, groups, audits: record.audits.map(a => ({ id: a.id, source: a.source, verification: a.verification, evidence: a.evidence as unknown as AuditEvidence, createdAt: a.createdAt.toISOString() })), actions: record.actions.map(a => ({ id: a.id, actor: a.actor, decision: a.decision, reason: a.reason, auditId: a.auditId, createdAt: a.createdAt.toISOString() })),
    manufacturingHistory: record.manufacturingDecisions.map(v => ({ id: v.id, configurationId: v.configurationId, decision: v.decision, reason: v.reason, actor: v.actor, auditId: v.auditId, fitReleaseId: v.fitReleaseId, createdAt: v.createdAt.toISOString() })) };
}
export const action = orderAction;
export default function OrderDetail() {
  const d = useLoaderData<typeof loader>(), result = useActionData<typeof action>(), navigation = useNavigation();
  const [requestId, setRequestId] = useState('');
  useEffect(() => { setRequestId(crypto.randomUUID()); }, [d.version, result]);
  const busy = navigation.state !== 'idle';
  return <main className="ao"><header><div><p className="ao-eyebrow">{copy.aevowConfiguredOrder}</p><h1>{d.name} {d.facts.test && <span className="ao-badge">{copy.developmentTest}</span>}</h1><p>{copy.lastChecked2}{new Date(d.synchronizedAt).toLocaleString()}</p></div><nav><Link to="/app/orders">{copy.allConfiguredOrders}</Link><a target="_top" href={`https://admin.shopify.com/store/${d.shop.replace('.myshopify.com', '')}/orders/${d.id}`}>{copy.openShopifyOrder}</a></nav></header>
    {result && <p role={result.ok ? 'status' : 'alert'} className={result.ok ? 'ao-message' : 'ao-alert'}>{result.message}</p>}
    <section className="ao-status-grid"><div className="ao-card"><h2>{copy.payment}</h2><strong>{d.facts.paymentState}</strong><p>{copy.orderTotal}{formatOrderMoney(d.facts.currency, d.facts.total)}</p><p>{copy.refunded}{formatOrderMoney(d.facts.currency, d.facts.refunded)}</p>{d.facts.cancelled && <strong>{copy.cancelled}</strong>}</div><div className="ao-card"><h2>{copy.components}</h2><strong>{d.verification === 'verified' ? copy.componentsVerified : copy.reviewRequired}</strong><p>{d.gate}</p></div><div className="ao-card"><h2>{copy.merchantReview}</h2><strong>{d.actions[0]?.auditId === d.audits[0]?.id ? d.actions[0].decision.replaceAll('_', ' ') : copy.notReviewedForThisAudit}</strong><p>{copy.aReviewDecisionDoesNotApproveManufacturing}</p></div></section>
    <div className="ao-actions"><Form method="post"><input type="hidden" name="intent" value="recheck" /><button disabled={busy}>{busy ? 'Checking…' : copy.recheckCurrentShopifyOrder}</button></Form><button type="button" onClick={() => window.print()}>{copy.printConfigurationReviewSheet}</button></div>
    {d.groups.map(g => <section className="ao-card ao-design" key={g.id}>
      {g.preview && <img src={g.preview} alt={`Saved preview for ${g.title}`} />}
      <div><h2>{g.title}</h2><dl>{Object.entries({
        Band: g.selection.shank, Metal: g.selection.metal, Shape: g.selection.shape, Diamond: g.diamond || g.selection.diamondId,
        'Ring size': g.selection.size, Engraving: g.selection.engravingEnabled ? g.selection.engraving : 'None',
        'Design reference': g.designId, 'Cart group': g.id, 'Model version': g.assetVersion, 'Rule version': g.ruleVersion,
        'Catalog version': g.catalogVersion, 'Fitting status': g.fittingStatus, 'Fitting release': g.fittingReleaseId,
        'Manufacturer approval': g.fittingApprovalId,
      }).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v || 'Not recorded'}</dd></div>)}</dl>
      {g.fittingEvidence ? <><h3>Manufacturer evidence</h3><dl>{Object.entries({
        'Head revision': g.fittingEvidence.headRevision, 'Assembly': g.fittingEvidence.assemblyId,
        'Stone measurements (mm)': `${g.fittingEvidence.stoneMeasurements.lengthMm} × ${g.fittingEvidence.stoneMeasurements.widthMm} × ${g.fittingEvidence.stoneMeasurements.depthMm}`,
        'Approved by': g.fittingEvidence.approvedBy, 'Approved at': new Date(g.fittingEvidence.approvedAt).toLocaleString(),
        'Drawing SHA-256': g.fittingEvidence.drawingDigest, 'Measurement SHA-256': g.fittingEvidence.measurementDigest,
        'Approval SHA-256': g.fittingEvidence.approvalDigest,
      }).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></>
        : <p className="ao-alert">{copy.configurationReviewSheetRepresentativePreviewPhysicalStone}</p>}
      <p className={g.manufacturingGate.ready ? 'ao-message' : 'ao-alert'}><strong>Manufacturing gate:</strong> {g.manufacturingGate.reason}
        {g.manufacturingDecision && <span> Latest decision: {g.manufacturingDecision.current ? g.manufacturingDecision.decision : `stale ${g.manufacturingDecision.decision}`} by {g.manufacturingDecision.actor}.</span>}</p>
      {g.price && <p>{copy.originalQuotedTotal}{formatOrderMoney(g.price.currency, g.price.amount / 10 ** (new Intl.NumberFormat('en', { style: 'currency', currency: g.price.currency }).resolvedOptions().maximumFractionDigits || 0))}{copy.theShopifyOrderTotalIncludesItsActual}</p>}
      <Form method="post" className="ao-manufacturing-form"><h3>Record manufacturer review</h3><input type="hidden" name="intent" value="manufacturing" />
        <input type="hidden" name="requestId" value={requestId} /><input type="hidden" name="auditId" value={d.audits[0]?.id} />
        <input type="hidden" name="configurationId" value={g.id} /><input type="hidden" name="version" value={d.version} />
        <label>Decision<select name="decision" required><option value="hold">Hold</option><option value="approved" disabled={!g.manufacturingGate.ready}>Approve for manufacture</option><option value="rejected">Reject</option></select></label>
        <label>Reason<textarea name="reason" required minLength={5} maxLength={1000} rows={3} /></label>
        <button disabled={busy || !requestId}>Record decision</button><small>This action does not fulfill, cancel, or refund the Shopify order.</small>
      </Form></div>
    </section>)}
    <section className="ao-card"><h2>{copy.purchasedComponents}</h2><div className="ao-table-wrap"><table><thead><tr><th>{copy.role}</th><th>{copy.variant}</th><th>{copy.quantity}</th><th>{copy.originalUnitPrice}</th><th>{copy.discountedLineTotal}</th></tr></thead><tbody>{d.facts.lines.map((l, i) => <tr key={i}><td>{l.role}</td><td>{l.variant}</td><td>{l.quantity}</td><td>{formatOrderMoney(d.facts.currency, l.unitPrice)}</td><td>{formatOrderMoney(d.facts.currency, l.discountedTotal)}</td></tr>)}</tbody></table></div></section>
    <section className="ao-card ao-review-form"><h2>{copy.recordAReviewDecision}</h2><Form method="post"><input type="hidden" name="intent" value="review" /><input type="hidden" name="requestId" value={requestId} /><input type="hidden" name="auditId" value={d.audits[0]?.id} /><input type="hidden" name="version" value={d.version} /><label>{copy.decision}<select name="decision" required><option value="needs_attention">{copy.needsAttention}</option><option value="acknowledged">{copy.reviewedAndAcknowledged}</option></select></label><label>{copy.reason}<textarea name="reason" required minLength={5} maxLength={1000} rows={3} /></label><button disabled={busy || !requestId}>{copy.recordDecision}</button></Form></section>
    <section className="ao-card"><h2>{copy.auditHistory}</h2>{d.audits.map(a => <details key={a.id} open={a.id === d.audits[0]?.id}><summary>{new Date(a.createdAt).toLocaleString()} · {a.verification.replaceAll('_', ' ')} · {a.source}</summary>{!a.evidence.warnings.length && a.evidence.groups.every(g => !g.discrepancies.length) ? <p>{copy.allSavedComponentVariantsQuantitiesAndConfiguration}</p> : <ul>{a.evidence.warnings.map((w, i) => <li key={`w${i}`}>{w}</li>)}{a.evidence.groups.flatMap(g => g.discrepancies.map((v, i) => <li key={`${g.configurationId}${i}`}>{g.configurationId}: {v}</li>))}</ul>}</details>)}</section>
    <section className="ao-card"><h2>{copy.merchantDecisions}</h2>{d.actions.length ? d.actions.map(a => <article key={a.id}><strong>{a.decision.replaceAll('_', ' ')}</strong><p>{a.reason}</p><small>{copy.operator}{a.actor} · {new Date(a.createdAt).toLocaleString()} {copy.audit}{a.auditId}</small></article>) : <p>{copy.noReviewDecisionRecorded}</p>}</section>
    <section className="ao-card"><h2>Manufacturing decision history</h2>{d.manufacturingHistory.length ? d.manufacturingHistory.map(a => <article key={a.id}><strong>{a.decision} · group {a.configurationId}</strong><p>{a.reason}</p><small>{a.actor} · {new Date(a.createdAt).toLocaleString()} · audit {a.auditId} · fit release {a.fitReleaseId || 'none'}</small></article>) : <p>No manufacturing decision has been recorded.</p>}</section>
  </main>;
}
