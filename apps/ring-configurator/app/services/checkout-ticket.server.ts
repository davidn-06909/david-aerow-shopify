import { createHash, createHmac, createPrivateKey, createPublicKey, sign } from 'node:crypto';

const PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

function privateKey() {
  const secret = process.env.CONFIGURATION_SIGNING_SECRET;
  if (!secret || secret.length < 32) throw new Error('Checkout signing secret is not configured.');
  const seed = createHmac('sha256', secret).update('aevow:checkout-ed25519:v1').digest();
  return createPrivateKey({ key: Buffer.concat([PREFIX, seed]), format: 'der', type: 'pkcs8' });
}

export function checkoutPublicKey() {
  const publicBytes = createPublicKey(privateKey()).export({ format: 'der', type: 'spki' }).subarray(-32);
  return { id: createHash('sha256').update(publicBytes).digest('hex').slice(0, 16), public_key: publicBytes.toString('base64url') };
}

export interface CheckoutTicketInput {
  group: string;
  design: string;
  reference: string;
  settingVariant: string;
  diamondVariant: string;
  engravingVariant?: string;
  engraving?: string;
}

export function signCheckoutTicket(input: CheckoutTicketInput): string {
  const payload = {
    v: 1,
    k: checkoutPublicKey().id,
    g: input.group,
    d: input.design,
    r: input.reference,
    setting: `gid://shopify/ProductVariant/${input.settingVariant}`,
    diamond: `gid://shopify/ProductVariant/${input.diamondVariant}`,
    engraving_variant: input.engravingVariant ? `gid://shopify/ProductVariant/${input.engravingVariant}` : null,
    engraving: input.engraving || null,
  };
  const bytes = Buffer.from(JSON.stringify(payload));
  return `${bytes.toString('base64url')}.${sign(null, bytes, privateKey()).toString('base64url')}`;
}
