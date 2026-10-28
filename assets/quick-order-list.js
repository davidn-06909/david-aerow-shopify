if (!window.Eurus.loadedScript.has('quick-order-list.js')) {
  window.Eurus.loadedScript.add('quick-order-list.js');

  requestAnimationFrame(() => {
    document.addEventListener("alpine:init", () => {
      Alpine.store('xQuickOrderList', {
        currentPage: 1,
        sectionId: '',
        productUrl: '',
        allListLoading: false,
        loading: false,
        suppressCartSync: false,
        cachedResults: {},
        collapsedGroups: {},
        showAll: false,
        popupRendered: false,
        groupPages: {},
        loadingMore: {},
        loadFailures: {},
        drafts: {},
        errorLines: {},
        addAllLoading: false,
        get dirtyCount() {
          return Object.keys(this.drafts).length;
        },
        get errorLineCount() {
          return Object.keys(this.errorLines).length;
        },
        get draftTotalQuantity() {
          return Object.values(this.drafts).reduce((total, item) => total + item.qty, 0);
        },
        get draftTotalPrice() {
          return Object.values(this.drafts).reduce((total, item) => total + item.lineTotal, 0);
        },
        setErrorLine(variantId, hasError) {
          if (hasError) {
            this.errorLines[variantId] = true;
          } else {
            delete this.errorLines[variantId];
          }
        },
        groupTotal(productId) {
          return Object.values(this.drafts).reduce((total, item) => item.productId == productId ? total + item.lineTotal : total, 0);
        },
        setDraft(variantId, qty, lineTotal, productId) {
          if (qty > 0) {
            this.drafts[variantId] = { qty: qty, lineTotal: lineTotal, productId: productId };
          } else {
            delete this.drafts[variantId];
          }
        },
        clearDrafts() {
          this.drafts = {};
          this.errorLines = {};
        },
        removeAll() {
          if (this.dirtyCount === 0 && this.errorLineCount === 0) return;
          this.clearDrafts();
          document.dispatchEvent(new CustomEvent('eurus:quick-order-list:drafts-cleared'));
        },
        addAllToCart() {
          const items = Object.entries(this.drafts).map(([id, item]) => ({ id, quantity: item.qty }));
          if (items.length === 0 || this.addAllLoading) return;
          this.addAllLoading = true;
          this.allListLoading = true;
          return Alpine.store('xCartHelper').withCartLock((standardEvent) => fetch(`${Shopify.routes.root}cart/add.js`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
              items: items,
              sections: Alpine.store('xCartHelper').getSectionsToRender().map((s) => s.id),
              sections_url: window.location.pathname
            })
          })
            .then((response) => Alpine.store('xCartHelper').cartJson(response))
            .then((response) => {
              if (response.status == '422') {
                document.dispatchEvent(new CustomEvent('eurus:product:add-failed', {
                  detail: { errorMessage: response.description || response.message }
                }));
                return Alpine.store('xCartHelper').settleWithCart(standardEvent, Alpine.store('xCartHelper').userErrorsFrom(response));
              }
              this.showAll = false;
              Alpine.store('xPopup').close();
              if (response.sections) Alpine.store('xCartHelper').reRenderSections(response.sections);
              Alpine.store('xCartHelper').currentItemCount = parseInt(document.getElementById('cart-icon-bubble').innerHTML);
              if (Alpine.store('xCartNoti') && Alpine.store('xCartNoti').enable) {
                Alpine.store('xCartNoti').setItem(response);
              } else {
                Alpine.store('xMiniCart')?.openCart();
              }
              document.dispatchEvent(new CustomEvent('eurus:product:added', { detail: { product: response } }));
              const added = Object.keys(this.drafts);
              this.clearDrafts();
              added.forEach((id) => {
                this._qtyInputs(id).forEach((input) => {
                  input.setAttribute('value', 0);
                  input.value = 0;
                });
              });
              document.dispatchEvent(new CustomEvent('eurus:quick-order-list:drafts-cleared'));
              this.suppressCartSync = true;
              document.dispatchEvent(new CustomEvent('eurus:cart:items-changed'));
              this.reloadPage();
              return Alpine.store('xCartHelper').settleWithCart(standardEvent);
            })
            .catch((error) => {
              standardEvent.fail(error);
              document.dispatchEvent(new CustomEvent('eurus:product:add-failed', { detail: { errorMessage: error } }));
              console.error('Error:', error);
            })
            .finally(() => {
              this.addAllLoading = false;
              this.allListLoading = false;
            }), {
            type: 'shopify:cart:lines-update',
            action: 'add',
            context: this.showAll ? 'dialog' : 'product',
            lines: Alpine.store('xCartHelper').addLines(items)
          });
        },
        init() {
          document.addEventListener(`eurus:cart:items-changed`, () => {
            if (this.suppressCartSync) {
              this.suppressCartSync = false;
              return;
            }
            this.reloadPage();
          });
          document.addEventListener('eurus:popup:close', () => {
            this.showAll = false;
          });
        },
        initPagination(sectionId, productUrl) {
          this.sectionId = sectionId;
          this.productUrl = productUrl;
        },
        toggleGroup(id) {
          this.collapsedGroups[id] = !this.collapsedGroups[id];
        },
        collapseByDefault(id) {
          if (this.collapsedGroups[id] === undefined) {
            this.collapsedGroups[id] = true;
          }
        },
        openAll() {
          this.popupRendered = true;
          this.showAll = true;
          Alpine.store('xPopup').open = true;
        },
        closeAll() {
          this.showAll = false;
          Alpine.store('xModal').removeFocus();
          Alpine.store('xPopup').close();
        },
        _scopePrefix(scope) {
          return scope === 'popup' ? 'popup-' : '';
        },
        _findInFetched(html, id, scope) {
          if (scope === 'popup') {
            const template = html.querySelector('template[data-qol-popup]');
            if (template) return template.content.querySelector(`#${CSS.escape(id)}`);
          }
          return html.getElementById(id);
        },
        _qtyInputs(variantId) {
          return Array.from(document.querySelectorAll(`[data-qol-qty="${variantId}"]`));
        },
        _lineErrors(variantId) {
          return Array.from(document.querySelectorAll(`[data-qol-line-error="${variantId}"]`));
        },
        isCollapsed(id) {
          return !!this.collapsedGroups[id];
        },
        _sectionLink(pageParam, page) {
          return `${this.productUrl.split('?')[0]}?${pageParam}=${page}&section_id=${this.sectionId}`;
        },
        _fetchSection(link, options) {
          return fetch(link, options)
            .then((response) => response.text())
            .then((responseText) => new DOMParser().parseFromString(responseText, 'text/html'));
        },
        loadMoreVariants(productId, nextPage, pageParam, scope = 'page') {
          nextPage = Number(nextPage) || 2;
          const groupKey = `${scope}-${productId}`;
          if (this.loadingMore[groupKey]) return Promise.resolve();
          if (((this.groupPages[groupKey] || {}).page || 1) >= nextPage) return Promise.resolve();
          this.loadingMore[groupKey] = true;

          const prefix = this._scopePrefix(scope);
          const link = this._sectionLink(pageParam, nextPage);
          return this._fetchSection(link)
            .then((html) => {
              const srcBody = this._findInFetched(html, `${prefix}qol-variants-${productId}`, scope);
              const desBody = document.getElementById(`${prefix}qol-variants-${productId}`);
              if (!srcBody || !desBody) {
                this.loadFailures[groupKey] = (this.loadFailures[groupKey] || 0) + 1;
                if (this.loadFailures[groupKey] > 1 && desBody) {
                  desBody.querySelector('.qol-sentinel')?.remove();
                }
                return false;
              }
              this.loadFailures[groupKey] = 0;
              const incoming = Array.from(srcBody.children);
              const variantRows = incoming.filter((row) => !row.classList.contains('qol-sentinel'));
              const hasFurtherPages = incoming.some((row) => row.classList.contains('qol-sentinel'));
              const oldSentinel = desBody.querySelector('.qol-sentinel');
              incoming.forEach((row) => {
                if (oldSentinel) {
                  desBody.insertBefore(row, oldSentinel);
                } else {
                  desBody.appendChild(row);
                }
              });
              if (oldSentinel) oldSentinel.remove();
              this.groupPages[groupKey] = { page: nextPage, param: pageParam, productId: productId, scope: scope };
              return variantRows.length === 0 && hasFurtherPages;
            })
            .catch((err) => {
              if (err.name !== 'AbortError') {
                console.error(err);
              }
              return false;
            })
            .finally(() => {
              this.loadingMore[groupKey] = false;
            })
            .then((keepLoading) => {
              if (keepLoading) return this.loadMoreVariants(productId, nextPage + 1, pageParam, scope);
            });
        },
        refreshLine(variantId) {
          this.cachedResults = {};
          const rows = Array.from(document.querySelectorAll(`[data-qol-variant="${variantId}"]`));
          if (!rows.length) return Promise.resolve();
          const pending = {};
          return Promise.all(rows.map((row) => {
            const productId = row.dataset.qolProduct;
            const scope = row.dataset.qolScope || 'page';
            const prefix = this._scopePrefix(scope);
            const link = this._sectionLink(row.dataset.qolPageParam || 'page', row.dataset.qolPage || 1);
            pending[link] = pending[link] || this._fetchSection(link);
            return pending[link]
              .then((html) => {
                const newRow = this._findInFetched(html, `${prefix}quick-order-list-item-${variantId}`, scope);
                const currentRow = document.getElementById(`${prefix}quick-order-list-item-${variantId}`);
                if (newRow && currentRow) {
                  currentRow.replaceWith(newRow);
                }
                [`${prefix}qol-group-total-${productId}`, `${prefix}qol-group-total-mobile-${productId}`, 'QuickOrderListSummary'].forEach((id) => {
                  const src = this._findInFetched(html, id, id === 'QuickOrderListSummary' ? 'page' : scope);
                  const des = document.getElementById(id);
                  if (src && des) {
                    des.innerHTML = src.innerHTML;
                  }
                });
              })
              .catch((err) => {
                if (err.name !== 'AbortError') {
                  console.error(err);
                }
              });
          }));
        },
        renderPage(html) {
          const src = html.getElementById('x-quick-order-list-container');
          const des = document.getElementById('x-quick-order-list-container');
          if (src && des) {
            des.innerHTML = src.innerHTML;
          }
        },
        async reloadPage() {
          const restore = { ...this.groupPages };
          this.groupPages = {};
          this.cachedResults = {};
          this.loadFailures = {};
          await this.loadPage(this.currentPage, true, false);
          for (const info of Object.values(restore)) {
            for (let p = 2; p <= info.page; p++) {
              await this.loadMoreVariants(info.productId, p, info.param, info.scope);
            }
          }
        },
        _scrollToTop() {
          Alpine.store("xHeaderMenu")?.suppressScroll?.(2000);
          document.getElementById('x-quick-order-list-container').parentElement.scrollIntoView({ behavior: "smooth" });
        },
        loadPage(pageParam, reload = false, scroll = true) {
          this.loading = true;
          const link = this._sectionLink('page', Number(pageParam));
          Alpine.store('xHelper').cancelRequest('eurus:quick_order_list_request');
          if (this.cachedResults[link] && !reload) {
            this.currentPage = Number(pageParam);
            if (scroll) this._scrollToTop();
            this.loading = false;
            this.renderPage(this.cachedResults[link]);
            return Promise.resolve();
          }
          const controller = new AbortController();
          Alpine.store('xHelper').requestControllers.set('eurus:quick_order_list_request', controller);
          return this._fetchSection(link, { signal: controller.signal })
            .then((html) => {
              this.renderPage(html);
              this.cachedResults[link] = html;
            })
            .catch((err) => {
              if (err.name !== 'AbortError') {
                console.error(err);
              }
            })
            .finally(() => {
              this.currentPage = Number(pageParam);
              if (scroll) this._scrollToTop();
              this.loading = false;
            });
        },
      });

      Alpine.data('xQuickOrderListItem', (variant, config, stockError) => ({
        draft: 0,
        hasError: false,
        init() {
          const saved = Alpine.store('xQuickOrderList').drafts[variant.id];
          this.draft = saved ? saved.qty : 0;
          this._setInputs(this.draft);
          document.addEventListener('eurus:quick-order-list:drafts-cleared', () => {
            this.draft = 0;
            this._setInputs(0);
            this._clearErrorMessage(variant.id);
          });
          document.addEventListener('eurus:quick-order-list:draft-updated', (event) => {
            if (event.detail.variantId != variant.id) return;
            this.draft = event.detail.qty;
          });
        },
        _inputs() {
          return Alpine.store('xQuickOrderList')._qtyInputs(variant.id);
        },
        _setInputs(value) {
          this._inputs().forEach((input) => {
            if (input) input.value = value;
          });
        },
        _unitPrice(qty) {
          let price = config.price;
          const breaks = config.priceBreaks || [];
          for (let i = 0; i < breaks.length; i++) {
            if (qty >= breaks[i].min) price = breaks[i].price;
          }
          return price;
        },
        _lineTotal(qty) {
          return qty * this._unitPrice(qty);
        },
        _setDraft(qty) {
          this.draft = qty;
          this._setInputs(qty);
          Alpine.store('xQuickOrderList').setDraft(variant.id, qty, this._lineTotal(qty), config.productId);
          document.dispatchEvent(new CustomEvent('eurus:quick-order-list:draft-updated', { detail: { variantId: variant.id, qty: qty } }));
        },
        onChangeQuantity(e, inCart, el) {
          const qty = parseInt(el.value) || 0;
          this._setInputs(qty);
          if (qty === 0) {
            this._clearErrorMessage(variant.id);
            this._setDraft(0);
            return;
          }
          const error = this._validate(qty);
          if (error) {
            this.draft = qty;
            Alpine.store('xQuickOrderList').setDraft(variant.id, 0);
            this._addErrorMessage(variant.id, error);
            return;
          }
          this._clearErrorMessage(variant.id);
          this._setDraft(qty);
        },
        _validate(qty) {
          const { min, max, step } = this._rule();
          if (min > 1 && qty < min) return config.msgMin;
          if (step > 1 && (qty - min) % step !== 0) return config.msgMultiple;
          if (max != null && qty > max) return config.msgMax;
          if (this._exceedsStock(qty)) return stockError;
          return null;
        },
        removeItem() {
          this._clearErrorMessage(variant.id);
          this._setDraft(0);
        },
        minus() {
          const current = parseInt(this._inputs()[0]?.value) || 0;
          if (current <= 0) {
            this._clearErrorMessage(variant.id);
            this._setDraft(0);
            return;
          }
          const { min, step } = this._rule();
          let next = current - step;
          if (next < min) next = 0;
          this.draft = next;
          this._setInputs(next);
          const error = next > 0 ? this._validate(next) : null;
          if (error) {
            Alpine.store('xQuickOrderList').setDraft(variant.id, 0);
            this._addErrorMessage(variant.id, error);
            return;
          }
          this._clearErrorMessage(variant.id);
          this._setDraft(next);
        },
        plus() {
          const { min, step } = this._rule();
          const current = parseInt(this._inputs()[0]?.value) || 0;
          const next = current <= 0 ? min : current + step;
          this.draft = next;
          this._setInputs(next);
          const error = this._validate(next);
          if (error) {
            Alpine.store('xQuickOrderList').setDraft(variant.id, 0);
            this._addErrorMessage(variant.id, error);
            return;
          }
          this._clearErrorMessage(variant.id);
          this._setDraft(next);
        },
        handleKeydown(evt, el) {
          if (evt.key !== 'Enter') return;
          evt.preventDefault();
          el.blur();
          el.focus();
        },
        invalid(el) {
          const number = parseFloat(el.value);
          if (!Number.isInteger(number) || number < 0) {
            el.value = 0;
          }
        },
        _exceedsStock(qty) {
          if (!config.checkStock) return false;
          return parseInt(qty) > config.stockLimit;
        },
        _rule() {
          return {
            min: config.min > 1 ? config.min : 1,
            max: config.max != null ? config.max : null,
            step: config.step > 1 ? config.step : 1
          };
        },
        _clearErrorMessage(id) {
          this.hasError = false;
          Alpine.store('xQuickOrderList').setErrorLine(id, false);
          Alpine.store('xQuickOrderList')._lineErrors(id).forEach((el) => el.classList.add('hidden'));
        },
        _addErrorMessage(id, message) {
          const errorElements = Alpine.store('xQuickOrderList')._lineErrors(id);
          if (!errorElements.length) return;
          this.hasError = true;
          Alpine.store('xQuickOrderList').setErrorLine(id, true);
          errorElements.forEach((el) => {
            el.classList.remove('hidden');
            el.getElementsByClassName('cart-item__error-text')[0].innerHTML = message;
          });
        },
      }));
    });
  });
}
