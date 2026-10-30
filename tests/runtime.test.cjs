const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadComponent(file, name, args = [], globals = {}) {
  const components = new Map();
  const stores = new Map();
  const context = vm.createContext({
    Alpine: {
      data: (key, factory) => components.set(key, factory),
      store(key, value) { if (value) stores.set(key, value); return stores.get(key); }
    },
    window: { Eurus: { loadedScript: new Set() } },
    document: { addEventListener: (event, callback) => callback() },
    requestAnimationFrame: callback => callback(),
    URLSearchParams, TypeError, clearTimeout, setTimeout,
    ...globals
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  return { component: components.has(name) ? components.get(name)(...args) : stores.get(name), context };
}

function loadThemeUtilities() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets/theme.js'), 'utf8');
  const start = source.indexOf('const xParseJSON =');
  const end = source.indexOf("\nrequestAnimationFrame(() => {\n  document.addEventListener('alpine:init'", start);
  const events = new Map();
  const miniCart = { needReload: false, reloads: 0, reLoad() { this.reloads++; } };
  const Alpine = { store: () => miniCart };
  let pageReloads = 0;
  const context = vm.createContext({
    Alpine,
    window: { Alpine, addEventListener: (type, callback) => events.set(type, callback) },
    document: { addEventListener() {}, getElementById: () => null },
    location: { reload: () => pageReloads++ }
  });
  vm.runInContext(source.slice(start, end) + ';globalThis.parse = xParseJSON;', context);
  return { context, events, miniCart, pageReloads: () => pageReloads };
}

function classList() {
  const values = new Set();
  return { add: value => values.add(value), remove: value => values.delete(value), contains: value => values.has(value) };
}

function select(options, defaultValue) {
  return {
    options, selectedIndex: 0, dataset: { default: defaultValue },
    get value() { return this.options[this.selectedIndex]?.value || ''; },
    addEventListener() {},
    appendChild(option) {
      option.remove = () => this.options.splice(this.options.indexOf(option), 1);
      this.options.push(option);
    }
  };
}

function shippingFixture() {
  const country = select([
    { value: 'Canada', innerHTML: 'Canada', dataset: { provinces: JSON.stringify([['Ontario', 'Ontario'], ['Quebec', 'Quebec']]) } },
    { value: 'Trinidad & Tobago', innerHTML: 'Trinidad & Tobago', dataset: { provinces: '[]' } }
  ], 'Canada');
  const province = select([], 'Quebec');
  const heading = { classList: classList() };
  const elements = {
    '.country-select': country, '.province-select': province,
    '.province-container': { hidden: false }, '.zip-input': { value: 'H2X 1Y4' },
    '.rates': { classList: classList(), querySelector: () => heading },
    '.errors': { classList: classList() }
  };
  const loaded = loadComponent('assets/estimate-shipping-rate.js', 'xEstimateShipping', [
    { querySelector: selector => elements[selector] }, 'One rate', 'Many rates', 'No rates'
  ], { document: { addEventListener: (event, callback) => callback(), createElement: () => ({}) }, Shopify: { routes: { root: '/fr/' } } });
  return { ...loaded, country, province, elements };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function cartFixture() {
  let queue = Promise.resolve();
  const helper = {
    withCartLock(mutate) {
      const held = queue.then(() => mutate({ settle() {} }));
      queue = held.catch(() => {});
      return held;
    },
    cartJson: response => response.json(),
    describeCartUpdate: data => data,
    waitForCartUpdate: () => queue
  };
  let submitted = 0;
  const loaded = loadComponent('assets/atelier-cart.js', 'xAtelierCart', [], {
    Shopify: { routes: { root: '/fr/' } },
    document: { addEventListener: (event, callback) => callback(), createElement: () => ({}) },
    HTMLFormElement: { prototype: { submit() { submitted++; } } }
  });
  loaded.component.root = { dataset: { errorMessage: 'Please try again.' } };
  loaded.component.$store = { xCartHelper: helper };
  return { ...loaded, submissions: () => submitted };
}

const cartResponse = () => ({ json: async () => ({ attributes: {}, item_count: 1 }) });

test('shipping setup retains the saved province after populating its options', () => {
  const { component, province } = shippingFixture();
  component.load();
  assert.equal(province.value, 'Quebec');
});

test('switching to a country without provinces clears the old selection', () => {
  const { component, country, province, elements } = shippingFixture();
  component.load();
  country.selectedIndex = 1;
  component.handleCountryChange();
  assert.equal(province.options.length, 0);
  assert.equal(elements['.province-container'].hidden, true);
});

test('shipping requests preserve special characters and the storefront locale', async () => {
  const { component, context, country, elements } = shippingFixture();
  component.load();
  country.selectedIndex = 1;
  component.handleCountryChange();
  elements['.zip-input'].value = 'A+B & C#1';
  let request;
  context.fetch = async url => { request = url; return { ok: true, json: async () => ({ shipping_rates: [] }) }; };
  await component.submit();
  const url = new URL(request, 'https://shop.example');
  assert.equal(url.pathname, '/fr/cart/shipping_rates.json');
  assert.equal(url.searchParams.get('shipping_address[country]'), 'Trinidad & Tobago');
  assert.equal(url.searchParams.get('shipping_address[zip]'), 'A+B & C#1');
  assert.equal(url.hash, '');
});

test('shipping ignores duplicate submissions while a request is pending', async () => {
  const { component, context } = shippingFixture();
  component.load();
  const response = deferred();
  let calls = 0;
  context.fetch = () => { calls++; return response.promise; };
  const first = component.submit();
  const second = component.submit();
  response.resolve({ ok: true, json: async () => ({ shipping_rates: [] }) });
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(component.loadingShipping, false);
});

test('shipping rate names and server errors display as text', () => {
  const { component } = shippingFixture();
  component.showRates({ shipping_rates: [{ name: '<img src=x onerror=alert(1)>', price: '5', currency: 'USD' }] });
  assert.ok(component.rates_text.includes('&lt;img'));
  assert.ok(!component.rates_text.includes('<img'));
  component.showErrors({ zip: '<script>alert(1)</script>' });
  assert.ok(component.errors_message.includes('&lt;script&gt;'));
  assert.ok(!component.errors_message.includes('<script>'));
});

test('cart note failures retain the latest edits for retry', async () => {
  const { component, context } = cartFixture();
  const response = deferred();
  const bodies = [];
  context.fetch = async (url, options) => {
    bodies.push(JSON.parse(options.body));
    return bodies.length === 1 ? response.promise : cartResponse();
  };
  component.pendingNotes = { note: 'Old note' };
  const first = component.saveNotes();
  await Promise.resolve();
  component.pendingNotes = { note: 'Latest note', gift: 'Happy birthday' };
  const second = component.saveNotes();
  response.reject(new TypeError('Offline'));
  await Promise.all([first, second]);
  await component.saveNotes();
  assert.equal(bodies.at(-1).note, 'Latest note');
  assert.equal(bodies.at(-1).attributes['Gift message'], 'Happy birthday');
  assert.equal(Object.keys(component.pendingNotes).length, 0);
});

test('checkout waits for an in-flight note and subsequent edits', async () => {
  const { component, context, submissions } = cartFixture();
  const response = deferred();
  const bodies = [];
  context.fetch = async (url, options) => {
    bodies.push(JSON.parse(options.body));
    return bodies.length === 1 ? response.promise : cartResponse();
  };
  component.pendingNotes = { note: 'First note' };
  const saving = component.saveNotes();
  await Promise.resolve();
  component.pendingNotes = { note: 'Final note' };
  const checkout = component.checkout({ preventDefault() {}, target: { append() {} } });
  assert.equal(submissions(), 0);
  response.resolve(cartResponse());
  await Promise.all([saving, checkout]);
  assert.equal(submissions(), 1);
  assert.equal(bodies.at(-1).note, 'Final note');
});

test('checkout stays open when a pending note fails to save', async () => {
  const { component, context, submissions } = cartFixture();
  context.fetch = async () => { throw new TypeError('Offline'); };
  component.pendingNotes = { note: 'Keep this note' };
  await component.checkout({ preventDefault() {}, target: { append() {} } });
  assert.equal(submissions(), 0);
  assert.equal(component.checkingOut, false);
  assert.equal(component.pendingNotes.note, 'Keep this note');
  assert.equal(component.error, 'Please try again.');
});

test('JSON data preserves escaped newlines, backslashes, and Unicode', () => {
  const { context } = loadThemeUtilities();
  const data = { path: 'C:\\new\\folder', note: 'Line 1\nLine 2', quote: 'A "quote"', pattern: '\\bword\\b' };
  assert.equal(JSON.stringify(context.parse(JSON.stringify(data))), JSON.stringify(data));
  assert.equal(context.parse('{"text":"\\u00e9"}').text, 'é');
});

test('legacy data attributes still accept unescaped regex backslashes', () => {
  const { context } = loadThemeUtilities();
  assert.equal(context.parse(String.raw`{"pattern":"\d+"}`).pattern, '\\d+');
  assert.throws(() => context.parse('{broken json}'));
});

test('returning to a cached page refreshes cart data after Alpine has initialized', () => {
  const { events, miniCart } = loadThemeUtilities();
  events.get('pageshow')();
  assert.equal(miniCart.needReload, true);
  assert.equal(miniCart.reloads, 0);
  events.get('pageshow')();
  assert.equal(miniCart.reloads, 1);
});

test('returning to the cart page reloads its contents', () => {
  const { context, events, miniCart, pageReloads } = loadThemeUtilities();
  miniCart.needReload = true;
  context.document.getElementById = () => ({});
  events.get('pageshow')();
  assert.equal(pageReloads(), 1);
});

test('an empty recommendation response hides the placeholder without a runtime error', async () => {
  const errors = [];
  const { component } = loadComponent('assets/product-recommendations.js', 'xProductRecommendations', [], {
    document: {
      addEventListener: (event, callback) => callback(),
      createElement: () => ({ querySelector: () => null })
    },
    fetch: async () => ({ text: async () => '<div>No recommendations</div>' }),
    console: { error: error => errors.push(error) }
  });
  const target = { style: {} };
  await component.load(target, '/recommendations');
  assert.equal(target.style.display, 'none');
  assert.equal(component.loading, false);
  assert.equal(errors.length, 0);
});
