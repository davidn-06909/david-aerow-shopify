(() => {
  const register = () => Alpine.data('xAtelierProduct', () => ({
    variant: null,
    variants: [],
    selected: [],
    strings: {},
    quantity: 1,
    activeMedia: 0,
    mediaCaption: '',
    engravingEnabled: false,
    engraving: '',
    stickyVisible: false,
    shareMessage: '',

    init() {
      this.root = this.$el;
      const data = JSON.parse(this.root.querySelector('[data-atelier-product-data]').textContent);
      this.variants = data.variants;
      this.strings = data.strings;
      this.variant = this.variants.find(variant => variant.id === data.selectedId) || this.variants[0] || null;
      this.selected = this.variant ? [...this.variant.options] : [];
      this.quantity = this.variant?.minimum || 1;
      this.engravingEnabled = this.root.querySelector('[data-engraving]')?.dataset.required === 'true';
      this.stage = this.root.querySelector('[data-media-stage]');
      this.frames = [...this.stage.querySelectorAll('[data-media-id]')];
      // A variant link should open with that metal visible without scrolling past the product information.
      const initialFrame = this.frames.find(frame => Number(frame.dataset.mediaId) === this.variant?.mediaId);
      if (initialFrame && initialFrame !== this.frames[0]) {
        this.stage.prepend(initialFrame);
        this.frames = [...this.stage.querySelectorAll('[data-media-id]')];
      }
      this.mobile = window.matchMedia('(max-width: 989.98px)');
      this.updateCaption();
      this.abortController = new AbortController();
      const signal = this.abortController.signal;
      const header = document.querySelector('.atelier-header');
      this.details = this.root.querySelector('.atelier-product__details');
      this.lastScrollY = window.scrollY;
      if (header && 'ResizeObserver' in window) {
        this.headerObserver = new ResizeObserver(() => {
          this.headerHeight = header.getBoundingClientRect().height;
          this.root.style.setProperty('--pdp-header-height', `${this.headerHeight}px`);
          this.onScroll();
        });
        this.headerObserver.observe(header);
      }
      this.onScroll = () => {
        if (this.scrollFrame) return;
        this.scrollFrame = requestAnimationFrame(() => {
          this.scrollFrame = null;
          this.trackMedia();
          this.updateStickyDetails();
        });
      };
      this.stage.addEventListener('scroll', this.onScroll, { passive: true, signal });
      window.addEventListener('scroll', this.onScroll, { passive: true, signal });
      window.addEventListener('resize', this.onScroll, { passive: true, signal });
      this.root.addEventListener('shopify:block:select', event => {
        event.target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, { signal });
      this.root.querySelector('[data-product-zoom]')?.addEventListener('keydown', event => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          event.preventDefault();
          this.stepZoom(event.key === 'ArrowRight' ? 1 : -1);
        }
      }, { signal });
      // Observe the whole panel, including expandable details, app blocks and engraving.
      if (this.details && 'ResizeObserver' in window) {
        this.detailsObserver = new ResizeObserver(this.onScroll);
        this.detailsObserver.observe(this.details);
      }
      this.$watch('stickyVisible', this.onScroll);
      this.onScroll();
      this.$nextTick(() => {
        if (this.mobile.matches && this.variant?.mediaId) this.showVariantMedia(false);
      });
      this.onHistory = () => {
        const id = Number(new URL(location.href).searchParams.get('variant'));
        const variant = this.variants.find(item => item.id === id) || this.variants[0];
        if (!variant) return;
        this.selected = [...variant.options];
        this.syncVariant(false);
        this.root.querySelectorAll('[data-option-index]').forEach(input => {
          input.checked = input.value === this.selected[Number(input.dataset.optionIndex)];
        });
      };
      window.addEventListener('popstate', this.onHistory, { signal });
    },

    destroy() {
      this.abortController?.abort();
      this.headerObserver?.disconnect();
      this.detailsObserver?.disconnect();
      cancelAnimationFrame(this.scrollFrame);
      if (this.zoom?.open) this.zoom.close();
    },

    selectOption(index, value) {
      this.selected[index] = value;
      this.syncVariant();
    },

    syncVariant(updateHistory = true) {
      this.variant = this.variants.find(item => item.options.every((value, index) => value === this.selected[index])) || null;
      if (!this.variant) return;
      this.quantity = Math.max(this.variant.minimum, Number(this.quantity) || this.variant.minimum);
      if (this.variant.maximum) this.quantity = Math.min(this.quantity, this.variant.maximum);
      const remainder = (this.quantity - this.variant.minimum) % this.variant.increment;
      this.quantity -= remainder;
      if (updateHistory) {
        const url = new URL(location.href);
        url.searchParams.set('variant', this.variant.id);
        history.replaceState({}, '', url);
      }
      this.showVariantMedia();
      this.root.dispatchEvent(new CustomEvent('atelier:variant:change', { bubbles: true, detail: { variant: this.variant } }));
    },

    optionAvailability(index, value) {
      const matching = this.variants.filter(item => item.options.every((option, position) => option === (position === index ? value : this.selected[position])));
      if (!matching.length) return 'unavailable';
      return matching.some(item => item.available) ? '' : 'sold-out';
    },

    stepQuantity(direction) {
      const minimum = this.variant?.minimum || 1;
      const increment = this.variant?.increment || 1;
      this.quantity = Math.max(minimum, (Number(this.quantity) || minimum) + direction * increment);
      if (this.variant?.maximum) this.quantity = Math.min(this.quantity, this.variant.maximum);
    },

    updateCaption() {
      this.mediaCaption = this.frames[this.activeMedia]?.dataset.mediaCaption || '';
    },

    updateStickyDetails() {
      const scrollY = Math.max(0, window.scrollY);
      const delta = scrollY - this.lastScrollY;
      this.lastScrollY = scrollY;
      const buy = this.root.querySelector('[data-atelier-form]');
      // Measure on scroll as well as resize so a fast jump past the form also reveals the bar.
      this.stickyVisible = Boolean(buy && buy.getBoundingClientRect().bottom < 0);
      if (!this.details || this.mobile.matches) {
        this.stickyTop = null;
        this.stickyMinimum = null;
        this.details?.style.removeProperty('--pdp-details-top');
        return;
      }
      const top = (this.headerHeight || 94) + 18;
      const bar = this.root.querySelector('.atelier-product__sticky');
      const bottom = 18 + (this.stickyVisible ? bar?.offsetHeight || 0 : 0);
      const minimum = Math.min(top, window.innerHeight - bottom - this.details.offsetHeight);
      // Tall panels move with the page, then stick at either edge as scroll direction changes.
      // Keeping one sticky container avoids trapping scrolling in a second scrollable panel.
      const wasAtBottom = this.stickyMinimum != null && this.stickyMinimum < top && Math.abs(this.stickyTop - this.stickyMinimum) < 1;
      const previous = wasAtBottom && delta === 0 ? minimum : this.stickyTop ?? top;
      this.stickyTop = Math.max(minimum, Math.min(top, previous - delta));
      this.stickyMinimum = minimum;
      this.details.style.setProperty('--pdp-details-top', `${this.stickyTop}px`);
    },

    trackMedia() {
      if (!this.frames.length) return;
      const stageRect = this.stage.getBoundingClientRect();
      let best = 0;
      let distance = Infinity;
      this.frames.forEach((frame, index) => {
        const rect = frame.getBoundingClientRect();
        const current = this.mobile.matches
          ? Math.abs(rect.left - stageRect.left)
          : Math.abs(rect.top + rect.height / 2 - window.innerHeight / 2);
        if (current < distance) { distance = current; best = index; }
      });
      this.activeMedia = best;
      this.updateCaption();
    },

    showVariantMedia(animate = true) {
      const index = this.frames.findIndex(frame => Number(frame.dataset.mediaId) === this.variant?.mediaId);
      if (index < 0) return;
      this.showMedia(index, animate);
    },

    showMedia(index, animate = true) {
      if (!this.frames.length) return;
      index = Math.max(0, Math.min(index, this.frames.length - 1));
      const frame = this.frames[index];
      const behavior = animate && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant';
      if (this.mobile.matches) {
        const left = frame.getBoundingClientRect().left - this.stage.getBoundingClientRect().left + this.stage.scrollLeft;
        this.stage.scrollTo({ left, behavior });
      } else if (animate) {
        const offset = document.querySelector('.atelier-header')?.getBoundingClientRect().height || 94;
        window.scrollTo({ top: frame.getBoundingClientRect().top + window.scrollY - offset - 18, behavior });
      }
      this.activeMedia = index;
      this.updateCaption();
    },

    toggleEngraving() {
      const input = this.root.querySelector('[data-engraving-input]');
      if (!input) return;
      input.setCustomValidity('');
      if (!this.engravingEnabled) this.engraving = '';
      else this.$nextTick(() => input.focus({ preventScroll: true }));
    },

    charactersLeft() {
      const max = Number(this.root.querySelector('[data-engraving-input]')?.dataset.max) || 20;
      return this.strings.charactersLeft.replace('[count]', Math.max(0, max - this.engraving.length));
    },

    validatePurchase() {
      const form = this.root.querySelector('[data-atelier-form]');
      const inscription = this.root.querySelector('[data-engraving-input]');
      if (inscription) {
        inscription.disabled = !this.engravingEnabled;
        inscription.required = this.engravingEnabled;
        inscription.setCustomValidity(this.engravingEnabled && !this.engraving.trim() ? this.strings.engravingRequired : '');
      }
      return Boolean(this.variant?.available && form?.reportValidity());
    },

    openZoom(index, trigger) {
      this.zoom = this.root.querySelector('[data-product-zoom]');
      this.zoomTrigger = trigger;
      this.zoomIndex = this.frames.indexOf(trigger.closest('[data-media-id]'));
      this.renderZoom();
      this.zoom.showModal();
      this.zoom.querySelector('button').focus();
    },

    stepZoom(direction) {
      let index = this.zoomIndex;
      for (let count = 0; count < this.frames.length; count++) {
        index = (index + direction + this.frames.length) % this.frames.length;
        if (this.frames[index].querySelector('.atelier-product__image-link')) {
          this.zoomIndex = index;
          this.renderZoom();
          return;
        }
      }
    },

    renderZoom() {
      const frame = this.frames[this.zoomIndex];
      const image = this.zoom.querySelector('[data-zoom-image]');
      image.src = frame.querySelector('.atelier-product__image-link').href;
      image.alt = frame.dataset.mediaCaption;
      this.zoom.querySelector('[data-zoom-caption]').textContent = frame.dataset.mediaCaption;
    },

    closeZoom() { this.zoom?.close(); },
    restoreZoomFocus() { this.zoomTrigger?.focus({ preventScroll: true }); },

    async shareProduct() {
      const url = location.href;
      try {
        if (navigator.share) await navigator.share({ title: document.title, url });
        else { await navigator.clipboard.writeText(url); this.shareMessage = this.strings.copied; }
      } catch (error) {
        if (error.name !== 'AbortError') this.shareMessage = url;
      }
    }
  }));
  if (window.Alpine) register();
  else document.addEventListener('alpine:init', register, { once: true });

  class AtelierProductRecommendations extends HTMLElement {
    connectedCallback() {
      if (this.querySelector('[data-recommendation-card]')) return;
      if (!('IntersectionObserver' in window)) { this.load(); return; }
      this.observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        this.observer.disconnect();
        this.load();
      }, { rootMargin: '400px' });
      this.observer.observe(this);
    }
    disconnectedCallback() { this.observer?.disconnect(); this.request?.abort(); }
    async load() {
      this.request = new AbortController();
      try {
        const response = await fetch(this.dataset.url, { signal: this.request.signal });
        if (!response.ok) throw new Error('Recommendations unavailable');
        const document = new DOMParser().parseFromString(await response.text(), 'text/html');
        const content = document.querySelector('[data-recommendations-content]');
        if (content?.querySelector('[data-recommendation-card]')) {
          this.querySelector('[data-recommendations-content]').replaceWith(content);
        } else this.hidden = true;
      } catch (error) {
        if (error.name !== 'AbortError') this.hidden = true;
      }
    }
  }
  if (!customElements.get('atelier-product-recommendations')) customElements.define('atelier-product-recommendations', AtelierProductRecommendations);
})();
