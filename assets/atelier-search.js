document.addEventListener('alpine:init', () => {
  Alpine.data('xAtelierSearch', () => ({
    query: '',
    state: 'initial',
    announcement: '',
    composing: false,
    recent: [],
    cache: new Map(),
    controller: null,
    timer: null,
    requestId: 0,
    trigger: null,

    init() {
      try {
        const saved = JSON.parse(localStorage.getItem('atelier:recent-searches') || '[]');
        this.recent = Array.isArray(saved) ? saved.filter(term => typeof term === 'string').slice(0, 6) : [];
      } catch { this.recent = []; }
    },
    open(trigger) {
      if (this.$refs.dialog.open) return;
      this.trigger = trigger;
      this.clear(false);
      this.$store.xHeaderMenu?.closeMenu();
      if (this.$store.xHeaderMenu) this.$store.xHeaderMenu.openHamburgerMenu = false;
      this.$refs.dialog.showModal();
      document.documentElement.classList.add('atelier-search-open');
      trigger?.setAttribute('aria-expanded', 'true');
      this.$nextTick(() => this.$refs.input.focus({ preventScroll: true }));
    },
    close() {
      this.$refs.dialog.close();
      this.afterClose();
    },
    afterClose() {
      if (this.$refs.dialog.open) return;
      this.cancelRequest();
      document.documentElement.classList.remove('atelier-search-open');
      this.trigger?.setAttribute('aria-expanded', 'false');
      if (this.trigger?.isConnected) this.trigger.focus({ preventScroll: true });
    },
    cancelRequest() {
      clearTimeout(this.timer);
      this.controller?.abort();
      this.requestId++;
    },
    clear(focus = true) {
      this.cancelRequest();
      this.query = '';
      this.$refs.input.value = '';
      this.$refs.results.replaceChildren();
      this.state = 'initial';
      this.announcement = '';
      this.$refs.body.scrollTop = 0;
      if (focus) this.$refs.input.focus({ preventScroll: true });
    },
    onInput(value) {
      this.query = value;
      this.cancelRequest();
      if (this.composing) return;
      const term = value.trim();
      this.announcement = '';
      this.$refs.body.scrollTop = 0;
      if (term.length < 2) {
        this.state = 'initial';
        this.$refs.results.replaceChildren();
      } else if (this.$root.dataset.predictive !== 'true') {
        this.state = 'submit';
      } else {
        this.state = 'loading';
        this.timer = setTimeout(() => this.getResults(term), 220);
      }
    },
    searchTerm(term) {
      this.$refs.input.value = term;
      this.onInput(term);
      this.$refs.input.focus({ preventScroll: true });
    },
    async getResults(term) {
      this.cancelRequest();
      const requestId = this.requestId;
      const controller = new AbortController();
      this.controller = controller;
      this.state = 'loading';
      const limit = matchMedia('(min-width: 768px)').matches ? this.$root.dataset.desktopLimit : this.$root.dataset.mobileLimit;
      const key = `${term}|${limit}`;
      try {
        let html = this.cache.get(key);
        if (!html) {
          const params = new URLSearchParams({
            q: term,
            'resources[type]': `query,${this.$root.dataset.searchTypes}`,
            'resources[limit]': limit || '6',
            'resources[options][unavailable_products]': 'last',
            section_id: 'atelier-predictive-search',
          });
          const root = window.Shopify?.routes?.root || '/';
          const response = await fetch(`${root}search/suggest?${params}`, { signal: controller.signal });
          if (!response.ok) throw new Error('Search unavailable');
          const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
          const content = parsed.querySelector('[data-search-response]');
          if (!content) throw new Error('Missing search response');
          html = content.outerHTML;
          if (this.cache.size >= 20) this.cache.delete(this.cache.keys().next().value);
          this.cache.set(key, html);
        }
        // Requests can resolve out of order, including after a clear or close.
        if (requestId !== this.requestId || !this.$refs.dialog.open) return;
        this.$refs.results.innerHTML = html;
        const count = Number(this.$refs.results.firstElementChild.dataset.searchCount);
        this.state = count > 0 ? 'results' : 'empty';
        this.announcement = this.$refs.results.firstElementChild.dataset.searchAnnouncement;
      } catch (error) {
        if (error.name !== 'AbortError' && requestId === this.requestId && this.$refs.dialog.open) this.state = 'error';
      }
    },
    remember(term) {
      if (!term) return;
      this.recent = [term, ...this.recent.filter(item => item.toLocaleLowerCase() !== term.toLocaleLowerCase())].slice(0, 6);
      try { localStorage.setItem('atelier:recent-searches', JSON.stringify(this.recent)); } catch { /* Storage is optional. */ }
    },
    clearRecent() {
      this.recent = [];
      try { localStorage.removeItem('atelier:recent-searches'); } catch { /* Storage is optional. */ }
    },
    rememberResult(event) {
      if (event.target.closest('a[data-search-result]') && this.state === 'results') this.remember(this.query.trim());
    },
    submit(event) {
      if (!this.query.trim() || this.composing) {
        event.preventDefault();
        this.$refs.input.focus();
        return;
      }
      this.$refs.input.value = this.query.trim();
      this.remember(this.query.trim());
    },
    handleKeydown(event) {
      if (event.isComposing) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.close();
        return;
      }
      if (event.key === 'Tab') {
        const focusable = [...this.$refs.dialog.querySelectorAll('a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), [tabindex="0"]')].filter(el => el.getClientRects().length);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      if (event.target !== this.$refs.input && !event.target.matches('[data-search-result]')) return;
      const links = [...this.$refs.dialog.querySelectorAll('[data-search-result]')].filter(link => link.getClientRects().length);
      if (!links.length) return;
      event.preventDefault();
      const current = links.indexOf(document.activeElement);
      const next = current < 0 ? (event.key === 'ArrowDown' ? 0 : links.length - 1) : (current + (event.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
      links[next].focus();
    },
    destroy() {
      this.cancelRequest();
      if (this.$refs.dialog?.open) this.$refs.dialog.close();
      document.documentElement.classList.remove('atelier-search-open');
    },
  }));
});
