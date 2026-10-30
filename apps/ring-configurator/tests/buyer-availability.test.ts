import { describe, expect, it, vi } from 'vitest';
import type { Bootstrap } from '../shared/contract';
import { buyerAvailability } from '../storefront/buyer-availability';
const catalog = { mode: 'connected', setting: { handle: 'lumen', variants: [{ id: '1', available: true }, { id: '2', available: false }] }, diamonds: [{ id: '3', handle: 'round', available: true }, { id: '4', handle: 'oval', available: true }] } as Bootstrap;
const response = (variants: { id: string; available: boolean }[]) => new Response(JSON.stringify({ variants, price: 999 }), { headers: { 'Content-Type': 'application/json' } });
describe('buyer market availability', () => {
  it('narrows Admin inventory by the exact public variant without making unavailable server stock purchasable', async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL) => String(url).includes('lumen') ? response([{ id: '1', available: true }, { id: '2', available: true }]) : String(url).includes('round') ? response([{ id: '3', available: false }]) : response([{ id: '4', available: true }]));
    const checked = await buyerAvailability(catalog, { root: '/en-us/', fetcher });
    expect(fetcher).toHaveBeenCalledTimes(3); expect(String(fetcher.mock.calls[0][0])).toContain('/en-us/products/');
    expect(checked.catalog.setting.variants.map(variant => variant.available)).toEqual([true, false]);
    expect(checked.catalog.diamonds.map(diamond => diamond.available)).toEqual([false, true]); expect(checked.narrowed).toBe(true);
    expect(checked.catalog.setting.variants[0]).toEqual(catalog.setting.variants[0]);
  });
  it('fails closed for a missing product while leaving other checked variants intact', async () => {
    const checked = await buyerAvailability(catalog, { root: '/', fetcher: vi.fn(async (url: RequestInfo | URL) => String(url).includes('round') ? new Response('', { status: 404 }) : response([{ id: '1', available: true }, { id: '4', available: true }])) });
    expect(checked.failed).toBe(true); expect(checked.catalog.diamonds[0].available).toBe(false); expect(checked.catalog.diamonds[1].available).toBe(true);
  });
  it('never fetches storefront availability for the explicit read-only preview', async () => {
    const fetcher = vi.fn(); const preview = { ...catalog, mode: 'read-only' as const };
    expect((await buyerAvailability(preview, { root: '/', fetcher })).catalog).toBe(preview); expect(fetcher).not.toHaveBeenCalled();
  });
  it('propagates cancellation rather than changing availability during navigation', async () => {
    const abort = new AbortController(); abort.abort();
    await expect(buyerAvailability(catalog, { root: '/', signal: abort.signal, fetcher: vi.fn(async () => { throw new DOMException('Aborted', 'AbortError'); }) })).rejects.toThrow('Aborted');
  });
});
