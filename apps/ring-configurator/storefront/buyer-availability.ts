import type { Bootstrap } from '../shared/contract';

export interface BuyerAvailabilityOptions {
  root: string;
  signal?: AbortSignal;
  handles?: string[];
  adminCatalog?: Bootstrap;
  fetcher?: typeof fetch;
}

/** Storefront market/country availability may be narrower than Admin inventory. Prices remain server-owned. */
export async function buyerAvailability(catalog: Bootstrap, options: BuyerAvailabilityOptions) {
  if (catalog.mode !== 'connected') return { catalog, narrowed: false, failed: false };
  const fetcher = options.fetcher || fetch;
  const handles = [...new Set(options.handles || [catalog.setting.handle, ...catalog.diamonds.map(diamond => diamond.handle)])];
  const products = new Map<string, Map<string, boolean> | null>();
  await Promise.all(handles.map(async handle => {
    try {
      const response = await fetcher(`${options.root}products/${encodeURIComponent(handle)}.js`, { signal: options.signal, credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('Product unavailable');
      const product = await response.json() as { variants?: { id: number | string; available: boolean }[] };
      if (!Array.isArray(product.variants)) throw new Error('Invalid storefront product');
      products.set(handle, new Map(product.variants.map(variant => [String(variant.id), variant.available === true])));
    } catch (error) {
      if (options.signal?.aborted || (error as Error).name === 'AbortError') throw error;
      products.set(handle, null);
    }
  }));
  const admin = options.adminCatalog || catalog;
  let narrowed = false;
  const setting = { ...catalog.setting, variants: catalog.setting.variants.map(variant => {
    if (!products.has(catalog.setting.handle)) return variant;
    const server = admin.setting.variants.find(candidate => candidate.id === variant.id)?.available === true;
    const available = server && products.get(catalog.setting.handle)?.get(variant.id) === true;
    if (server && !available) narrowed = true;
    return { ...variant, available };
  }) };
  const diamonds = catalog.diamonds.map(diamond => {
    if (!products.has(diamond.handle)) return diamond;
    const server = admin.diamonds.find(candidate => candidate.id === diamond.id)?.available === true;
    const available = server && products.get(diamond.handle)?.get(diamond.id) === true;
    if (server && !available) narrowed = true;
    return { ...diamond, available };
  });
  return { catalog: { ...catalog, setting, diamonds }, narrowed, failed: [...products.values()].some(product => product === null) };
}
