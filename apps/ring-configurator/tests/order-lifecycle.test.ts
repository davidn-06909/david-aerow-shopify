import { describe, expect, it } from 'vitest';
import { orderId, retryDelay, reviewGate, safeFailure } from '../app/services/order-lifecycle';
import { jobSignature, verifyJob } from '../app/services/jobs-auth.server';
import { pricesChanged } from '../storefront/price-confirmation';
import type { Quote } from '../shared/contract';

describe('order lifecycle boundaries', () => {
  it('accepts Shopify order IDs without allowing arbitrary GraphQL identifiers', () => {
    expect(orderId('gid://shopify/Order/18981061460216')).toBe('18981061460216');
    for (const value of ['', '0', '-1', '1.5', '1/../../x', 'gid://shopify/Product/123', '1 OR 1=1']) expect(() => orderId(value)).toThrow();
  });
  it('bounds exponential retries with jitter', () => {
    expect(retryDelay(1, 0)).toBe(30000); expect(retryDelay(2, 0)).toBe(60000);
    expect(retryDelay(99, 1)).toBe(3605000);
  });
  it.each([
    ['PAID', false, '0', 'verified', 'Components verified — physical fitting unverified'],
    ['PENDING', false, '0', 'verified', 'Payment requires attention'],
    ['PAID', true, '0', 'verified', 'Cancelled'],
    ['PAID', false, '45', 'verified', 'Refund recorded — review required'],
    ['PAID', false, '0', 'review_required', 'Configuration requires review'],
  ])('keeps payment, cancellation, verification and manufacturing separate (%s/%s)', (paymentState, cancelled, refunded, verification, label) => {
    expect(reviewGate({ paymentState, cancelled, refunded }, verification)).toBe(label);
  });
  it('never copies raw failures into operational logs', () => {
    expect(safeFailure(new Error('postgresql://private/password engraving=secret'))).toBe('ORDER_SYNC_FAILED');
    expect(safeFailure({ code: 'SHOPIFY_THROTTLED' })).toBe('SHOPIFY_THROTTLED');
  });
});
describe('scheduled job authentication', () => {
  const secret = 'a'.repeat(64), timestamp = '1793448000000', body = '{"job":"tick"}', now = Number(timestamp);
  it('accepts an exact, fresh server signature', () => expect(verifyJob(timestamp, jobSignature(timestamp, body, secret), body, secret, now)).toBe(true));
  it('rejects tampering, expired signatures and incomplete server configuration', () => {
    const signature = jobSignature(timestamp, body, secret);
    expect(verifyJob(timestamp, signature, '{}', secret, now)).toBe(false);
    expect(verifyJob(timestamp, signature, body, secret, now + 61000)).toBe(false);
    expect(verifyJob(timestamp, signature, body, 'short', now)).toBe(false);
    expect(verifyJob(timestamp, 'malformed', body, secret, now)).toBe(false);
  });
});
describe('purchase price confirmation', () => {
  const prices = { setting: { amount: 245000, currency: 'USD' }, diamond: { amount: 310000, currency: 'USD' }, engraving: { amount: 4500, currency: 'USD' }, total: { amount: 559500, currency: 'USD' } } as Quote['prices'];
  it('allows unchanged canonical prices', () => expect(pricesChanged(prices, structuredClone(prices))).toBe(false));
  it('requires confirmation even when changed component prices cancel out in the total', () => {
    const changed = structuredClone(prices); changed.setting.amount += 100; changed.diamond.amount -= 100;
    expect(pricesChanged(prices, changed)).toBe(true);
  });
  it('never treats two currencies as interchangeable', () => {
    const changed = structuredClone(prices); changed.total.currency = 'CAD'; expect(pricesChanged(prices, changed)).toBe(true);
  });
});
