/* The ring app supplies a server quote. Shopify remains authoritative for prices and stock. */
(function (scope) {
  'use strict';

  function withThemePreview(path, context) {
    path = String(path);
    try {
      const current = new URL(context.baseUrl);
      const target = new URL(path, current);
      if (target.origin !== current.origin) return path;
      const theme = context.theme;
      const preview = current.searchParams.get('preview_theme_id') || (theme?.role && theme.role !== 'main' ? String(theme.id || '') : '');
      if (!/^\d+$/.test(preview)) return path;
      target.searchParams.set('preview_theme_id', preview);
      return target.href;
    } catch (_) { return path; }
  }

  function createRingCart(environment) {
    const inFlight = new Map();
    const root = environment.root || '/';
    const messages = environment.messages || {};
    const message = key => messages[key] || messages.error || 'Your ring could not be updated. Please check your cart and try again.';
    const fail = (key, detail) => Object.assign(new Error(message(key)), { code: key, detail });
    const group = (cart, id) => (cart.items || []).filter(item => String(item.properties?._configuration_id || '') === id);
    const role = item => item.properties?._aevow_role;
    const variant = item => String(item.variant_id || item.id).split('/').pop();
    const propertiesEqual = (left, right) => {
      const entries = value => Object.entries(value || {}).filter(([, entry]) => entry !== null && entry !== '').map(([key, entry]) => [key, String(entry)]).sort(([a], [b]) => a.localeCompare(b));
      return JSON.stringify(entries(left)) === JSON.stringify(entries(right));
    };
    const sameComponent = (left, right) => role(left) === role(right) && variant(left) === variant(right);
    const matches = (current, desired) => current.length === desired.length && desired.every(expected => current.some(item => sameComponent(item, expected) && item.quantity === 1 && propertiesEqual(item.properties, expected.properties)));

    function canonical(quote, configurationId) {
      const id = String(configurationId || quote.configurationId || '');
      if (!/^[a-zA-Z0-9_-]{8,128}$/.test(id) || !quote.designId || !quote.reference) throw fail('invalid_quote');
      if (configurationId && String(quote.configurationId) !== id) throw fail('invalid_quote');
      let previewUrl = '';
      if (quote.previewUrl) {
        try { const url = new URL(quote.previewUrl); if (url.protocol === 'https:') previewUrl = url.href; } catch (_) { /* A missing preview must not invalidate a ring. */ }
      }
      const items = (quote.items || quote.lines || []).map(item => ({
        id: String(item.id).split('/').pop(),
        quantity: 1,
        properties: {
          ...item.properties,
          _configuration_id: id,
          _aevow_design_id: String(quote.designId),
          _aevow_reference: String(quote.reference),
          ...(previewUrl ? { _aevow_preview: previewUrl } : {})
        }
      }));
      const roles = items.map(role);
      if (items.some(item => !/^\d+$/.test(item.id)) || roles.filter(value => value === 'setting').length !== 1 || roles.filter(value => value === 'diamond').length !== 1 || roles.filter(value => value === 'engraving').length > 1 || roles.some(value => !['setting', 'diamond', 'engraving'].includes(value))) throw fail('invalid_quote');
      return { id, items };
    }

    async function request(path, data) {
      const response = await environment.fetch(`${root}cart${path}.js`, {
        ...(data ? { method: 'POST', body: JSON.stringify(data) } : { cache: 'no-store' }),
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' }
      });
      const result = await environment.helper.cartJson(response);
      if (!response.ok || result.errors || Number(result.status) >= 400) {
        throw Object.assign(new Error(result.description || result.message || message('error')), { status: response.status, code: 'cart_rejected' });
      }
      return result;
    }

    async function readCart() { return request(''); }

    async function render(cart, open) {
      environment.helper.currentItemCount = cart.item_count;
      let rendered = true;
      try { await environment.helper.reRenderSections(); } catch (_) { rendered = false; }
      try {
        environment.dispatch?.('eurus:cart:items-changed');
        if (open && rendered) environment.openCart?.();
      } catch (_) { rendered = false; }
      return rendered;
    }

    function once(id, action) {
      if (inFlight.has(id)) return inFlight.get(id);
      const operation = action().finally(() => inFlight.delete(id));
      inFlight.set(id, operation);
      return operation;
    }

    async function rollback(configurationId, baseline) {
      let cart = await readCart();
      let current = group(cart, configurationId);
      const extra = current.filter(item => !baseline.some(previous => sameComponent(item, previous)));
      if (extra.length) {
        await request('/update', { updates: Object.fromEntries(extra.map(item => [item.key, 0])) });
        cart = await readCart();
        current = group(cart, configurationId);
      }
      const missing = baseline.filter(previous => !current.some(item => sameComponent(item, previous)));
      if (missing.length) await request('/add', { items: missing.map(item => ({ id: variant(item), quantity: item.quantity, properties: item.properties })) });
      for (const previous of baseline) {
        cart = await readCart();
        const item = group(cart, configurationId).find(candidate => sameComponent(candidate, previous));
        if (!item) throw fail('reconciliation_required');
        if (item.quantity !== previous.quantity || !propertiesEqual(item.properties, previous.properties)) await request('/change', { id: item.key, quantity: previous.quantity, properties: previous.properties });
      }
      cart = await readCart();
      const restored = group(cart, configurationId);
      if (restored.length !== baseline.length || !baseline.every(previous => restored.some(item => sameComponent(item, previous) && item.quantity === previous.quantity && propertiesEqual(item.properties, previous.properties)))) throw fail('reconciliation_required');
      return cart;
    }

    async function synchronize(quote, editing) {
      const desired = canonical(quote, editing || undefined);
      return once(desired.id, () => environment.helper.withCartLock(async standardEvent => {
        let cart = await readCart();
        const initial = group(cart, desired.id);
        if (matches(initial, desired.items)) {
          standardEvent.settle(cart);
          return { cart, configurationId: desired.id, rendered: await render(cart, true) };
        }
        if (editing && !initial.length) throw fail('configuration_missing');
        // Another quote must never overwrite a ring merely because it reused an ID.
        if (!editing && initial.some(item => item.properties?._aevow_design_id !== quote.designId || item.properties?._aevow_reference !== quote.reference)) throw fail('configuration_conflict');
        const baseline = editing ? initial.map(item => ({ ...item, properties: { ...item.properties } })) : [];
        try {
          const missing = desired.items.filter(item => !initial.some(previous => sameComponent(previous, item)));
          if (missing.length) await request('/add', { items: missing });
          cart = await readCart();
          // Keep the existing diamond line when its variant is unchanged (unique stock = 1).
          for (const expected of desired.items) {
            const actual = group(cart, desired.id).find(item => sameComponent(item, expected));
            if (!actual) throw fail('incomplete_configuration');
            if (actual.quantity !== 1 || !propertiesEqual(actual.properties, expected.properties)) {
              await request('/change', { id: actual.key, quantity: 1, properties: expected.properties });
              cart = await readCart();
            }
          }
          const superseded = group(cart, desired.id).filter(item => !desired.items.some(expected => sameComponent(item, expected)));
          if (superseded.length) await request('/update', { updates: Object.fromEntries(superseded.map(item => [item.key, 0])) });
          cart = await readCart();
          if (!matches(group(cart, desired.id), desired.items)) throw fail('incomplete_configuration');
        } catch (error) {
          try {
            // An interrupted response can follow a successful Shopify mutation.
            cart = await readCart();
            if (!matches(group(cart, desired.id), desired.items)) {
              cart = await rollback(desired.id, baseline);
              await render(cart, false);
              throw Object.assign(error, { reconciled: true });
            }
          } catch (recovery) {
            if (recovery.reconciled) throw recovery;
            const uncertain = fail('reconciliation_required');
            uncertain.cause = error;
            uncertain.configurationId = desired.id;
            throw uncertain;
          }
        }
        standardEvent.settle(cart);
        return { cart, configurationId: desired.id, rendered: await render(cart, true) };
      }, {
        type: 'shopify:cart:lines-update', action: editing ? 'update' : 'add', context: 'cart',
        lines: environment.helper.addLines(desired.items)
      }));
    }

    async function removeConfiguration(configurationId) {
      const id = String(configurationId);
      return once(id, () => environment.helper.withCartLock(async standardEvent => {
        let cart = await readCart();
        const current = group(cart, id);
        if (current.length) {
          try { await request('/update', { updates: Object.fromEntries(current.map(item => [item.key, 0])) }); }
          catch (error) { cart = await readCart(); if (group(cart, id).length) throw error; }
          cart = await readCart();
          if (group(cart, id).length) throw fail('reconciliation_required');
        }
        standardEvent.settle(cart);
        return { cart, configurationId: id, rendered: await render(cart, false) };
      }, { type: 'shopify:cart:lines-update', action: 'remove', context: 'cart', lines: [] }));
    }

    function validateCart(cart) {
      const ids = [...new Set((cart.items || []).map(item => item.properties?._configuration_id).filter(Boolean))];
      return ids.every(id => {
        const items = group(cart, String(id));
        const roles = items.map(role);
        const signed = items.some(item => item.properties?._aevow_design_id);
        return items.every(item => item.quantity === 1) && roles.filter(value => value === 'setting').length === 1 && roles.filter(value => value === 'diamond').length === 1 && roles.filter(value => value === 'engraving').length <= 1 && roles.every(value => ['setting', 'diamond', 'engraving'].includes(value)) && (!signed || items.every(item => item.properties?._aevow_design_id === items[0].properties._aevow_design_id && item.properties?._aevow_reference === items[0].properties._aevow_reference && Boolean(item.properties?._aevow_reference)));
      });
    }

    return {
      addConfiguration: quote => synchronize(quote),
      editConfiguration: (id, quote) => synchronize(quote, String(id)),
      removeConfiguration, readCart, validateCart,
      withPreviewContext: path => environment.withPreviewContext?.(path) || String(path)
    };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { createRingCart, withThemePreview };
  if (scope?.document) {
    scope.AevowRingPreviewUrl = path => withThemePreview(path, { baseUrl: scope.location.href, theme: scope.Shopify?.theme });
    const initialize = () => {
      if (scope.AevowRingCart) return;
      const helper = scope.Alpine?.store('xCartHelper');
      if (!helper?.withCartLock) return;
      scope.AevowRingCart = createRingCart({
        root: scope.Shopify?.routes?.root || '/',
        fetch: scope.fetch.bind(scope), helper,
        messages: scope.AevowRingCartMessages || {},
        withPreviewContext: scope.AevowRingPreviewUrl,
        dispatch: name => scope.document.dispatchEvent(new CustomEvent(name)),
        openCart: () => scope.Alpine.store('xMiniCart')?.openCart?.()
      });
      scope.document.dispatchEvent(new CustomEvent('aevow:ring-cart:ready'));
    };
    scope.document.addEventListener('alpine:initialized', initialize);
    initialize();
  }
})(typeof window !== 'undefined' ? window : null);
