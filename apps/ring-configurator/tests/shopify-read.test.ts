import { afterEach, expect, test, vi } from 'vitest';
import { shopifyRead } from '../app/services/shopify-read.server';
afterEach(() => vi.useRealTimers());
test('read throttles retry with a bound and preserve the successful Shopify response', async () => {
  vi.useFakeTimers(); let calls = 0;
  const admin = { graphql: async () => ++calls === 1 ? Response.json({ errors: [{ extensions: { code: 'THROTTLED' } }] }, { status: 429 }) : Response.json({ data: { product: { id: '123' } } }) };
  const pending = shopifyRead(admin, 'query { product { id } }');
  await vi.runAllTimersAsync(); expect((await (await pending).json()).data.product.id).toBe('123'); expect(calls).toBe(2);
});
test('access and schema errors are returned without retrying', async () => {
  let calls = 0;
  const response = await shopifyRead({ graphql: async () => { calls++; return Response.json({ errors: [{ message: 'Access denied' }] }); } }, 'query { shop { name } }');
  expect((await response.json()).errors[0].message).toBe('Access denied'); expect(calls).toBe(1);
});
