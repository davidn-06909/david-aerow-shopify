import copy from '../locales/en.json';
import type { AdminClient } from './catalog.server';
import { shopifyRead } from './shopify-read.server';
import { PilotError } from './errors.server';
import { orderId, type OrderFacts } from './order-lifecycle';

const ORDER_QUERY = `query ConfiguredOrder($id: ID!, $after: String) {
  order(id: $id) {
    id name updatedAt displayFinancialStatus cancelledAt test currencyCode
    currentTotalPriceSet { shopMoney { amount currencyCode } }
    totalRefundedSet { shopMoney { amount currencyCode } }
    lineItems(first: 100, after: $after) {
      nodes { variant { id } product { id } quantity currentQuantity customAttributes { key value }
        originalUnitPriceSet { shopMoney { amount } } priceAfterAllDiscountsBeforeTaxesSet { shopMoney { amount } } }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;
const manufacturingKeys = new Set(['_configuration_id', '_aevow_design_id', '_aevow_reference', '_aevow_checkout', '_aevow_asset_version', '_aevow_catalog_version', '_aevow_setting_id', '_aevow_band_id', '_aevow_rule_version', '_aevow_role', '_aevow_preview', 'Setting', 'Band', 'Metal', 'Shape', 'Ring size', '3D fitting', 'Engraving', 'Diamond', 'Certificate']);
export async function readOrder(admin: AdminClient, id: string): Promise<OrderFacts> {
  const lines: OrderFacts['lines'] = [];
  let after: string | undefined;
  const cursors = new Set<string>();
  let facts: Omit<OrderFacts, 'lines'> | undefined;
  for (let page = 0; page < 10; page++) {
    const response = await shopifyRead(admin, ORDER_QUERY, { variables: { id: `gid://shopify/Order/${orderId(id)}`, after } });
    const body = await response.json();
    if (!response.ok || body.errors?.length) throw new PilotError('ORDER_READ_FAILED', copy.shopifyCouldNotReturnThisOrderCheck, 503);
    const o = body.data?.order;
    if (!o) throw new PilotError('ORDER_UNAVAILABLE', copy.shopifyDidNotReturnThisOrderIt, 404);
    if (!Number.isFinite(Date.parse(o.updatedAt))) throw new PilotError('ORDER_READ_FAILED', copy.shopifyReturnedAnIncompleteOrder, 503);
    if (facts && facts.updatedAt !== o.updatedAt) throw new PilotError('ORDER_CHANGED_DURING_READ', copy.theOrderChangedWhileLoadingRetryTo, 409);
    facts = { id: orderId(o.id), name: o.name, updatedAt: o.updatedAt, paymentState: o.displayFinancialStatus, cancelled: Boolean(o.cancelledAt), test: o.test, currency: o.currencyCode, total: o.currentTotalPriceSet.shopMoney.amount, refunded: o.totalRefundedSet.shopMoney.amount };
    for (const l of o.lineItems.nodes) {
      if (l.customAttributes.length > 80 || l.customAttributes.some((p: { key: string; value: string }) => p.key.length > 120 || p.value.length > 6000)) throw new PilotError('ORDER_PROPERTIES_TOO_LARGE', copy.orderPersonalizationRequiresManualInspectionInShopify, 422);
      lines.push({ variant_id: l.variant?.id?.split('/').pop() || 'deleted', product_id: l.product?.id?.split('/').pop(), quantity: l.quantity, currentQuantity: l.currentQuantity, properties: l.customAttributes.map((p: { key: string; value: string }, index: number) => manufacturingKeys.has(p.key) ? { name: p.key, value: p.value } : { name: `unexpected_property_${index}`, value: '[not retained]' }), unitPrice: l.originalUnitPriceSet.shopMoney.amount, discountedTotal: l.priceAfterAllDiscountsBeforeTaxesSet.shopMoney.amount });
    }
    const next = o.lineItems.pageInfo;
    if (!next.hasNextPage) return { ...facts!, lines };
    if (!next.endCursor || cursors.has(next.endCursor)) break;
    cursors.add(next.endCursor); after = next.endCursor;
  }
  throw new PilotError('ORDER_TOO_LARGE', copy.theOrderExceedsTheBoundedAuditLimit, 422);
}

export async function updatedOrderPage(admin: AdminClient, since: string, until: string, after?: string) {
  if (![since, until].every(v => Number.isFinite(Date.parse(v)))) throw new Error('INVALID_RECONCILIATION_WINDOW');
  const response = await shopifyRead(admin, `query UpdatedConfiguredOrders($query: String!, $after: String) {
    orders(first: 25, sortKey: UPDATED_AT, query: $query, after: $after) {
      nodes { id } pageInfo { hasNextPage endCursor }
    }
  }`, { variables: { query: `updated_at:>='${since}' updated_at:<='${until}'`, after } });
  const body = await response.json();
  if (!response.ok || body.errors?.length || !body.data?.orders) throw new PilotError('ORDER_RECONCILIATION_FAILED', copy.shopifyOrderReconciliationCouldNotComplete, 503);
  return { ids: body.data.orders.nodes.map((o: { id: string }) => orderId(o.id)) as string[], pageInfo: body.data.orders.pageInfo as { hasNextPage: boolean; endCursor?: string } };
}
