import { createHmac, timingSafeEqual } from 'node:crypto';
export function jobSignature(timestamp: string, body: string, secret: string) {
  return createHmac('sha256', secret).update(`aevow-operations-v1\n${timestamp}\n${body}`).digest('hex');
}
export function verifyJob(timestamp: string, signature: string, body: string, secret: string, now = Date.now()) {
  if (secret.length < 32 || !/^\d{13}$/.test(timestamp) || Math.abs(now - Number(timestamp)) > 60_000 || !/^[a-f0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(jobSignature(timestamp, body, secret), 'hex'));
}
