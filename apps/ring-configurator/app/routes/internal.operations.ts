import type { ActionFunctionArgs } from 'react-router';
import { verifyJob } from '../services/jobs-auth.server';
import { runOperations } from '../services/operations.server';
import { unauthenticated } from '../shopify.server';
import { readText, apiError } from '../services/errors.server';
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST' || process.env.ENABLE_OPERATIONS !== 'true') return new Response(null, { status: 404 });
  let body: string;
  try { body = await readText(request, 1024); } catch (error) { return apiError(error); }
  if (!verifyJob(request.headers.get('X-Aevow-Timestamp') || '', request.headers.get('X-Aevow-Signature') || '', body, process.env.CONFIGURATION_SIGNING_SECRET || '')) return new Response(null, { status: 401 });
  let input: { job?: string }; try { input = JSON.parse(body); } catch { return new Response(null, { status: 400 }); }
  if (!input || input.job !== 'tick') return new Response(null, { status: 400 });
  const shop = process.env.PILOT_ALLOWED_SHOP;
  if (!shop) return new Response(null, { status: 503 });
  const { admin } = await unauthenticated.admin(shop);
  return Response.json(await runOperations(shop, admin), { headers: { 'Cache-Control': 'no-store' } });
}
