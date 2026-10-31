import { createHmac } from 'node:crypto';
export default async function () {
  if (process.env.ENABLE_OPERATIONS !== 'true') return new Response(null, { status: 204 });
  const secret = process.env.CONFIGURATION_SIGNING_SECRET, origin = process.env.SHOPIFY_APP_URL;
  if (!secret || secret.length < 32 || !origin) return new Response(null, { status: 503 });
  const timestamp = String(Date.now()), body = JSON.stringify({ job: 'tick' });
  const signature = createHmac('sha256', secret).update(`aevow-operations-v1\n${timestamp}\n${body}`).digest('hex');
  const response = await fetch(`${origin.replace(/\/$/, '')}/internal/operations`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Aevow-Timestamp': timestamp, 'X-Aevow-Signature': signature }, body, signal: AbortSignal.timeout(25_000) });
  if (!response.ok) throw new Error('OPERATIONS_TICK_FAILED');
  return new Response(null, { status: 204 });
}
export const config = { schedule: '*/5 * * * *' };
