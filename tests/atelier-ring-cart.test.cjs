const test = require('node:test');
const assert = require('node:assert/strict');
const { createRingCart, withThemePreview } = require('../assets/atelier-ring-cart.js');

test('preview links preserve design/cart identifiers and unpublished theme context', () => {
  const url = new URL(withThemePreview('/pages/design-your-ring?configuration=group-0001&design=design-0001', {
    baseUrl: 'https://example.myshopify.com/cart', theme: { id: 188667003128, role: 'unpublished' }
  }));
  assert.equal(url.searchParams.get('preview_theme_id'), '188667003128');
  assert.equal(url.searchParams.get('configuration'), 'group-0001');
  assert.equal(url.searchParams.get('design'), 'design-0001');
  assert.equal(withThemePreview('/cart', { baseUrl: 'https://example.myshopify.com/pages/design-your-ring?preview_theme_id=123', theme: { id: 456, role: 'main' } }), 'https://example.myshopify.com/cart?preview_theme_id=123');
});

test('published themes and external URLs do not acquire a theme preview parameter', () => {
  assert.equal(withThemePreview('/cart', { baseUrl: 'https://example.myshopify.com/cart', theme: { id: 123, role: 'main' } }), '/cart');
  assert.equal(withThemePreview('https://external.example.com/cart', { baseUrl: 'https://example.myshopify.com/?preview_theme_id=123' }), 'https://external.example.com/cart');
  assert.equal(withThemePreview('/cart', { baseUrl: 'https://example.myshopify.com/?preview_theme_id=invalid' }), '/cart');
});

function quote(overrides = {}) {
  return {
    configurationId: 'group-0001', designId: 'design-0001', reference: 'signed-design-0001',
    previewUrl: 'https://assets.example.com/design-0001.png',
    items: [
      { id: '101', quantity: 1, properties: { _aevow_role: 'setting', Metal: 'Platinum', Size: '4.5' } },
      { id: '201', quantity: 1, properties: { _aevow_role: 'diamond' } },
      { id: '301', quantity: 1, properties: { _aevow_role: 'engraving', Engraving: '3ertyui' } }
    ], ...overrides
  };
}

function fixture() {
  let state = { items: [], item_count: 0 };
  let sequence = 0;
  let lock = Promise.resolve();
  const calls = [];
  const settlements = [];
  const controls = { fail: null, renderFails: false, openFails: false, renders: 0, opens: 0 };
  const copy = value => JSON.parse(JSON.stringify(value));
  const helper = {
    cartJson: response => response.json(),
    addLines: items => items.map(item => ({ merchandiseId: item.id, quantity: item.quantity })),
    reRenderSections: async () => { controls.renders++; if (controls.renderFails) throw new Error('render unavailable'); },
    withCartLock: operation => {
      const result = lock.then(() => operation({ settle: cart => settlements.push(copy(cart)) }));
      lock = result.catch(() => {});
      return result;
    }
  };
  const fetch = async (url, options = {}) => {
    const data = options.body ? JSON.parse(options.body) : null;
    const path = url.replace('/cart', '').replace('.js', '');
    calls.push({ path, data });
    const failure = controls.fail?.({ path, data, state, calls });
    if (failure === 'before') throw new TypeError('connection dropped');
    if (path === '/add') {
      for (const requested of data.items) {
        if (failure === 'partial' && requested !== data.items[0]) break;
        const existing = state.items.find(item => String(item.id) === String(requested.id) && JSON.stringify(item.properties) === JSON.stringify(requested.properties));
        // The diamond is a unique stone. Re-adding it with new properties must fail.
        if (requested.properties._aevow_role === 'diamond' && state.items.some(item => String(item.id) === String(requested.id))) {
          return { ok: false, status: 422, json: async () => ({ status: 422, description: 'Only one diamond is available' }) };
        }
        if (existing) existing.quantity += requested.quantity;
        else state.items.push({ ...copy(requested), variant_id: requested.id, key: `line-${++sequence}` });
      }
    }
    if (path === '/change') {
      const item = state.items.find(item => item.key === data.id);
      assert.ok(item, 'change must address a current line key');
      item.quantity = data.quantity;
      if (data.properties) { item.properties = data.properties; item.key = `line-${++sequence}`; }
    }
    if (path === '/update') {
      for (const item of state.items) if (Object.hasOwn(data.updates, item.key)) item.quantity = data.updates[item.key];
    }
    state.items = state.items.filter(item => item.quantity > 0);
    state.item_count = state.items.reduce((total, item) => total + item.quantity, 0);
    if (failure === 'after') throw new TypeError('response lost');
    if (failure === 'partial') return { ok: false, status: 422, json: async () => ({ status: 422, description: 'A component is unavailable' }) };
    return { ok: true, status: 200, json: async () => copy(state) };
  };
  const adapter = createRingCart({ fetch, helper, root: '/', openCart: () => { controls.opens++; if (controls.openFails) throw new Error('Drawer failed'); }, messages: { reconciliation_required: 'Check your cart' } });
  return { adapter, controls, calls, settlements, cart: () => copy(state), addUnrelated: () => state.items.push({ id: '999', variant_id: '999', key: 'unrelated', quantity: 1, properties: {} }) };
}

test('adds the three real variants once and stamps the immutable design reference', async () => {
  const { adapter, cart } = fixture();
  const result = await adapter.addConfiguration(quote());
  assert.equal(result.rendered, true);
  assert.equal(cart().items.length, 3);
  assert.equal(adapter.validateCart(cart()), true);
  for (const item of cart().items) {
    assert.equal(item.quantity, 1);
    assert.equal(item.properties._configuration_id, 'group-0001');
    assert.equal(item.properties._aevow_design_id, 'design-0001');
    assert.equal(item.properties._aevow_reference, 'signed-design-0001');
  }
});

test('duplicate clicks and a subsequent retry do not duplicate the ring', async () => {
  const { adapter, cart, calls } = fixture();
  await Promise.all([adapter.addConfiguration(quote()), adapter.addConfiguration(quote())]);
  await adapter.addConfiguration(quote());
  assert.equal(cart().items.length, 3);
  assert.equal(calls.filter(call => call.path === '/add').length, 1);
});

test('lost successful add response is reconciled without a second add', async () => {
  const { adapter, controls, calls, cart } = fixture();
  controls.fail = ({ path }) => path === '/add' ? 'after' : null;
  await adapter.addConfiguration(quote());
  assert.equal(calls.filter(call => call.path === '/add').length, 1);
  assert.equal(adapter.validateCart(cart()), true);
});

test('an unconfirmed read reports uncertainty, and retry inspects the settled cart first', async () => {
  const { adapter, controls, calls, cart } = fixture();
  let added = false;
  controls.fail = ({ path }) => {
    if (path === '/add') { added = true; return 'after'; }
    return added && path === '' ? 'before' : null;
  };
  await assert.rejects(adapter.addConfiguration(quote()), error => error.code === 'reconciliation_required' && error.configurationId === 'group-0001');
  assert.equal(cart().items.length, 3);
  controls.fail = null;
  await adapter.addConfiguration(quote());
  assert.equal(calls.filter(call => call.path === '/add').length, 1);
  assert.equal(adapter.validateCart(cart()), true);
});

test('a partial add rolls back only this configuration and can be retried safely', async () => {
  const { adapter, controls, cart, addUnrelated } = fixture();
  addUnrelated();
  controls.fail = ({ path }) => path === '/add' ? 'partial' : null;
  await assert.rejects(adapter.addConfiguration(quote()), error => error.reconciled === true);
  assert.deepEqual(cart().items.map(item => item.id), ['999']);
  controls.fail = null;
  await adapter.addConfiguration(quote());
  assert.equal(cart().items.length, 4);
});

test('editing a metal reuses the unique diamond and updates its design properties', async () => {
  const { adapter, cart, calls } = fixture();
  await adapter.addConfiguration(quote());
  const edited = quote({ designId: 'design-0002', reference: 'signed-design-0002' });
  edited.items[0].id = '102';
  edited.items[0].properties.Metal = 'Rose gold';
  const before = calls.length;
  await adapter.editConfiguration('group-0001', edited);
  const additions = calls.slice(before).filter(call => call.path === '/add').flatMap(call => call.data.items);
  assert.deepEqual(additions.map(item => item.id), ['102']);
  assert.equal(cart().items.find(item => item.id === '201').quantity, 1);
  assert.ok(cart().items.every(item => item.properties._aevow_design_id === 'design-0002'));
  assert.equal(cart().items.some(item => item.id === '101'), false);
  assert.equal(adapter.validateCart(cart()), true);
});

test('failed edit restores the existing design without losing the diamond', async () => {
  const { adapter, controls, cart } = fixture();
  await adapter.addConfiguration(quote());
  const edited = quote({ designId: 'design-0002', reference: 'signed-design-0002' });
  edited.items[0].id = '102';
  let rejected = false;
  controls.fail = ({ path }) => { if (path === '/change' && !rejected) { rejected = true; return 'before'; } return null; };
  await assert.rejects(adapter.editConfiguration('group-0001', edited), error => error.reconciled === true);
  assert.deepEqual(cart().items.map(item => item.id).sort(), ['101', '201', '301']);
  assert.ok(cart().items.every(item => item.properties._aevow_design_id === 'design-0001'));
});

test('an interrupted metadata update restores the previous immutable design references', async () => {
  const { adapter, controls, cart } = fixture();
  await adapter.addConfiguration(quote());
  const edited = quote({ designId: 'design-0002', reference: 'signed-design-0002' });
  edited.items[0].id = '102';
  let interrupted = false;
  controls.fail = ({ path }) => { if (path === '/change' && !interrupted) { interrupted = true; return 'after'; } return null; };
  await assert.rejects(adapter.editConfiguration('group-0001', edited), error => error.reconciled === true);
  assert.deepEqual(cart().items.map(item => item.id).sort(), ['101', '201', '301']);
  assert.ok(cart().items.every(item => item.properties._aevow_reference === 'signed-design-0001'));
  assert.equal(adapter.validateCart(cart()), true);
});

test('engraving can be removed without replacing other components', async () => {
  const { adapter, cart, calls } = fixture();
  await adapter.addConfiguration(quote());
  const edited = quote({ designId: 'design-0002', reference: 'signed-design-0002' });
  edited.items.pop();
  const before = calls.length;
  await adapter.editConfiguration('group-0001', edited);
  assert.equal(cart().items.length, 2);
  assert.equal(calls.slice(before).some(call => call.path === '/add'), false);
});

test('removal deletes all components and leaves another configuration untouched', async () => {
  const { adapter, cart } = fixture();
  await adapter.addConfiguration(quote());
  const other = quote({ configurationId: 'group-0002', designId: 'design-0002', reference: 'signed-design-0002' });
  other.items[1].id = '202';
  await adapter.addConfiguration(other);
  await adapter.removeConfiguration('group-0001');
  assert.equal(cart().items.length, 3);
  assert.ok(cart().items.every(item => item.properties._configuration_id === 'group-0002'));
});

test('lost successful removal response does not remove a different ring', async () => {
  const { adapter, controls, cart, addUnrelated } = fixture();
  await adapter.addConfiguration(quote());
  addUnrelated();
  controls.fail = ({ path }) => path === '/update' ? 'after' : null;
  await adapter.removeConfiguration('group-0001');
  assert.deepEqual(cart().items.map(item => item.id), ['999']);
});

test('render failure after settled add reports success with a cart-page fallback', async () => {
  const { adapter, controls, cart } = fixture();
  controls.renderFails = true;
  const result = await adapter.addConfiguration(quote());
  assert.equal(result.rendered, false);
  assert.equal(cart().items.length, 3);
  assert.equal(controls.opens, 0);
});

test('drawer errors after a settled add do not turn the completed purchase into a retry', async () => {
  const { adapter, controls, cart } = fixture();
  controls.openFails = true;
  const result = await adapter.addConfiguration(quote());
  assert.equal(result.rendered, false);
  assert.equal(cart().items.length, 3);
});

test('incomplete, duplicated and inconsistent configurations fail checkout validation', async () => {
  const { adapter, cart } = fixture();
  await adapter.addConfiguration(quote());
  const missing = cart();
  missing.items = missing.items.filter(item => item.properties._aevow_role !== 'diamond');
  assert.equal(adapter.validateCart(missing), false);
  const duplicated = cart(); duplicated.items[0].quantity = 2;
  assert.equal(adapter.validateCart(duplicated), false);
  const inconsistent = cart(); inconsistent.items[0].properties._aevow_design_id = 'different';
  assert.equal(adapter.validateCart(inconsistent), false);
});

test('invalid canonical payloads are rejected before any cart request', async () => {
  const { adapter, calls } = fixture();
  await assert.rejects(adapter.addConfiguration(quote({ items: [] })));
  assert.equal(calls.length, 0);
  await assert.rejects(adapter.editConfiguration('another-group', quote()));
  assert.equal(calls.length, 0);
});
