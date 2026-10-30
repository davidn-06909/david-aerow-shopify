document.addEventListener('alpine:init', () => {
  Alpine.data('xAtelierCart', () => ({
    busy: false,
    checkingOut: false,
    error: '',
    announcement: '',
    noteTimer: null,
    noteRequest: null,
    pendingNotes: {},
    trigger: null,
    root: null,

    init() {
      this.root = this.$el;
      this.$store.xMiniCart.type = 'drawer';
      this.$watch('$store.xMiniCart.open', open => {
        if (open) this.onOpen();
        else this.saveNotes();
      });
      if (this.$store.xMiniCart.open) this.onOpen();
    },

    onOpen() {
      this.trigger = document.activeElement;
      this.$nextTick(() => this.root.querySelector('#CloseCart')?.focus({ preventScroll: true }));
      this.$store.xCartAnalytics.viewCart();
      this.root.querySelector('#CartDrawerViewEvent')?.dispatchViewEvent?.();
    },

    close() {
      this.$store.xModal.removeFocus();
      this.$store.xMiniCart.hideCart();
      const trigger = this.trigger?.isConnected && this.trigger.getClientRects().length && !this.root.contains(this.trigger)
        ? this.trigger
        : [...document.querySelectorAll('[id="cart-icon"]')].find(el => el.getClientRects().length);
      trigger?.focus({ preventScroll: true });
    },

    onKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.close();
      }
      if (event.key !== 'Tab') return;
      const elements = [...this.root.querySelectorAll('button, a[href], input, textarea, summary, [tabindex="0"]')]
        .filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length);
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || !elements.includes(document.activeElement))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    },

    stepQuantity(button, direction) {
      if (this.busy) return;
      const input = button.closest('[data-cart-item]').querySelector('[data-cart-quantity]');
      const current = Number(input.value), step = Number(input.step) || 1;
      const minimum = Number(input.dataset.minimum) || 1;
      input.value = direction < 0 && current <= minimum ? 0 : Math.max(minimum, current + direction * step);
      this.changeQuantity(input, button);
    },

    changeQuantity(input, focus = input) {
      if (this.busy) return;
      const item = input.closest('[data-cart-item]'), quantity = Number(input.value);
      if (!Number.isInteger(quantity) || quantity < 0 || !input.checkValidity() || (quantity > 0 && quantity < Number(input.dataset.minimum))) {
        input.reportValidity();
        input.value = item.dataset.quantity;
        return;
      }
      if (quantity === Number(item.dataset.quantity)) return;
      return this.updateQuantity(item, quantity, focus);
    },

    removeItem(button) {
      return this.updateQuantity(button.closest('[data-cart-item]'), 0, button);
    },

    async updateQuantity(item, quantity, focus) {
      if (this.busy) return;
      this.busy = true;
      this.error = '';
      const helper = this.$store.xCartHelper;
      const key = item.dataset.key;
      const state = {
        scroll: this.root.querySelector('[data-cart-body]').scrollTop,
        expanded: [...this.root.querySelectorAll('details[open]')].map(el => el.dataset.cartExtra),
        gift: this.root.querySelector('#AtelierCartGift')?.value,
        note: this.root.querySelector('#AtelierCartNote')?.value,
        control: focus?.dataset.quantityStep || (focus?.matches('[data-remove-item]') ? 'remove' : 'input')
      };
      try {
        if (await this.saveNotes() === false) {
          item.querySelector('[data-cart-quantity]').value = item.dataset.quantity;
          return;
        }
        await helper.withCartLock(async standardEvent => {
          const response = await fetch(`${Shopify.routes.root}cart/change.js`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ id: key, quantity, sections: helper.getSectionsToRender().map(section => section.id), sections_url: location.pathname })
          });
          const cart = await helper.cartJson(response);
          if (cart.errors || cart.status >= 400) throw new Error(cart.description || cart.message || this.root.dataset.errorMessage);
          state.gift = this.root.querySelector('#AtelierCartGift')?.value;
          state.note = this.root.querySelector('#AtelierCartNote')?.value;
          await helper.reRenderSections(cart.sections);
          helper.currentItemCount = cart.item_count;
          standardEvent.settle(cart);
          await this.$nextTick();
          const body = this.root.querySelector('[data-cart-body]');
          if (body) body.scrollTop = state.scroll;
          this.root.querySelectorAll('details').forEach(el => { el.open = state.expanded.includes(el.dataset.cartExtra); });
          const gift = this.root.querySelector('#AtelierCartGift'), note = this.root.querySelector('#AtelierCartNote');
          if (gift) gift.value = state.gift || '';
          if (note) note.value = state.note || '';
          this.busy = false;
          await this.$nextTick();
          const updated = [...this.root.querySelectorAll('[data-cart-item]')].find(el => el.dataset.key === key);
          const selector = state.control === 'remove' ? '[data-remove-item]' : state.control === 'input' ? '[data-cart-quantity]' : `[data-quantity-step="${state.control}"]`;
          if (this.$store.xMiniCart.open) (updated?.querySelector(selector) || this.root.querySelector('#CloseCart'))?.focus({ preventScroll: true });
          this.announcement = this.root.querySelector('.atelier-cart__count')?.textContent || '';
          document.dispatchEvent(new CustomEvent('eurus:cart:items-changed'));
          document.dispatchEvent(new CustomEvent(`eurus:product-card:clear:${item.dataset.productId}`));
        }, { type: 'shopify:cart:lines-update', action: quantity ? 'update' : 'remove', context: 'cart', lines: [{ id: key, quantity }] });
      } catch (error) {
        this.error = this.errorMessage(error);
        const input = item.querySelector('[data-cart-quantity]');
        if (input) input.value = item.dataset.quantity;
      } finally {
        this.busy = false;
      }
    },

    scheduleNote(type, value) {
      this.pendingNotes[type] = value;
      clearTimeout(this.noteTimer);
      this.noteTimer = setTimeout(() => this.saveNotes(), 350);
    },

    async saveNotes() {
      clearTimeout(this.noteTimer);
      // Keep newer edits pending until the current save has succeeded or restored its values.
      while (this.noteRequest) {
        if ((await this.noteRequest) === false) return false;
      }
      const pending = { ...this.pendingNotes };
      if (!Object.keys(pending).length) return true;
      this.pendingNotes = {};
      const data = {};
      if ('note' in pending) data.note = pending.note;
      if ('gift' in pending) data.attributes = { 'Gift message': pending.gift };
      const helper = this.$store.xCartHelper;
      this.noteRequest = helper.withCartLock(async standardEvent => {
        const response = await fetch(`${Shopify.routes.root}cart/update.js`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data)
        });
        const cart = await helper.cartJson(response);
        if (cart.errors || cart.status >= 400) throw new Error(cart.description || cart.message || this.root.dataset.errorMessage);
        if (window.Eurus) window.Eurus.cart_attributes = cart.attributes;
        standardEvent.settle(cart);
      }, helper.describeCartUpdate(data)).then(() => {
        this.error = '';
        return true;
      }).catch(error => {
        this.pendingNotes = { ...pending, ...this.pendingNotes };
        this.error = this.errorMessage(error);
        return false;
      }).finally(() => { this.noteRequest = null; });
      return this.noteRequest;
    },

    errorMessage(error) {
      return error instanceof TypeError || error.status >= 500
        ? this.root.dataset.errorMessage
        : error.message || this.root.dataset.errorMessage;
    },

    async checkout(event) {
      if (this.checkingOut || this.busy) { event.preventDefault(); return; }
      event.preventDefault();
      this.checkingOut = true;
      const saved = await this.saveNotes();
      await this.$store.xCartHelper.waitForCartUpdate();
      if (saved === false || Object.keys(this.pendingNotes).length) { this.checkingOut = false; return; }
      const input = document.createElement('input');
      input.type = 'hidden'; input.name = 'checkout'; input.value = 'checkout';
      event.target.append(input);
      HTMLFormElement.prototype.submit.call(event.target);
    },

    destroy() {
      clearTimeout(this.noteTimer);
    }
  }));
});
