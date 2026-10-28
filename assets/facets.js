document.addEventListener('alpine:init', () => {
  Alpine.data('xFiltersAndSortby', (sectionId, defaultListView) => ({
    t: '',
    show: false,
    showFilterAside: true,
    loading: false,
    isDesktop: false,
    listLayout: defaultListView || false,
    cachedResults: [],
    searchParamsPrev: window.location.search.slice(1),
    searchParamsInitial: window.location.search.slice(1),
    init() {
      if (localStorage.getItem("list-layout") == 'list') {
        this.listLayout = true;
      }
      this._initLayout();
      this._setListeners();
    },
    _initLayout() {
      let formAside = document.getElementsByClassName('form-aside')[0];
      let formDrawer = document.getElementsByClassName('form-drawer')[0];
      if (window.innerWidth > 767) {
        this.isDesktop = true;
        if (formAside) {
          formAside.setAttribute('id','FacetFiltersForm');
          if (formDrawer) formDrawer.removeAttribute('id');
        } else {
          if (formDrawer) formDrawer.setAttribute('id','FacetFiltersForm');
        }
      } else {
        this.isDesktop = false;
        if (formAside) formAside.removeAttribute('id');
        if (formDrawer) formDrawer.setAttribute('id','FacetFiltersForm');
      }
    },
    _setListeners() {
      const onHistoryChange = (event) => {
        const searchParams = event.state ? event.state.searchParams : this.searchParamsInitial;
        if (searchParams === this.searchParamsPrev) return;
        this._renderPage(searchParams, false);
      }
      window.addEventListener('popstate', onHistoryChange);

      installMediaQueryWatcher('(min-width: 768px)', this._initLayout);
    },
    toggleLayout(theBoolean) {
      this.listLayout = theBoolean;
      localStorage.setItem("list-layout", theBoolean ? "list" : "grid" );
      window.dispatchEvent(new Event('resize'));
    },
    removeFilter(url) {
      this._reloadFilter(url);
    },
    renderPagination() {
      var formData = {
        'attributes': {
          'collection-pagination': this.$el.value             
        }
      }; 
      const helper = Alpine.store('xCartHelper');
      return helper.withCartLock((standardEvent) => fetch(Shopify.routes.root+'cart/update', {
        method:'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(formData)
      }).then((response) => {
        return helper.cartJson(response);
      }).then((cart) => {
        standardEvent.settle(cart, helper.userErrorsFrom(cart));
        this.cachedResults = [];
        const searchParams = this._createSearchParams(document.getElementById('FacetFiltersForm'));
        this._renderPage(searchParams, true, false);
      }), helper.describeCartUpdate(formData));
    },
    onSubmit(wait = 500) {
      clearTimeout(this.t);

      const func = () => {
        const searchParams = this._createSearchParams(document.getElementById('FacetFiltersForm'));
        this._renderPage(searchParams);
        if(this.isDesktop) document.getElementById('FormSelectFilter')?.blur();
      }
      
      this.t = setTimeout(() => {
        func();
      }, wait);
    },
    rangePrice(el) {
      const rangeInput = el.querySelectorAll(".range-input input"),
      priceInput = el.querySelectorAll(".price-input"),
      pricePreview = el.querySelectorAll(".price-preview"),
      range = el.querySelector(".slider .progress");
      let priceGap = 1;

      rangeInput.forEach((input) => {
        input.addEventListener("input", (e) => {
          e.preventDefault();
          let minVal = Number(rangeInput[0].value).toFixed(2),
            maxVal = Number(rangeInput[1].value).toFixed(2);;
          
          if (maxVal - minVal < priceGap) {
            if (e.target.className === "range-min") {
              rangeInput[0].value = maxVal - priceGap;
              priceInput[0].value = maxVal - priceGap;
            } else {
              rangeInput[1].value = minVal + priceGap;
              priceInput[1].value = maxVal + priceGap;
            }
          } else {
            priceInput[0].value = minVal;
            priceInput[1].value = maxVal;
            range.style.setProperty('--left_range', (minVal / rangeInput[0].max) * 100 + '%');
            range.style.setProperty('--right_range', 100 - (maxVal / rangeInput[1].max) * 100 + '%');
          }
          pricePreview[0].textContent = minVal;
          pricePreview[1].textContent = maxVal;
        });
      });
    },
    initRange(el) {
      const rangeInput = el.querySelectorAll(".range-input input"),
      range = el.querySelector(".slider .progress");
      
      let minVal = Number(rangeInput[0].value).toFixed(2),
      maxVal = Number(rangeInput[1].value).toFixed(2);;
      range.style.setProperty('--left_range', (minVal / rangeInput[0].max) * 100 + '%');
      range.style.setProperty('--right_range',100 - (maxVal / rangeInput[1].max) * 100 + '%');
    },
    _reloadFilter(url) {
      const searchParams = url.indexOf('?') == -1 ? '' : url.slice(url.indexOf('?') + 1);
      this._renderPage(searchParams);
    },
    _createSearchParams(form) {
      const formData = new FormData(form);
      return new URLSearchParams(formData).toString();
    },
    _updateURLHash(searchParams) {
      history.pushState({ searchParams }, '', `${window.location.pathname}${searchParams && '?'.concat(searchParams)}`);
    },
    /**
     * Wraps a deferred so a list update settles once, from the response the storefront rendered.
     * @param {{promise: Promise, resolve: Function, reject: Function}} deferred The event's promise handle.
     * @param {Function} readResult (parsedDocument) => resolved value, or null when unusable.
     * @param {string} message Rejection message for an unusable response.
     * @returns {{settle: Function, fail: Function}} `settle(html)` resolves, `fail(error)` rejects.
     */
    _updateHandle(deferred, readResult, message) {
      let done = false;
      return {
        settle(html) {
          if (done) return;
          done = true;
          const result = readResult(new DOMParser().parseFromString(html, 'text/html'));
          if (!result) {
            deferred.reject(new Error(message));
            return;
          }
          deferred.resolve(result);
        },
        fail(error) {
          if (done) return;
          done = true;
          deferred.reject(error);
        }
      };
    },
    /**
     * Dispatches shopify:collection:update for a filter or sort change and returns the handle
     * that settles it. The library maps the filter and sort params itself.
     * @param {string} searchParams The query the storefront is about to request.
     * @returns {{settle: Function, fail: Function}|null} null when nothing was dispatched --
     *   no events library, or no collection marker, which is what the search page looks like.
     */
    _beginCollectionUpdate(searchParams) {
      const library = window.StandardEvents;
      if (!library || !library.CollectionUpdateEvent) return null;

      /* Read twice: the live marker for identity, the response's for the matched count. */
      const collectionOf = (element) => {
        try {
          return element ? JSON.parse(element.getAttribute('view-event-payload')).collection : null;
        } catch (error) {
          return null;
        }
      };

      const marker = document.getElementById('CollectionViewEvent');
      const current = collectionOf(marker);
      if (!current) return null;

      const Ctor = library.CollectionUpdateEvent;
      const params = new URLSearchParams(searchParams);
      let deferred;
      try {
        deferred = Ctor.createPromise();
        const event = new Ctor({
          collection: {
            id: current.id,
            handle: current.handle,
            productsCount: Number(marker.dataset.allProductsCount)
          },
          promise: deferred.promise
        });
        const productFilters = Ctor.parseProductFilters(params);
        if (productFilters) event.productFilters = productFilters;
        const sortKey = Ctor.getSortKey(params);
        if (sortKey) event.sortKey = sortKey;
        event.promise.catch(() => {});
        (document.getElementById('FacetFiltersForm') || document).dispatchEvent(event);
      } catch (error) {
        return null;
      }

      return this._updateHandle(deferred, (root) => {
        const rendered = collectionOf(root.getElementById('CollectionViewEvent'));
        return rendered && typeof rendered.productsCount === 'number'
          ? { productsCount: rendered.productsCount }
          : null;
      }, 'The collection response carried no product count.');
    },
    /**
     * Dispatches shopify:search:update for a filter or sort change on the search page and returns
     * the handle that settles it. The search itself is dispatched on page load by
     * snippets/standard-events-search-update.liquid.
     * @param {string} searchParams The query the storefront is about to request.
     * @returns {{settle: Function, fail: Function}|null} null when nothing was dispatched --
     *   no events library, no search term, or no count marker, which is what a collection looks like.
     */
    _beginSearchUpdate(searchParams) {
      const library = window.StandardEvents;
      if (!library || !library.SearchUpdateEvent) return null;

      const totalCountIn = (root) => {
        const raw = root.getElementById('ProductCount')?.dataset.totalCount;
        return raw && Number.isFinite(Number(raw)) ? Number(raw) : null;
      };

      const params = new URLSearchParams(searchParams);
      const query = params.get('q');
      if (!query || totalCountIn(document) === null) return null;

      const Ctor = library.SearchUpdateEvent;
      let deferred;
      try {
        deferred = Ctor.createPromise();
        const search = { query };
        const productFilters = Ctor.parseProductFilters(params);
        if (productFilters) search.productFilters = productFilters;
        const sortKey = Ctor.getSortKey(params);
        if (sortKey) search.sortKey = sortKey;
        const event = new Ctor({ search, promise: deferred.promise });
        event.promise.catch(() => {});
        (document.getElementById('FacetFiltersForm') || document).dispatchEvent(event);
      } catch (error) {
        return null;
      }

      return this._updateHandle(deferred, (root) => {
        const totalCount = totalCountIn(root);
        return totalCount === null ? null : { totalCount };
      }, 'The search response carried no result count.');
    },
    _renderPage(searchParams, updateURLHash = true, report = true) {
      this.searchParamsPrev = searchParams;
      this.loading = true;
      const update = report
        ? this._beginCollectionUpdate(searchParams) || this._beginSearchUpdate(searchParams)
        : null;
      
      if (this.cachedResults[searchParams]) {
        this._renderResults(this.cachedResults[searchParams]);
        if (update) update.settle(this.cachedResults[searchParams]);
        return;
      }

      const url = `${window.location.pathname}?section_id=${sectionId}&${searchParams}`;
      fetch(url)
        .then(response => response.text())
        .then((responseText) => {
          const html = responseText;
          this.cachedResults[searchParams] = html;
          this._renderResults(html);
          document.dispatchEvent(new CustomEvent("eurus:collection:reloaded"));
          if (update) update.settle(html);
        })
        .catch((error) => {
          if (update) update.fail(error);
          this.loading = false;
        });

      if (updateURLHash) this._updateURLHash(searchParams);
    },
    _renderResults(html) {
      this._renderFilters(html);
      this._renderProductGridContainer(html);
      this._renderProductCount(html);
      this.loading = false;
    },
    _renderFilters(html) {
      const parsedHTML = new DOMParser().parseFromString(html, 'text/html');
      let blockFiltesDrawer = '.form-drawer';
      let blockFiltesAside = '.form-aside';
      const selectBlockFiltesDrawer = document.querySelector(blockFiltesDrawer);
      const selectBlockFiltesAside = document.querySelector(blockFiltesAside);
      let activeTag = document.getElementById("active-filter-tag")

      if (activeTag) {
        activeTag.innerHTML = parsedHTML.getElementById("active-filter-tag").innerHTML;   
      }
      if (selectBlockFiltesDrawer) {
        if (this.$el.id) {  
          const eleOpening = parsedHTML.getElementById(this.$el.id) ? parsedHTML.getElementById(this.$el.id).closest('.js-filter') : undefined;
          if (eleOpening) {
            eleOpening.setAttribute('x-data', '{open: true}');
            parsedHTML.getElementById(this.$el.id).closest('.js-filter').innerHTML = eleOpening.innerHTML;
          }
        }
        selectBlockFiltesDrawer.innerHTML = parsedHTML.querySelector(blockFiltesDrawer).innerHTML;
        this._renderAdditionalElements(parsedHTML);
      };
      if (selectBlockFiltesAside) {
        if (this.$el.id) {
          const eleOpening = parsedHTML.getElementById(this.$el.id) ? parsedHTML.getElementById(this.$el.id).closest('.js-filter') : undefined;
          if (eleOpening) {
            eleOpening.setAttribute('x-data', '{open: true}');
            parsedHTML.getElementById(this.$el.id).closest('.js-filter').innerHTML = eleOpening.innerHTML;
          }
        }
        selectBlockFiltesAside.innerHTML = parsedHTML.querySelector(blockFiltesAside).innerHTML;
        this._renderAdditionalElements(parsedHTML);
      };
      this._renderAdvancedFilters(parsedHTML);
    },
    _renderAdvancedFilters(html) {
      const destination = document.querySelectorAll(".filter-advanced");
      const source = html.querySelectorAll('.filter-advanced');

      if (source.length > 0 && destination.length > 0) {
        destination.forEach((destination, index) => {
          destination.innerHTML = source[index].innerHTML;
        })
      }
    },
    _renderProductGridContainer(html) {
      document.getElementById('ProductGridContainer').innerHTML = new DOMParser().parseFromString(html, 'text/html').getElementById('ProductGridContainer').innerHTML;
    },
    _renderProductCount(html) {
      const productCountEl = new DOMParser().parseFromString(html, 'text/html').getElementById('ProductCount');
      if (productCountEl) {
        const count = productCountEl.innerHTML;
        const container = document.getElementById('ProductCount_header');
        const containerDrawer = document.getElementById('ProductCountDrawer');
        if (container) {
          container.innerHTML = count;
          container.classList.remove('loading');
        }
        if (containerDrawer) containerDrawer.innerHTML = count;
      }
    },
    _renderAdditionalElements(html) {
      const container = document.getElementById('ProductPerPage');
      if (container) container.innerHTML = html.getElementById('ProductPerPage').innerHTML;
    },
    _filterFocus() {
      Alpine.store('xFocusElement').trapFocus('ProductFilter','CloseFilter');
    },
    _filterRemoveFocus() {
      const activeElement = document.getElementById('btn-filter');
      Alpine.store('xFocusElement').removeTrapFocus(activeElement);
    },
    setFilterHeaderHeight() {
      document.documentElement.style.setProperty('--height-sticky-filter',document.getElementById("FacetsWrapperDesktop").offsetHeight + "px");
    },
    setPositionOptionFilter(el) {
      elRect = el.getBoundingClientRect();
      const elPopup = el.getElementsByClassName('popup-above')[0];
      let spacingRight = window.xViewport.innerWidth - elRect.left;
      let checkSpacing = spacingRight - el.innerWidth;
      if (checkSpacing >= 0) {
        elPopup.style.left = '0px';
      } else {
        elPopup.style.left = checkSpacing+ 'px';
      }
    },
    getPopupPosition(el) {
      this.$nextTick(() => {
        const elPopup = el.getElementsByClassName('popup-above')[0];
        if (elPopup) {
          const popupRect = elPopup.getBoundingClientRect();
          if( popupRect.right > window.xViewport.innerWidth){
            elPopup.style.right = 0;
          }
        }
      });
    }
  }));
});