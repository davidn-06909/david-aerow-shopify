import copy from '../locales/en.json';
import type { LoaderFunctionArgs } from 'react-router';
import { Form, Link, useLoaderData, useSearchParams } from 'react-router';
import type { Prisma } from '@prisma/client';
import prisma from '../db.server';
import { merchant } from '../services/merchant.server';
import { orderAction, orderFilters } from '../services/order-management.server';
import type { OrderFacts } from '../services/order-lifecycle';
import { formatOrderMoney } from '../services/money-display';
import '../styles/orders.css';

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await merchant(request);
  const parsed = orderFilters.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) throw new Response(copy.invalidOrderFilters, { status: 400 });
  const f = parsed.data;
  const where: Prisma.ConfiguredOrderWhereInput = { shop: session.shop, ...(f.q ? { name: { contains: f.q, mode: 'insensitive' } } : {}), ...(f.payment ? { paymentState: f.payment } : {}), ...(f.verification ? { verification: f.verification } : {}), ...(f.setting ? { settingIds: { has: f.setting } } : {}) };
  const [count, orders] = await Promise.all([
    prisma.configuredOrder.count({ where }),
    prisma.configuredOrder.findMany({ where, orderBy: [{ synchronizedAt: 'desc' }, { id: 'desc' }], skip: (f.page - 1) * 25, take: 25, include: { audits: { orderBy: { version: 'desc' }, take: 1, select: { id: true } }, actions: { orderBy: { createdAt: 'desc' }, take: 1, select: { decision: true, auditId: true } } } }),
  ]);
  const associations = await prisma.orderDesign.findMany({ where: { shop: session.shop, orderId: { in: orders.map(o => o.orderId) } }, include: { design: { select: { previewUrl: true, id: true, snapshot: true } } } });
  return { filters: f, count, orders: orders.map(o => {
    const a = associations.find(a => a.orderId === o.orderId);
    const s = a?.design.snapshot as { settingTitle?: string; diamond?: { title: string } } | undefined;
    const facts = o.facts as unknown as OrderFacts;
    return { id: o.orderId, name: o.name, paymentState: o.paymentState, cancelled: o.cancelled, verification: o.verification, synchronizedAt: o.synchronizedAt.toISOString(), test: facts.test, total: facts.total, currency: facts.currency, setting: s?.settingTitle || o.settingIds.join(', '), diamond: s?.diamond?.title, preview: a?.design.previewUrl?.endsWith(`/previews/${a.design.id}`) ? `${process.env.SHOPIFY_APP_URL}/previews/${a.design.id}` : a?.design.previewUrl, review: o.actions[0]?.auditId === o.audits[0]?.id ? o.actions[0].decision : 'unreviewed' };
  }) };
}
export const action = orderAction;
export default function Orders() {
  const d = useLoaderData<typeof loader>(), [params] = useSearchParams();
  const pageLink = (page: number) => { const p = new URLSearchParams(params); p.set('page', String(page)); return `?${p}`; };
  return <main className="ao"><header><div><p className="ao-eyebrow">{copy.aevowOperations}</p><h1>{copy.configuredOrders}</h1><p>{copy.inspectPurchasedDesignsAndResolveConfigurationIssues}</p></div><nav><Link to="/app">{copy.overview}</Link><Link to="/app/catalog">{copy.catalog}</Link><Link to="/app/operations">{copy.operationsHealth}</Link></nav></header>
    <Form method="get" className="ao-filters"><label>{copy.orderNumber}<input name="q" defaultValue={d.filters.q} maxLength={50} /></label><label>{copy.payment}<select name="payment" defaultValue={d.filters.payment}><option value="">{copy.allPayments}</option>{['PENDING', 'AUTHORIZED', 'PARTIALLY_PAID', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'VOIDED', 'EXPIRED'].map(v => <option key={v}>{v}</option>)}</select></label><label>{copy.verification}<select name="verification" defaultValue={d.filters.verification}><option value="">{copy.allResults}</option><option value="verified">{copy.componentsVerified}</option><option value="review_required">{copy.needsAttention}</option></select></label><label>{copy.setting}<select name="setting" defaultValue={d.filters.setting}><option value="">{copy.allSettings}</option><option value="lumen">{copy.theLumen}</option><option value="solitaire">{copy.theAevowSolitaire}</option></select></label><button type="submit">{copy.filterOrders}</button></Form>
    <p>{d.count} {copy.configured}{d.count === 1 ? 'order' : 'orders'}{copy.paymentComponentVerificationAndMerchantReviewAre}</p>
    {!d.orders.length ? <section className="ao-card"><h2>{copy.noMatchingOrders}</h2><p>{copy.ordersAppearAfterDurableProcessingOrReconciliation}</p></section> : <div className="ao-table-wrap"><table><thead><tr><th>{copy.order}</th><th>{copy.ring}</th><th>{copy.payment}</th><th>{copy.verification}</th><th>{copy.review}</th><th>{copy.lastChecked}</th></tr></thead><tbody>{d.orders.map(o => <tr key={o.id}><td><Link to={`/app/orders/${o.id}`}>{o.name}</Link>{o.test && <small>{copy.developmentTest}</small>}</td><td><div className="ao-ring">{o.preview && <img src={o.preview} alt={copy.savedRingPreview} loading="lazy" />}<div>{o.setting}<small>{o.diamond || 'See configuration details'}</small></div></div></td><td>{o.paymentState}{o.cancelled && <small>{copy.cancelled}</small>}<small>{formatOrderMoney(o.currency, o.total)}</small></td><td><span className={`ao-badge ${o.verification === 'verified' ? 'ao-good' : 'ao-warning'}`}>{o.verification === 'verified' ? copy.componentsVerified : copy.needsAttention}</span></td><td>{o.review.replaceAll('_', ' ')}</td><td><time dateTime={o.synchronizedAt}>{new Date(o.synchronizedAt).toLocaleString()}</time></td></tr>)}</tbody></table></div>}
    <nav aria-label={copy.orderPages} className="ao-pagination">{d.filters.page > 1 && <Link to={pageLink(d.filters.page - 1)}>{copy.previous}</Link>}<span>{copy.page}{d.filters.page} {copy.of}{Math.max(1, Math.ceil(d.count / 25))}</span>{d.filters.page * 25 < d.count && <Link to={pageLink(d.filters.page + 1)}>{copy.next}</Link>}</nav>
  </main>;
}
