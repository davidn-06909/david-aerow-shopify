import { afterEach, expect, it } from 'vitest';
import { createPublicKey, verify } from 'node:crypto';
import { checkoutPublicKey, signCheckoutTicket } from '../app/services/checkout-ticket.server';

const previous = process.env.CONFIGURATION_SIGNING_SECRET;
afterEach(() => { if (previous === undefined) delete process.env.CONFIGURATION_SIGNING_SECRET; else process.env.CONFIGURATION_SIGNING_SECRET = previous; });

it('binds the ring group, component variants, engraving, design and reference to a verifiable public signature', () => {
  process.env.CONFIGURATION_SIGNING_SECRET = 'local-test-secret-longer-than-thirty-two-characters';
  const ticket = signCheckoutTicket({ group: '216dade1-4f16-4503-b76a-0f8640b58330', design: 'c8c40a5c-32c0-45c4-9e75-7ff94d3cf571', reference: 'signed-quote-reference', settingVariant: '67890588942584', diamondVariant: '67913931817208', engravingVariant: '67911152632056', engraving: '3ertyui' });
  const [body, signature] = ticket.split('.');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  const key = checkoutPublicKey();
  const publicKey = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(key.public_key, 'base64url')]), type: 'spki', format: 'der' });
  expect(payload).toMatchObject({ v: 1, k: key.id, engraving: '3ertyui', setting: 'gid://shopify/ProductVariant/67890588942584', diamond: 'gid://shopify/ProductVariant/67913931817208' });
  expect(verify(null, Buffer.from(body, 'base64url'), publicKey, Buffer.from(signature, 'base64url'))).toBe(true);
  expect(verify(null, Buffer.from(JSON.stringify({ ...payload, engraving: 'changed' })), publicKey, Buffer.from(signature, 'base64url'))).toBe(false);
});
