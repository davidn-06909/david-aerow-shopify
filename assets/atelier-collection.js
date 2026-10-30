(() => {
  const register = () => Alpine.data('xAtelierCollection', () => ({
    columns: 4,
    loading: false,
    filtersOpen: false,
    announcement: '',
    quickViewTrigger: null,
    filterTrigger: null,
    controller: null,
    requestId: 0,
    timer: null,

    init() {
      this.root = this.$el;
      this.root.dataset.enhanced = 'true';
      this.columns = Number(this.root.style.getPropertyValue('--collection-columns')) || 4;
      try {
        const saved = Number(sessionStorage.getItem('atelier:collection-columns'));
        if (!this.root.hasAttribute('data-fixed-columns') && [2, 3, 4].includes(saved)) this.setColumns(saved);
      } catch { /* Storage can be unavailable in private browsing. */ }
      this.$watch('$store.xQuickView?.show', visible => {
        if (!visible && this.quickViewTrigger) {
          this.$store.xFocusElement?.removeTrapFocus();
          if (this.quickViewTrigger.isConnected) this.quickViewTrigger.focus({ preventScroll: true });
          this.quickViewTrigger = null;
        }
      });
    },
    destroy() {
      this.controller?.abort();
      clearTimeout(this.timer);
      document.documentElement.classList.remove('atelier-collection-open');
    },
    setColumns(value) {
      this.columns = value;
      this.root.style.setProperty('--collection-columns', value);
      try { sessionStorage.setItem('atelier:collection-columns', value); } catch { /* Optional preference. */ }
    },
    filterForm() { return this.root.querySelector('.atelier-collection__filters'); },
    openFilters(trigger) {
      const form = this.filterForm();
      if (!form || this.filtersOpen) return;
      this.filterTrigger = trigger;
      // Move a single form to the modal so IDs, values and submitted parameters stay unique.
      this.$refs.filtersBody.append(form);
      this.$refs.filtersDialog.showModal();
      this.filtersOpen = true;
      document.documentElement.classList.add('atelier-collection-open');
      this.$refs.filtersDialog.querySelector('button').focus({ preventScroll: true });
    },
    closeFilters() {
      if (!this.filtersOpen) return;
      this.$refs.filtersDialog.close();
      this.filtersOpen = false;
      document.documentElement.classList.remove('atelier-collection-open');
      const form = this.filterForm();
      // Discard unapplied mobile changes when dismissing the drawer.
      form.reset();
      this.root.querySelector('[data-filter-home]')?.append(form);
      this.updateSelectedCount();
      this.filterTrigger?.focus({ preventScroll: true });
    },
    trapFilters(event) {
      const dialog = this.$refs.filtersDialog;
      const controls = [...dialog.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select, summary')]
        .filter(control => control.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    },
    normalizePrice(form, changedInput) {
      const min = form.querySelector('[data-price-min]');
      const max = form.querySelector('[data-price-max]');
      if (!min || !max) return;
      for (const input of [min, max]) {
        if (input.value === '') continue;
        const value = Number(input.value);
        input.value = Number.isFinite(value) ? Math.round(Math.max(0, Math.min(Number(input.max), value)) * 100) / 100 : '';
      }
      if (min.value !== '' && max.value !== '' && Number(min.value) > Number(max.value)) {
        if (changedInput === max) min.value = max.value;
        else max.value = min.value;
      }
    },
    updateSelectedCount() {
      const form = this.filterForm();
      if (!form) return;
      const count = form.querySelectorAll('input[type="checkbox"]:checked').length +
        (Array.from(form.querySelectorAll('input[type="number"]')).some(input => input.value !== '') ? 1 : 0);
      form.querySelector('[data-filter-clear]').hidden = count < 2;
    },
    filterChanged(event) {
      this.normalizePrice(event.currentTarget, event.target);
      this.updateSelectedCount();
      if (this.filtersOpen) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.applyFilters(this.filterForm()), 200);
    },
    formUrl(form) {
      const url = new URL(form.action);
      const params = new URLSearchParams(new FormData(form));
      for (const [key, value] of [...params]) if (value === '') params.delete(key);
      url.search = params.toString();
      return url;
    },
    applyFilters(form) {
      clearTimeout(this.timer);
      this.normalizePrice(form);
      const url = this.formUrl(form);
      this.closeFilters();
      this.render(url.href);
    },
    submitSort(form) {
      clearTimeout(this.timer);
      // Read current filters, including a checkbox changed immediately before sorting.
      const facetForm = this.filterForm();
      const url = facetForm ? this.formUrl(facetForm) : new URL(location.href);
      url.searchParams.set('sort_by', form.elements.sort_by.value);
      url.searchParams.delete('page');
      this.render(url.href);
    },
    clearFilters() {
      const form = this.filterForm();
      if (this.filtersOpen) {
        form.querySelectorAll('input[type="checkbox"]').forEach(input => { input.checked = false; });
        form.querySelectorAll('input[type="number"]').forEach(input => { input.value = ''; });
        this.updateSelectedCount();
      } else this.render(form.querySelector('[data-filter-clear]').href);
    },
    beginUpdate(url) {
      const searchMarker = this.root.querySelector('[data-search-event]');
      if (searchMarker) {
        const Ctor = window.StandardEvents?.SearchUpdateEvent;
        if (!Ctor) return null;
        try {
          const search = { query: searchMarker.dataset.query };
          const productFilters = Ctor.parseProductFilters(url.searchParams);
          const sortKey = Ctor.getSortKey(url.searchParams);
          if (productFilters) search.productFilters = productFilters;
          if (sortKey) search.sortKey = sortKey;
          const deferred = Ctor.createPromise();
          deferred.promise.catch(() => {});
          this.root.dispatchEvent(new Ctor({ search, promise: deferred.promise }));
          return deferred;
        } catch { return null; }
      }
      const Ctor = window.StandardEvents?.CollectionUpdateEvent;
      const marker = this.root.querySelector('[data-collection-event]');
      if (!Ctor || !marker) return null;
      try {
        const collection = JSON.parse(marker.getAttribute('view-event-payload')).collection;
        const deferred = Ctor.createPromise();
        const event = new Ctor({ collection: { id: collection.id, handle: collection.handle, productsCount: Number(marker.dataset.allProductsCount) }, promise: deferred.promise });
        const productFilters = Ctor.parseProductFilters(url.searchParams);
        const sortKey = Ctor.getSortKey(url.searchParams);
        if (productFilters) event.productFilters = productFilters;
        if (sortKey) event.sortKey = sortKey;
        deferred.promise.catch(() => {});
        this.root.dispatchEvent(event);
        return deferred;
      } catch { return null; }
    },
    async render(href, updateHistory = true, append = false) {
      if (append && this.loading) return;
      clearTimeout(this.timer);
      this.controller?.abort();
      this.controller = new AbortController();
      const requestId = ++this.requestId;
      const url = new URL(href, location.origin);
      const requestUrl = new URL(url);
      requestUrl.searchParams.set('section_id', this.root.dataset.sectionId);
      const focusId = document.activeElement?.id;
      const focusWasChip = document.activeElement?.classList.contains('atelier-collection__chip');
      const openDetails = new Map([...this.root.querySelectorAll('details[data-filter-key]')].map(el => [el.dataset.filterKey, el.open]));
      const update = append ? null : this.beginUpdate(url);
      this.loading = true;
      this.announcement = this.root.dataset.loadingLabel;
      try {
        const response = await fetch(requestUrl, { signal: this.controller.signal });
        if (!response.ok) throw new Error('Collection request failed');
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
        if (requestId !== this.requestId) return;
        const content = doc.querySelector('[data-collection-content]');
        if (!content) throw new Error('Collection section missing');
        const newCards = [...content.querySelectorAll('[data-collection-card]')];
        if (append) {
          const grid = this.root.querySelector('[data-collection-grid]');
          const existing = new Set([...grid.querySelectorAll('.atelier-work-card__link')].map(el => el.getAttribute('href')));
          for (const card of newCards) {
            if (!existing.has(card.querySelector('.atelier-work-card__link')?.getAttribute('href'))) grid.append(card);
          }
          this.root.querySelector('[data-collection-pagination]').replaceWith(content.querySelector('[data-collection-pagination]'));
          this.$nextTick(() => newCards[0]?.querySelector('a')?.focus({ preventScroll: true }));
        } else {
          this.root.querySelector('[data-collection-content]').replaceWith(content);
          this.root.querySelector('[data-collection-count]').textContent = doc.querySelector('[data-collection-count]').textContent;
          this.root.querySelector('.atelier-collection__sort')?.replaceWith(doc.querySelector('.atelier-collection__sort'));
          const badge = this.root.querySelector('[data-filter-badge]');
          const newBadge = doc.querySelector('[data-filter-badge]');
          if (badge && newBadge) { badge.textContent = newBadge.textContent; badge.hidden = newBadge.hidden; }
          for (const details of content.querySelectorAll('details[data-filter-key]')) {
            if (openDetails.has(details.dataset.filterKey)) details.open = openDetails.get(details.dataset.filterKey);
          }
          this.$nextTick(() => {
            const target = focusId ? document.getElementById(focusId) : null;
            if (target && !target.disabled) target.focus({ preventScroll: true });
            else if (focusWasChip) this.root.querySelector('.atelier-collection__chip, .atelier-collection__facet summary')?.focus({ preventScroll: true });
          });
        }
        if (updateHistory) history.pushState({}, '', url.pathname + url.search);
        const marker = content.querySelector('[data-collection-event]');
        if (update && marker) {
          const collection = JSON.parse(marker.getAttribute('view-event-payload')).collection;
          update.resolve({ productsCount: collection.productsCount });
        } else if (update && content.querySelector('[data-search-event]')) {
          update.resolve({ totalCount: Number(content.querySelector('[data-search-event]').dataset.totalCount) });
        }
        this.announcement = this.root.querySelector('[data-collection-count]').textContent.trim();
      } catch (error) {
        update?.reject(error);
        if (error.name !== 'AbortError') location.assign(url.href);
      } finally {
        if (requestId === this.requestId) this.loading = false;
      }
    }
  }));
  if (window.Alpine) register();
  else document.addEventListener('alpine:init', register, { once: true });
})();
