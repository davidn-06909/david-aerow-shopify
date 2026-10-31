import prisma from '../db.server';
import { PilotError } from './errors.server';
/** PostgreSQL makes the limit shared across instances. No untrusted client IP. */
export async function requestLimit(shop: string, key: string, maximum: number, seconds = 60) {
  const window = new Date(Math.floor(Date.now() / (seconds * 1000)) * seconds * 1000);
  const bucket = await prisma.requestBucket.upsert({ where: { shop_key_window: { shop, key, window } }, create: { shop, key, window, expiresAt: new Date(window.getTime() + seconds * 1000 + 86400_000) }, update: { count: { increment: 1 } }, select: { count: true } });
  if (bucket.count > maximum) {
    const error = new PilotError('RATE_LIMITED', seconds >= 86400 ? 'The ring service has reached today’s pilot allowance. Keep your design link and contact the store or try again later.' : 'The ring service is busy. Keep your selections and retry shortly.', 429);
    error.retryAfter = Math.max(1, Math.ceil((window.getTime() + seconds * 1000 - Date.now()) / 1000));
    throw error;
  }
}
