import type { AdminClient } from './catalog.server';
import { PilotError } from './errors.server';

/** Retry only read queries, with a bounded delay. Mutations never use this helper. */
export async function shopifyRead(admin: AdminClient, query: string, options?: { variables?: Record<string, unknown> }): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response;
    try { response = await admin.graphql(query, options); }
    catch (error) {
      const errors = (error as { body?: { errors?: { graphQLErrors?: { extensions?: { code?: string } }[] } } }).body?.errors?.graphQLErrors;
      if (!errors?.some(e => e.extensions?.code === 'THROTTLED')) throw error;
      if (attempt === 2) break;
      await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt)); continue;
    }
    const body = await response.clone().json().catch(() => null);
    const throttled = response.status === 429 || body?.errors?.some((e: { extensions?: { code?: string } }) => e.extensions?.code === 'THROTTLED');
    if (!throttled) return response;
    if (attempt === 2) break;
    const retryAfter = Number(response.headers.get('Retry-After'));
    await new Promise(resolve => setTimeout(resolve, Math.min(5000, Math.max(250, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt))));
  }
  throw new PilotError('SHOPIFY_THROTTLED', 'Shopify is busy. Please retry in a moment; your selections are retained.', 503);
}
