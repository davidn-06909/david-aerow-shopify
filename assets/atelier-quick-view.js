(() => {
  const register = () => {
    Alpine.data('xAtelierQuickViewDialog', () => ({
      init() {
        this.dialog = this.$refs.dialog;
        this.$watch('$store.xQuickView.show', open => this.sync(open));
        this.$watch('$store.xQuickView.loading', loading => {
          if (!loading) this.$nextTick(() => { this.$refs.content.scrollTop = 0; });
        });
        this.sync(this.$store.xQuickView.show);
      },
      sync(open) {
        if (open) {
          this.$store.xFocusElement?.removeTrapFocus();
          document.documentElement.classList.add('atelier-quick-view-open');
          if (!this.dialog.open) this.dialog.showModal();
          this.$refs.content.scrollTop = 0;
          this.$nextTick(() => this.dialog.querySelector('#QuickViewClose').focus({ preventScroll: true }));
        } else {
          if (this.dialog.open) this.dialog.close();
          document.documentElement.classList.remove('atelier-quick-view-open');
        }
      },
      onClose() {
        if (this.dialog.open) return;
        document.documentElement.classList.remove('atelier-quick-view-open');
        if (this.$store.xQuickView.show) this.$store.xQuickView.close();
      },
      closeOutside(event) {
        if (event.target !== this.dialog) return;
        const rect = this.dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
          this.$store.xQuickView.close();
        }
      },
      trapFocus(event) {
        const focusable = [...this.dialog.querySelectorAll('button, a[href], input, select, textarea, [tabindex="0"]')]
          .filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
          .filter(el => el.type !== 'radio' || el.checked || !this.dialog.querySelector(`input[type="radio"][name="${el.name}"]:checked`));
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !this.dialog.contains(document.activeElement))) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      },
      destroy() {
        if (this.dialog.open) this.dialog.close();
        document.documentElement.classList.remove('atelier-quick-view-open');
      }
    }));

    Alpine.data('xAtelierQuickViewProduct', () => ({
      variant: null,
      variants: [],
      selected: [],
      strings: {},
      quantity: 1,
      activeMedia: 0,
      swipeStart: null,
      init() {
        this.root = this.$el;
        const data = JSON.parse(this.root.querySelector('[data-qv-product]').textContent);
        this.variants = data.variants;
        this.strings = data.strings;
        this.variant = this.variants.find(item => item.id === data.selectedId) || this.variants[0] || null;
        this.selected = this.variant ? [...this.variant.options] : [];
        this.quantity = this.variant?.minimum || 1;
        this.frames = [...this.root.querySelectorAll('[data-qv-media-id]')];
        this.showVariantMedia();
        this.$watch('$store.xQuickView.show', open => { if (!open) this.pauseMedia(); });
      },
      get productLink() {
        const url = new URL(this.root.dataset.productUrl, location.origin);
        if (this.variant) url.searchParams.set('variant', this.variant.id);
        return url.pathname + url.search;
      },
      get bundleDisabled() {
        const store = this.$store.xQuickView;
        return Boolean(store.bundleTarget && (store.bundleStepFull || store.bundleAddedIds.some(id => id == this.variant?.id)));
      },
      get purchaseLabel() {
        if (!this.variant) return this.strings.unavailable;
        if (!this.variant.available) return this.strings.soldOut;
        const store = this.$store.xQuickView;
        if (store.bundleTarget) {
          if (store.bundleAddedIds.some(id => id == this.variant.id)) return store.bundleAddedLabel || store.bundleButtonLabel || this.strings.add;
          return store.bundleButtonLabel || this.strings.add;
        }
        return this.strings.add;
      },
      selectOption(index, value) {
        this.selected[index] = value;
        this.variant = this.variants.find(item => item.options.every((option, position) => option === this.selected[position])) || null;
        this.normalizeQuantity();
        this.showVariantMedia();
        this.root.dispatchEvent(new CustomEvent(`eurus:product-page-variant-select:updated:${this.$store.xQuickView.sectionId}`, { bubbles: true }));
      },
      optionAvailability(index, value) {
        const matching = this.variants.filter(item => item.options.every((option, position) => option === (position === index ? value : this.selected[position])));
        if (!matching.length) return 'unavailable';
        return matching.some(item => item.available) ? '' : 'sold-out';
      },
      normalizeQuantity(value = this.quantity) {
        const minimum = this.variant?.minimum || 1, increment = this.variant?.increment || 1;
        let normalized = Math.max(minimum, Math.floor(Number(value) || minimum));
        if (this.variant?.maximum) normalized = Math.min(normalized, this.variant.maximum);
        this.quantity = normalized - (normalized - minimum) % increment;
      },
      stepQuantity(direction) {
        this.quantity = (Number(this.quantity) || this.variant?.minimum || 1) + direction * (this.variant?.increment || 1);
        this.normalizeQuantity();
      },
      showVariantMedia() {
        const index = this.frames.findIndex(frame => Number(frame.dataset.qvMediaId) === this.variant?.mediaId);
        if (index >= 0) this.showMedia(index);
      },
      showMedia(index) {
        if (!this.frames.length) return;
        this.pauseMedia();
        this.activeMedia = (index + this.frames.length) % this.frames.length;
        this.$nextTick(() => {
          const thumb = this.root.querySelector(`[data-qv-thumb="${this.activeMedia}"]`);
          const strip = thumb?.parentElement;
          if (strip && (thumb.offsetLeft < strip.scrollLeft || thumb.offsetLeft + thumb.offsetWidth > strip.scrollLeft + strip.clientWidth)) {
            strip.scrollTo({ left: thumb.offsetLeft - 2, behavior: 'instant' });
          }
        });
      },
      pauseMedia() {
        this.root.querySelectorAll('video').forEach(video => video.pause());
        this.root.querySelectorAll('iframe').forEach(frame => {
          frame.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: '' }), '*');
          frame.contentWindow?.postMessage({ method: 'pause' }, '*');
        });
      },
      startSwipe(event) {
        if (event.target.closest('video, iframe, model-viewer') || !event.isPrimary) return;
        this.swipeStart = { x: event.clientX, y: event.clientY };
      },
      endSwipe(event) {
        if (!this.swipeStart) return;
        const dx = event.clientX - this.swipeStart.x, dy = event.clientY - this.swipeStart.y;
        this.swipeStart = null;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) this.showMedia(this.activeMedia + (dx < 0 ? 1 : -1));
      },
      destroy() { this.pauseMedia(); }
    }));
  };
  if (window.Alpine) register();
  else document.addEventListener('alpine:init', register, { once: true });
})();
