import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outputDir = resolve(root, 'target/qa-fixtures');
mkdirSync(outputDir, { recursive: true });
// This deterministic key is a public test vector only. Production derives its key server-side.
const key = createPrivateKey({ format: 'der', type: 'pkcs8', key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.alloc(32, 7)]) });
const publicBytes = createPublicKey(key).export({ format: 'der', type: 'spki' }).subarray(-32);
const keyId = createHash('sha256').update(publicBytes).digest('hex').slice(0, 16);
const product = 'gid://shopify/Product/15460741185784';
const setting = 'gid://shopify/ProductVariant/67890588942584';
const diamond = 'gid://shopify/ProductVariant/67913931817208';
const service = 'gid://shopify/ProductVariant/67911152632056';
const group = '216dade1-4f16-4503-b76a-0f8640b58330';
const design = 'c8c40a5c-32c0-45c4-9e75-7ff94d3cf571';
const reference = 'test-signed-quote-reference';
const payload = Buffer.from(JSON.stringify({ v: 1, k: keyId, g: group, d: design, r: reference, setting, diamond, engraving_variant: service, engraving: '3ertyui' }));
const ticket = `${payload.toString('base64url')}.${sign(null, payload, key).toString('base64url')}`;
const config = { version: 1, keys: [{ id: keyId, public_key: publicBytes.toString('base64url') }], products: [product], variants: [diamond, service] };
const attr = value => value === null || value === undefined ? null : { value };
function line(variant, productId, role, engraving) {
  return { quantity: 1, group: attr(group), role: attr(role), ticket: attr(ticket), design: attr(design), reference: attr(reference), engraving: attr(engraving), merchandise: { __typename: 'ProductVariant', id: variant, product: { id: productId } } };
}
const valid = [line(setting, product, 'setting', '3ertyui'), line(diamond, 'gid://shopify/Product/15465670541560', 'diamond', null), line(service, 'gid://shopify/Product/15464833057016', 'engraving', '3ertyui')];
const changed = (index, changes) => valid.map((item, i) => i === index ? { ...item, ...changes } : item);
const cases = [
  ['valid_three_components', 'CHECKOUT_COMPLETION', valid, false],
  ['quantity_tamper', 'CHECKOUT_COMPLETION', changed(1, { quantity: 2 }), true],
  ['missing_diamond', 'CHECKOUT_COMPLETION', [valid[0], valid[2]], true],
  ['engraving_tamper', 'CHECKOUT_COMPLETION', changed(2, { engraving: attr('changed') }), true],
  ['ticket_tamper', 'CHECKOUT_COMPLETION', changed(1, { ticket: attr(`${ticket.slice(0, -2)}AA`) }), true],
  ['stripped_properties', 'CHECKOUT_COMPLETION', [{ ...valid[0], group: null, role: null, ticket: null, design: null, reference: null }], true],
  ['ordinary_product', 'CHECKOUT_COMPLETION', [{ quantity: 1, group: null, role: null, ticket: null, design: null, reference: null, engraving: null, merchandise: { __typename: 'ProductVariant', id: 'gid://shopify/ProductVariant/999', product: { id: 'gid://shopify/Product/999' } } }], false],
  ['cart_edit', 'CART_INTERACTION', [valid[0]], false],
];
for (const [name, step, lines, shouldBlock] of cases) {
  const inputPath = resolve(outputDir, `${name}.json`);
  writeFileSync(inputPath, JSON.stringify({ buyerJourney: { step }, validation: { metafield: { value: JSON.stringify(config) } }, cart: { lines } }));
  const shopifyArgs = ['app', 'function', 'run', '--path', root, '--input', inputPath, '--export', 'cart_validations_generate_run', '--json'];
  const cli = process.env.SHOPIFY_CLI_JS;
  const raw = execFileSync(cli ? process.execPath : 'shopify', cli ? [cli, ...shopifyArgs] : shopifyArgs, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const result = JSON.parse(raw);
  const blocked = Boolean(result.output?.operations?.some(op => op.validationAdd?.errors?.length));
  if (!result.success || blocked !== shouldBlock || result.instructions > 11_000_000) throw new Error(`CHECKOUT_RUNTIME_FAILED:${name}:${result.instructions}:${blocked}`);
  console.log(JSON.stringify({ case: name, blocked, instructions: result.instructions }));
}
