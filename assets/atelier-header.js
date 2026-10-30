document.addEventListener('alpine:init', () => {
  Alpine.data('xAtelierHeader', () => ({
    root: null,
    menu: null,
    activeMega: null,
    mobileOpen: false,
    mobilePane: 'root',
    paneTrigger: null,
    menuTrigger: null,
    closeTimer: null,
    focusTimer: null,
    mobileCloseTimer: null,
    frame: null,
    lastY: 0,
    controller: null,
    observer: null,
    cartObserver: null,

    init() {
      this.root = this.$el;
      this.controller = new AbortController();
      const options = { signal: this.controller.signal };
      this.lastY = window.scrollY;
      const schedule = () => {
        if (this.frame) return;
        this.frame = requestAnimationFrame(() => { this.frame = null; this.updateScroll(); });
      };
      window.addEventListener('scroll', schedule, { ...options, passive: true });
      window.addEventListener('resize', () => {
        this.measure();
        if (matchMedia('(min-width: 990px)').matches) this.closeMobile();
        else this.closeMega();
      }, options);
      document.addEventListener('click', event => {
        if (!this.root.contains(event.target)) this.closeMega();
      }, options);
      document.addEventListener('shopify:block:select', event => {
        const id = event.detail.blockId;
        if (!this.root.querySelector(`[aria-controls="AtelierMega-${id}"]`)) return;
        if (matchMedia('(min-width: 990px)').matches) this.showMega(id);
        else {
          this.openMobile(this.root.querySelector('.atelier-header__burger'));
          this.pushPane(id, this.menu.querySelector(`[aria-controls="AtelierPane-${id}"]`));
        }
      }, options);
      document.addEventListener('shopify:block:deselect', () => { this.closeMega(); this.closeMobile(); }, options);
      this.observer = new ResizeObserver(() => this.measure());
      this.observer.observe(this.root.querySelector('.atelier-header__links'));
      const cart = this.root.querySelector('.atelier-header__cart');
      if (cart) {
        this.cartObserver = new MutationObserver(() => {
          const count = cart.querySelector('.count_item')?.textContent.trim() || '0';
          cart.setAttribute('aria-label', cart.dataset.cartLabel.replace('__count__', count));
        });
        this.cartObserver.observe(cart.querySelector('#cart-icon-bubble'), { childList: true, subtree: true, characterData: true });
      }
      this.$nextTick(() => {
        this.menu = document.getElementById(this.root.querySelector('.atelier-header__burger').getAttribute('aria-controls'));
        this.measure();
      });
    },

    measure() {
      const links = this.root.querySelector('.atelier-header__links');
      const height = matchMedia('(min-width: 990px)').matches ? Math.max(93, links.offsetHeight + 1) : 75;
      this.root.style.setProperty('--atelier-header-height', `${height}px`);
      document.documentElement.style.setProperty('--header-height', `${height + 1}px`);
      this.updateScroll();
    },

    updateScroll() {
      const y = window.scrollY;
      const announcement = document.querySelector('.section-announcement');
      const offset = announcement ? Math.max(0, announcement.getBoundingClientRect().bottom) : 0;
      this.root.style.setProperty('--atelier-header-offset', `${offset}px`);
      const hero = document.querySelector('#MainContent > .shopify-section');
      const threshold = (hero?.offsetHeight || innerHeight) * .6;
      this.root.classList.toggle('is-solid', y > threshold);
      if (this.root.dataset.sticky === 'on-scroll-up' && y !== this.lastY) {
        this.root.classList.toggle('is-hidden', y > this.lastY && y > this.root.offsetHeight * 2 && !this.activeMega && !this.mobileOpen);
      }
      const progress = matchMedia('(min-width: 750px) and (prefers-reduced-motion: no-preference)').matches ? Math.min(y / 240, 1) : 0;
      this.root.style.setProperty('--header-compact', 1 - .26 * progress);
      this.root.style.setProperty('--header-logo-scale', 1 - .12 * progress);
      this.root.style.setProperty('--header-bar-height', `${this.root.querySelector('.atelier-header__bar').offsetHeight}px`);
      this.lastY = y;
    },

    enterMega(id) {
      if (matchMedia('(hover: hover) and (min-width: 990px)').matches) this.showMega(id);
    },
    leaveMega(id) {
      clearTimeout(this.closeTimer);
      this.closeTimer = setTimeout(() => { if (this.activeMega === id) this.closeMega(); }, 160);
    },
    toggleMega(id) { this.activeMega === id ? this.closeMega() : this.showMega(id); },
    showMega(id, focus = false) {
      clearTimeout(this.closeTimer);
      this.activeMega = id;
      this.root.classList.remove('is-hidden');
      if (focus) this.$nextTick(() => this.root.querySelector(`#AtelierMega-${id} a`)?.focus());
    },
    closeMega(focus = false) {
      clearTimeout(this.closeTimer);
      const id = this.activeMega;
      this.activeMega = null;
      if (focus && id) this.root.querySelector(`[aria-controls="AtelierMega-${id}"]`)?.focus();
    },
    onMegaFocusOut(event, id) {
      const panel = this.root.querySelector(`#AtelierMega-${id}`);
      const item = this.root.querySelector(`[aria-controls="AtelierMega-${id}"]`)?.closest('li');
      if (!panel?.contains(event.relatedTarget) && !item?.contains(event.relatedTarget)) this.closeMega();
    },

    openMobile(trigger) {
      if (this.menu.open) return;
      this.closeMega();
      this.menuTrigger = trigger;
      this.mobileOpen = true;
      this.menu.showModal();
      document.documentElement.classList.add('atelier-menu-open');
      requestAnimationFrame(() => this.menu.classList.add('is-open'));
    },
    trapMobileFocus(event) {
      const elements = [...this.menu.querySelectorAll('a[href], button:not([disabled]), [tabindex="0"]')]
        .filter(el => el.tabIndex >= 0 && !el.closest('[inert]') && el.getClientRects().length);
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || !elements.includes(document.activeElement))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !elements.includes(document.activeElement))) {
        event.preventDefault();
        first?.focus();
      }
    },
    closeMobile() {
      if (!this.menu?.open) return;
      this.menu.classList.remove('is-open');
      clearTimeout(this.focusTimer);
      clearTimeout(this.mobileCloseTimer);
      this.mobileCloseTimer = setTimeout(() => this.menu.close(), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 420);
    },
    afterMobileClose() {
      clearTimeout(this.focusTimer);
      this.mobileOpen = false;
      document.documentElement.classList.remove('atelier-menu-open');
      if (this.menuTrigger?.getClientRects().length) this.menuTrigger.focus({ preventScroll: true });
    },
    pushPane(id, trigger) {
      this.paneTrigger = trigger;
      this.mobilePane = id;
      clearTimeout(this.focusTimer);
      this.focusTimer = setTimeout(() => this.menu.querySelector(`#AtelierPane-${id} .atelier-menu__heading`)?.focus({ preventScroll: true }), 220);
      this.menu.querySelector('.atelier-menu__body').scrollTop = 0;
    },
    popPane() {
      this.mobilePane = 'root';
      clearTimeout(this.focusTimer);
      this.$nextTick(() => this.paneTrigger?.focus({ preventScroll: true }));
    },
    destroy() {
      clearTimeout(this.closeTimer);
      clearTimeout(this.focusTimer);
      clearTimeout(this.mobileCloseTimer);
      cancelAnimationFrame(this.frame);
      this.observer?.disconnect();
      this.cartObserver?.disconnect();
      this.controller?.abort();
      if (this.mobileOpen) {
        this.menu?.close();
        document.documentElement.classList.remove('atelier-menu-open');
      }
    },
  }));
});
