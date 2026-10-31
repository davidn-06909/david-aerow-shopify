import type { ActionFunctionArgs } from 'react-router';
import prisma from '../db.server';
import { authenticate } from '../shopify.server';
import { assertShopifyConfigured } from './configured.server';
import { ORDER_TOPICS, orderId } from './order-lifecycle';
import { apiError, readText } from './errors.server';

export async function receiveOrderWebhook({ request }: ActionFunctionArgs) {
  assertShopifyConfigured();
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  let raw: string;
  try { raw = await readText(request, 2_000_000); } catch (error) { return apiError(error); }
  const { shop, topic, payload, webhookId } = await authenticate.webhook(new Request(request.url, { method: 'POST', headers: request.headers, body: raw }));
  if (!webhookId || webhookId.length > 200) return new Response(null, { status: 400 });
  if (!ORDER_TOPICS.has(topic)) return new Response(null, { status: 400 });
  if (shop !== process.env.PILOT_ALLOWED_SHOP) return new Response(null, { status: 403 });
  let id: string;
  try { id = orderId(topic === 'REFUNDS_CREATE' ? payload.order_id : payload.id); }
  catch { return new Response(null, { status: 422 }); }
  // The durable inbox contains only a pointer. The worker reads current order data.
  // A failed INSERT must propagate a non-2xx response so Shopify retries delivery.
  await prisma.webhookReceipt.upsert({ where: { id: `${shop}:${topic}:${webhookId}` }, create: { id: `${shop}:${topic}:${webhookId}`, shop, topic, payload: topic === 'REFUNDS_CREATE' ? { order_id: id } : { id } }, update: {} });
  return new Response(null, { status: 200 });
}
