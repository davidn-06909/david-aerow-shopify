const installMediaQueryWatcher = (mediaQuery, changedCallback) => {
  const mq = window.matchMedia(mediaQuery);
  mq.addEventListener('change', e => changedCallback(e.matches));
  changedCallback(mq.matches);
};

window.xViewport = {
  innerWidth: 0,
  innerHeight: 0
}

const viewportObserver = new ResizeObserver(() => {
  window.xViewport.innerWidth = window.innerWidth;
  window.xViewport.innerHeight = window.innerHeight;
});

viewportObserver.observe(document.documentElement);

const deferScriptLoad = (name, src, onload, requestVisualChange = false) => {
  window.Eurus.loadedScript.add(name);
  
  (events => {
    const loadScript = () => {
      events.forEach(type => window.removeEventListener(type, loadScript));
      clearTimeout(autoloadScript);

      const initScript = () => {
        const script = document.createElement('script');
        script.setAttribute('src', src);
        script.setAttribute('defer', '');
        script.onload = () => {
          document.dispatchEvent(new CustomEvent(name + ' loaded'));
          onload();
        };

        document.head.appendChild(script);
      }

      if (requestVisualChange) {
        if (window.requestIdleCallback) {
          requestIdleCallback(initScript);
        } else {
          requestAnimationFrame(initScript);
        }
      } else {
        initScript();
      }
    };

    let autoloadScript;
    if (Shopify.designMode) {
      loadScript();
    } else {
      const wait = window.matchMedia('(min-width: 768px)').matches ? 1000 : 3000;
      events.forEach(type => window.addEventListener(type, loadScript, {once: true, passive: true}));
      autoloadScript = setTimeout(() => {
        loadScript();
      }, wait);
    }
  })(['mouseover', 'wheel', 'scroll', 'keydown']);
}

/* Product cards report shopify:product:view through manual <s-view-event> markers.
   Marker modes: data-view-on-intersect (card observed here), data-view-on-render
   (dispatched on insertion), data-view-on-reveal (EurusReportCardViews only). */
const dispatchedCardViews = new Set();

const cardViewObserver = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const element = entry.target.querySelector('s-view-event[data-view-on-intersect]');
        if (element) dispatchCardView(element);
        cardViewObserver.unobserve(entry.target);
      });
    }, { threshold: 0.5 })
  : null;

/**
 * Fires one card's product:view, once, and owns the reported flag.
 * @param {Element} element An s-view-event marker. data-view-key, when set, is shared by
 *   mutually exclusive card roots so the pair reports once between them.
 * @returns {boolean} True when this call dispatched.
 */
const dispatchCardView = (element) => {
  if (typeof element.dispatchViewEvent !== 'function') return false;
  if (element.dataset.viewReported) return false;
  const key = element.dataset.viewKey;
  if (key) {
    if (dispatchedCardViews.has(key)) return false;
    dispatchedCardViews.add(key);
  }
  element.dataset.viewReported = 'true';
  element.dispatchViewEvent();
  return true;
};

/**
 * Wires the markers in a subtree: render markers dispatch now, intersect markers put
 * their card under the observer. Splide clones and already-wired markers are skipped.
 * Called on ready and for every inserted node.
 * @param {Element|Document} [root] Subtree to scan; defaults to document.
 */
const observeCardViews = (root) => {
  const scope = root && root.querySelectorAll ? root : document;

  scope.querySelectorAll('s-view-event[data-view-on-render]').forEach((element) => {
    if (element.dataset.viewObserved) return;
    if (element.closest('.splide__slide--clone')) return;
    element.dataset.viewObserved = 'true';
    dispatchCardView(element);
  });

  if (!cardViewObserver) return;
  scope.querySelectorAll('s-view-event[data-view-on-intersect]').forEach((element) => {
    if (element.dataset.viewObserved) return;
    if (element.closest('.splide__slide--clone')) return;
    const card = element.parentElement;
    if (!card) return;
    element.dataset.viewObserved = 'true';
    cardViewObserver.observe(card);
  });
};

/**
 * Reports a carousel's parked markers, re-parking the ones still off-track.
 * @param {Element} carousel A .splide root.
 */
const flushCardViews = (carousel) => {
  carousel.querySelectorAll('s-view-event[data-view-pending]').forEach((pending) => {
    if (pending.closest('.splide__slide--clone')) { delete pending.dataset.viewPending; return; }
    if (deferCardView(pending)) return;
    delete pending.dataset.viewPending;
    dispatchCardView(pending);
  });
};

/**
 * Waits for a carousel that has not mounted yet. Splide adds is-initialized at the end of
 * mount(), after xSplide.load has assigned el.splide, so the class is the ready signal.
 * @param {Element} carousel A .splide root without is-initialized.
 */
const watchCardViewsInit = (carousel) => {
  if (carousel.dataset.cardViewsAwaitingInit) return;
  carousel.dataset.cardViewsAwaitingInit = 'true';

  let observer;
  let timer;
  const stop = () => {
    if (observer) observer.disconnect();
    clearTimeout(timer);
    delete carousel.dataset.cardViewsAwaitingInit;
  };

  observer = new MutationObserver(() => {
    if (!carousel.classList.contains('is-initialized')) return;
    stop();
    flushCardViews(carousel);
  });
  observer.observe(carousel, { attributes: true, attributeFilter: ['class'] });

  /* A carousel that never mounts reports its cards rather than swallowing them. */
  timer = setTimeout(() => {
    stop();
    carousel.querySelectorAll('s-view-event[data-view-pending]').forEach((pending) => {
      delete pending.dataset.viewPending;
      dispatchCardView(pending);
    });
  }, 2000);
};

/**
 * Defers a card parked outside its carousel's track, or waiting on that carousel to mount.
 * @param {Element} element The card's s-view-event marker.
 * @returns {boolean} True when the view was deferred and must not be dispatched now.
 */
const deferCardView = (element) => {
  const slide = element.closest('.splide__slide');
  if (!slide || slide.classList.contains('is-visible')) return false;

  const carousel = slide.closest('.splide');
  if (!carousel) return false;

  element.dataset.viewPending = 'true';
  if (!carousel.splide || !carousel.classList.contains('is-initialized')) {
    watchCardViewsInit(carousel);
  } else if (!carousel.dataset.cardViewsWatched) {
    carousel.dataset.cardViewsWatched = 'true';
    carousel.splide.on('visible moved scrolled', () => flushCardViews(carousel));
  }
  return true;
};

/**
 * Reports every marker in a subtree, whatever its mode. Call with the panel element when
 * opening a panel that reveals cards already in the page.
 * @param {Element|Document} root Subtree to report; defaults to document.
 */
window.EurusReportCardViews = (root) => {
  const scope = root && root.querySelectorAll ? root : document;
  scope.querySelectorAll('s-view-event[data-view-on-intersect], s-view-event[data-view-on-render], s-view-event[data-view-on-reveal]')
    .forEach((element) => {
      if (element.closest('.splide__slide--clone')) return;
      if (deferCardView(element)) return;
      dispatchCardView(element);
    });
};

/* Picks up cards inserted after load: facet re-render, load more, quick view, cart drawer. */
{
  const startObservingCards = () => {
    observeCardViews(document);
    new MutationObserver((records) => {
      records.forEach((record) => {
        record.addedNodes.forEach((node) => {
          if (node.nodeType === 1) observeCardViews(node);
        });
      });
    }).observe(document.documentElement, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObservingCards, { once: true });
  } else {
    startObservingCards();
  }
}

const getSectionInnerHTML = (html, selector = '.shopify-section') => {
  return new DOMParser()
    .parseFromString(html, 'text/html')
    .querySelector(selector).innerHTML;
}

const xParseJSON = (jsonString) => {
  try {
    return JSON.parse(jsonString);
  } catch {
    // Older data attributes contain unescaped backslashes, including regular expressions.
    const legacyJSON = String(jsonString).replaceAll("\\", "\\\\").replaceAll('\\"', '\"');
    return JSON.parse(legacyJSON);
  }
}

window.addEventListener("pageshow", () => {
  document.addEventListener('alpine:init', () => {
    if (Alpine.store('xMiniCart')) {
      if (Alpine.store('xMiniCart').needReload) {
        Alpine.store('xMiniCart').reLoad();
      }
      const isCartPage = document.getElementById("main-cart-items");
      if (isCartPage && Alpine.store('xMiniCart').needReload) {
        location.reload();
      }
      Alpine.store('xMiniCart').needReload = true;
    }
  })
});

requestAnimationFrame(() => {
  document.addEventListener('alpine:init', () => {
    Alpine.store('xVariantPickerSizeChart', {
      openSizeChart: false ,
      sizeChartFocus() {
        Alpine.store('xFocusElement').trapFocus('VariantPickerSizeChart','CloseVariantPickerSizeChart');
      },
      sizeChartRemoveFocus() {
        const activeElement = document.getElementById('OpenVariantPickerSizeChart');
        Alpine.store('xFocusElement').removeTrapFocus(activeElement);
        this.openSizeChart = false; 
        Alpine.store('xPopup').close();
      }
    })
    Alpine.store('xHelper', {
      toUpdate: [],
      requestControllers: new Map(),
      eventControllers: new Map(),
      fbtProductListDraft: [],
      cancelRequest(key) {
        const controller = this.requestControllers.get(key);
        if (controller) {
          controller.abort();
          this.requestControllers.delete(key);
        }
      },
      cancelEvent(key) {
        const controller = this.eventControllers.get(key);
        if (controller) {
          controller.abort();
          this.eventControllers.delete(key);
        }
      },
      formatMoney(amount, formatString) {
        var placeholderRegex = /\{\{\s*(\w+)\s*\}\}/;
        let value = this.formatWithDelimiters(amount, 2);
        switch(formatString.match(placeholderRegex)[1]) {
          case 'amount':
            value = this.formatWithDelimiters(amount, 2);
            break;
          case 'amount_no_decimals':
            value = this.formatWithDelimiters(amount, 0);
            break;
          case 'amount_with_comma_separator':
            value = this.formatWithDelimiters(amount, 2, '.', ',');
            break;
          case 'amount_no_decimals_with_comma_separator':
            value = this.formatWithDelimiters(amount, 0, '.', ',');
            break;
          case 'amount_with_apostrophe_separator ':
            value = this.formatWithDelimiters(amount, 2, "'", '.');
            break;
          case 'amount_no_decimals_with_space_separator':
            value = this.formatWithDelimiters(amount, 0, ' ', ',')
            break;
          case 'amount_with_space_separator':
            value = this.formatWithDelimiters(amount, 2, ' ', ',')
            break;
          case 'amount_with_period_and_space_separator':
            value = this.formatWithDelimiters(amount, 2, ' ', '.')
            break;
        } 
        return formatString.replace(placeholderRegex, value);
      },
      defaultOption(opt, def) {
        return (typeof opt == 'undefined' ? def : opt);
      },
      formatWithDelimiters(number, precision, thousands, decimal) {
        precision = this.defaultOption(precision, 2);
        thousands = this.defaultOption(thousands, ',');
        decimal   = this.defaultOption(decimal, '.');
    
        if (isNaN(number) || number == null) { return 0; }
        number = (number/100.0).toFixed(precision);
    
        var parts   = number.split('.'),
            dollars = parts[0].replace(/(\d)(?=(\d\d\d)+(?!\d))/g, '$1' + thousands),
            cents   = parts[1] ? (decimal + parts[1]) : '';
    
        return dollars + cents;
      },
      countdown(configs, callback) {
        const maxAttempt = 100;

        let endDate = new Date(
          configs.end_year,
          configs.end_month - 1,
          configs.end_day,
          configs.end_hour,
          configs.end_minute
        );
        let reset = configs.reset;
        let duration = configs.duration;
        let endTime = endDate.getTime() + (-1 * configs.timezone * 60 - endDate.getTimezoneOffset()) * 60 * 1000;
        
        let startTime;
        if (configs.start_year) {
          let startDate = new Date(
            configs.start_year,
            configs.start_month - 1,
            configs.start_day,
            configs.start_hour,
            configs.start_minute
          );
          startTime = startDate.getTime() + (-1 * configs.timezone * 60 - startDate.getTimezoneOffset()) * 60 * 1000;
          if (reset) {
            endDate = new Date(startTime + duration);
            endTime = endDate.getTime();
          }
        } else {
          if (reset) {
            startTime = endTime;
            endDate = new Date(startTime + duration);
            endTime = endDate.getTime();
          } else {
            startTime = new Date().getTime();
          }
        }

        if (new Date().getTime() < startTime) {
          callback(false, 0, 0, 0, 0);
          return;
        }

        const startInterval = () => {
          let x = setInterval(() => {
            let now = new Date().getTime();
            let distance = 0;

            distance = endTime - now;
            if (distance < 0) {
              clearInterval(x);
              if (reset) {
                let attempt = 0;
                while (distance < 0 && attempt < maxAttempt) {
                  attempt++;
                  if (attempt == 1) {
                    let elapsed = now - startTime;
                    let loopOffset = Math.floor(elapsed / duration) - 1;

                    startTime = startTime + loopOffset * duration;
                  } else {
                    startTime = endTime;
                  }
                  endDate = new Date(startTime + duration);
                  endTime = endDate.getTime();
                  distance = endTime - now;
                }
                if (attempt >= maxAttempt) {
                  callback(false, 0, 0, 0, 0);
                  return;
                }
                startInterval();
              } else {
                callback(false, 0, 0, 0, 0);
                return;
              }
            }
            if (distance > 0) {
              var days = Math.floor(distance / (1000 * 60 * 60 * 24));
              var hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
              var minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
              var seconds = Math.floor((distance % (1000 * 60)) / 1000);

              minutes = minutes < 10 ? '0' + minutes : '' + minutes;
              seconds = seconds < 10 ? '0' + seconds : '' + seconds;

              callback(true, seconds, minutes, hours, days);
            }
          }, 1000);
        }

        startInterval();
      },
      canShow(configs) {
        let endDate = new Date(
          configs.end_year,
          configs.end_month - 1,
          configs.end_day,
          configs.end_hour,
          configs.end_minute
        );
        const endTime = endDate.getTime() + (-1 * configs.timezone * 60 - endDate.getTimezoneOffset()) * 60 * 1000;
        
        let startTime;
        if (configs.start_year) {
          let startDate = new Date(
            configs.start_year,
            configs.start_month - 1,
            configs.start_day,
            configs.start_hour,
            configs.start_minute
          );
          startTime = startDate.getTime() + (-1 * configs.timezone * 60 - startDate.getTimezoneOffset()) * 60 * 1000;
        } else {
          startTime = new Date().getTime();
        }
        let now = new Date().getTime();
        let distance = endTime - now;
        if (distance < 0 || startTime > now) {
          return false;
        } 
        return true;
      },
      handleTime(configs) {
        let endDate = new Date(
          configs.end_year,
          configs.end_month - 1,
          configs.end_day,
          configs.end_hour,
          configs.end_minute
        );
        const endTime = endDate.getTime() + (-1 * configs.timezone * 60 - endDate.getTimezoneOffset()) * 60 * 1000;
        
        let startTime;
        if (configs.start_year) {
          let startDate = new Date(
            configs.start_year,
            configs.start_month - 1,
            configs.start_day,
            configs.start_hour,
            configs.start_minute
          );
          startTime = startDate.getTime() + (-1 * configs.timezone * 60 - startDate.getTimezoneOffset()) * 60 * 1000;
        } else {
          startTime = new Date().getTime();
        }
        let now = new Date().getTime();
        let distance = endTime - now;
        return { "startTime": startTime, "endTime": endTime, "now": now, "distance": distance};
      },
      centerElement(el) {
        let resizeTimeout;
        let currTranslate = 0;
    
        const update = () => {
          window.requestAnimationFrame(() => {
            const rect = el.getBoundingClientRect();
            const translate = rect.left + Math.abs(currTranslate) - (document.documentElement.clientWidth - rect.width) / 2;
            el.style.transform = `translateX(-${translate}px)`;
            currTranslate = translate;
          })
        };
    
        window.addEventListener('resize', () => {
          clearTimeout(resizeTimeout);
          resizeTimeout = setTimeout(update, 150);
        });

        update();
      }
    });
    Alpine.store('xInit', {
      runDispatch: true,
      init() {
        const fire = () => {
          if (!this.runDispatch) return;
          this.runDispatch = false;
          window.dispatchEvent(new CustomEvent('init-run'));
        };
        const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1000));
        idle(fire, { timeout: 1500 });
        ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(evt => {
          window.addEventListener(evt, fire, { once: true, passive: true });
        });
      }
    });
  });
});

requestAnimationFrame(() => {
  document.addEventListener('alpine:init', () => {
    Alpine.data('xCart', () => ({
      t: '',
      loading: false,
      customFieldInitOpened: false,
      updateItemQty(itemId, line, inventory_policy, track_inventory, maxQty, willRemoveInsurance) {
        let qty = parseInt(document.getElementById(`cart-qty-${itemId}`).value);
        if (this.validateQty(qty)) {
          if (track_inventory || inventory_policy !== "continue") {
            this._postUpdateItem(itemId, line, qty, maxQty);
          } else {
            this._postUpdateItem(itemId, line, qty, qty);
          }
        }
        if (willRemoveInsurance && qty <= 0) {
          this.clearCart(itemId);
          return;
        }
      },
      minusItemQty(itemId, line, inventory_policy, track_inventory, maxQty, willRemoveInsurance) {
        let qty = parseInt(document.getElementById(`cart-qty-${itemId}`).value);
        if (this.validateQty(qty)) {
          if (qty > 0) {
            qty -= 1;
            document.getElementById(`cart-qty-${itemId}`).value = qty;
          }

          if (track_inventory || inventory_policy !== "continue") {
            this._postUpdateItem(itemId, line, qty, maxQty);
          } else {
            this._postUpdateItem(itemId, line, qty, qty);
          }
        }
        if (willRemoveInsurance && qty <= 0) {
          this.clearCart(itemId);
          return;
        }
      },
      plusItemQty(itemId, line, inventory_policy, track_inventory, maxQty) {
        let qty = parseInt(document.getElementById(`cart-qty-${itemId}`).value);
        if (this.validateQty(qty)) {
          if (qty >= 0) {
            qty += 1;
            document.getElementById(`cart-qty-${itemId}`).value = qty;
          }

          if (track_inventory || inventory_policy !== "continue") {
            this._postUpdateItem(itemId, line, qty, maxQty);
          } else {
            this._postUpdateItem(itemId, line, qty, qty);
          }
        }
      },
      removeItem(itemId, line, isShippingInsurance) {
        this._postUpdateItem(itemId, line, 0, 0, 500, isShippingInsurance);
      },
      handleKeydown(evt, el) {
        if (evt.key !== 'Enter') return;
        evt.preventDefault();
        el.blur();
        el.focus();
      },
      _postUpdateItem(itemId, line, qty, maxQty, wait = 500, isShippingInsurance) {
        if (isShippingInsurance) {
          Alpine.store('xPopupInsurance').loading = true;
        };
        clearTimeout(this.t);

        const func = async () => {
          this.loading = true;

          return Alpine.store('xCartHelper').withCartLock((standardEvent) => {
            let removeEl = document.getElementById(`remove-${itemId}`);
            if(removeEl){
              removeEl.style.display = 'none';
            }
            document.getElementById(`loading-${itemId}`)?.classList?.remove('hidden');
            let updateData = {
              'line': `${line}`,
              'quantity': `${qty}`,
              'sections': Alpine.store('xCartHelper').getSectionsToRender().map(s => s.id),
              'sections_url': window.location.pathname
            };

            let productIds = [];

            return fetch(`${Shopify.routes.root}cart/change.js`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(updateData)
            })
            .then(response => {
              return Alpine.store('xCartHelper').cartJson(response)
            })
            .then(parsedState => {
              if (parsedState.status == '422') {
                this._addErrorMessage(itemId, parsedState.message);
                this.updateCart(line, itemId);
                standardEvent.settle(null, Alpine.store('xCartHelper').userErrorsFrom(parsedState));
              } else {
                parsedState.items.forEach(item => { productIds.push(item.product_id); });
                this.updateCartUI(parsedState, itemId, line, qty);
                standardEvent.settle(parsedState);
              }
            })
            .finally(() => {
              productIds.forEach(id => { document.dispatchEvent(new CustomEvent(`eurus:product-card:clear:${id}`)); });
              if (isShippingInsurance) {
                Alpine.store('xPopupInsurance').loading = false;
              };
            });
          }, {
            type: 'shopify:cart:lines-update',
            action: Number(qty) > 0 ? 'update' : 'remove',
            context: 'cart',
            lines: [{ id: itemId, quantity: Number(qty) || 0 }]
          });
        }

        this.t = setTimeout(() => {
          func();
        }, wait);
      },
      updateCartUI(parsedState, itemId, line, qty) {
        const items = document.querySelectorAll('.cart-item');
        if (parsedState.errors) {
          this._addErrorMessage(itemId, parsedState.errors);
          return;
        }
        Alpine.store('xCartHelper').reRenderSections(parsedState.sections);
        Alpine.store('xCartHelper').currentItemCount = parseInt(document.getElementById('cart-icon-bubble').innerHTML);

        const currentItemCount = Alpine.store('xCartHelper').currentItemCount
        Alpine.store('xCartHelper').currentItemCount = parsedState.item_count;
        if (currentItemCount != parsedState.item_count) {
          document.dispatchEvent(new CustomEvent("eurus:cart:items-changed"));
        }

        const lineItemError = document.getElementById(`LineItemError-${itemId}`);
        if (lineItemError) {lineItemError.classList.add('hidden');}
        
        const updatedValue = parsedState.items[line - 1] ? parsedState.items[line - 1].quantity : undefined;
        
        if (items.length === parsedState.items.length && updatedValue !== parseInt(qty)) {
          let message = '';
          if (typeof updatedValue === 'undefined') {
            message = window.Eurus.cart_error;
          } else {
            message = window.Eurus.cart_quantity_error_html.replace('[quantity]', updatedValue);
          }
          this._addErrorMessage(itemId, message);
        }
        const loadingEl = document.getElementById(`loading-${itemId}`);
        const removeEl = document.getElementById(`remove-${itemId}`);
        if(removeEl){
          removeEl.style.display = 'block';
        }
        if (loadingEl) {
          loadingEl.classList.add('hidden');
        }
        this.loading = false;
      },
      updateCart(line, itemId) {
        let url = ''
        if (window.location.pathname !== '/cart'){
          url = `${window.location.pathname}?section_id=cart-drawer`
        } else {
          url = `${window.location.pathname}`
        }
        fetch(url)
        .then(reponse => {
          return reponse.text();
        })
        .then(response => {
          const parser = new DOMParser();
          const html = parser.parseFromString(response,'text/html');
          
          const rpCartFooter = html.getElementById('main-cart-footer');
          const cartFooter = document.getElementById('main-cart-footer');
          if (rpCartFooter && cartFooter) {
            cartFooter.innerHTML = rpCartFooter.innerHTML;
          }
          const rpItemInput = html.querySelector('.cart-item-qty-' + line);
          const itemInput = document.querySelector('.cart-item-qty-' + line);
          if (rpItemInput && itemInput) {
            itemInput.value = rpItemInput.value;
          }
          const rpItemTotal = html.querySelector('.cart-item-price-' + line);
          const itemTotal = document.querySelector('.cart-item-price-' + line);
          if (itemTotal && rpItemTotal) {
            itemTotal.innerHTML = rpItemTotal.innerHTML;
          }
          const rpPriceTotal = html.querySelector('.cart-drawer-price-total');
          const priceTotal = document.querySelector('.cart-drawer-price-total');
          if (rpPriceTotal && priceTotal) {
            priceTotal.innerHTML = rpPriceTotal.innerHTML;
          }
          const rpCartIcon = html.getElementById('cart-icon-bubble');
          const cartIcon = document.getElementById('cart-icon-bubble');
          if (cartIcon && rpCartIcon) {
            cartIcon.innerHTML = rpCartIcon.innerHTML;
          }
        }).finally(() => {
          const loadingEl = document.getElementById(`loading-${itemId}`);
          if (loadingEl) {
            loadingEl.classList.add('hidden');
          }
          
          const removeEl = document.getElementById(`remove-${itemId}`);
          if(removeEl){
            removeEl.style.display = 'block';
          }
          this.loading = false;
        });
      },
      clearCart(itemId) {
        let removeEl = document.getElementById(`remove-${itemId}`);
        if(removeEl){
          removeEl.style.display = 'none';
        }
        document.getElementById(`loading-${itemId}`)?.classList?.remove('hidden');

        const clearedLines = Alpine.store('xCartHelper').cartLinesFromDom();
        return Alpine.store('xCartHelper').withCartLock((standardEvent) => fetch(window.Shopify.routes.root + 'cart/clear.js', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body:  JSON.stringify({ "sections":  Alpine.store('xCartHelper').getSectionsToRender().map((section) => section.id) })
        }).then((response) => {
          return Alpine.store('xCartHelper').cartJson(response);
        }).then((response) => {
          standardEvent.settle(response);
          return new Promise((resolve) => {
            requestAnimationFrame(() => {
              setTimeout(() => {
                Alpine.store('xCartHelper').reRenderSections(response.sections);
                Alpine.store('xCartHelper').currentItemCount = parseInt(document.getElementById('cart-icon-bubble').innerHTML);
                document.dispatchEvent(new CustomEvent("eurus:cart:items-changed"));
                resolve();
              }, 0)
            });
          });
        })
        .catch((error) => {
          standardEvent.fail(error);
          console.error('Error:', error);
        }).finally(() => {
          document.cookie = `eurus_insurance=; path=/`;
        }), {
          type: 'shopify:cart:lines-update',
          action: 'remove',
          context: 'cart',
          lines: clearedLines
        });
      },
      async addShippingInsurance(productId) {
        Alpine.store('xPopupInsurance').loading = true;
        Alpine.store('xPopupInsurance').openInsuranceNoti = false;
        let item = [{
          id: productId,
          quantity: 1
        }];
        return Alpine.store('xCartHelper').withCartLock((standardEvent) => fetch(window.Shopify.routes.root + 'cart/add.js', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body:  JSON.stringify({ "items": item, "sections":  Alpine.store('xCartHelper').getSectionsToRender().map((section) => section.id) })
        }).then((response) => {
          return Alpine.store('xCartHelper').cartJson(response);
        }).then((response) => {
          Alpine.store('xCartHelper').reRenderSections(response.sections);
          document.dispatchEvent(new CustomEvent("eurus:product:added", {
            detail: {
              product: response.items
            }
          }));
          Alpine.store('xCartHelper').currentItemCount = parseInt(document.getElementById('cart-icon-bubble').innerHTML);
          return Alpine.store('xCartHelper').settleWithCart(standardEvent);
        })
        .catch((error) => {
          standardEvent.fail(error);
          document.dispatchEvent(new CustomEvent("eurus:product:add-failed", {
            detail: {
              errorMessage: error
            }
          }));
          console.error('Error:', error);
        }).finally(() => {
          document.cookie = `eurus_insurance=${productId}; path=/`;
          Alpine.store('xPopupInsurance').loading = false;
          Alpine.store('xPopupInsurance').openInsuranceNotification()
        }), {
          type: 'shopify:cart:lines-update',
          action: 'add',
          context: 'cart',
          lines: [{ merchandiseId: productId, quantity: 1 }]
        });
      },
      updateEstimateShippingAll(el) {
        const cartItems = el.getElementsByClassName('cart-item');
        Array.from(cartItems).forEach((item, index) => {
          window.requestAnimationFrame(() => {
            item.dispatchEvent(new CustomEvent(`eurus:cart-item:updateEstimateShipping:${index + 1}`));
          })
        });
      },
      waitForEstimateUpdate() {
        return Alpine.store('xCartHelper').waitForCartUpdate();
      },
      async updateEstimateShipping(el, line, qty, itemId, cutOffHour, cutOffMinute, hour, minutes, calculationType, daysText, dayText, hrText, minText, excludeDay, holidayList, currentLanguage, shippingInsuranceId, cartSize) {
        el.addEventListener(`eurus:cart-item:updateEstimateShipping:${line}`, async () => {
          if (shippingInsuranceId === itemId) return;
          const queryString = window.location.search;
          if (queryString.includes("share_cart:true") && !Alpine.store('xCartShare').shared) {
            return;
          }

          const key = el.getAttribute('x-data-update-estimate-key');
          let estimateProperty = el.getAttribute('x-data-update-estimate-property');
          let properties = JSON.parse(el.getAttribute('x-data-properties'));
          
          if (estimateProperty !== '' && estimateProperty.includes('time_to_cut_off')) {
            if (Alpine.store('xEstimateDelivery').noti == '') Alpine.store('xEstimateDelivery').countdownCutOffTime(cutOffHour, cutOffMinute, hour, minutes, calculationType, daysText, dayText, hrText, minText, excludeDay, holidayList, currentLanguage);
            estimateProperty = estimateProperty.replace('time_to_cut_off', Alpine.store('xEstimateDelivery').noti);
            properties[key] = estimateProperty;
            await Alpine.store('xCartHelper').withCartLock((standardEvent) => fetch(`${Shopify.routes.root}cart/change.js`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify({
                'line': line,
                'quantity': qty,
                'properties': properties
              })
            })
            .then((response) => {
              return Alpine.store('xCartHelper').cartJson(response);
            })
            .then((cart) => { standardEvent.settle(cart, Alpine.store('xCartHelper').userErrorsFrom(cart)); }), {
              type: 'shopify:cart:lines-update',
              action: 'update',
              context: 'cart',
              lines: [{ id: itemId, quantity: Number(qty) || 0 }]
            });
          }
        });
      },
      async updateDate(date) {
        var formData = {
          'attributes': {
            'datetime-updated': `${date}`
          }
        };
        return Alpine.store('xCartHelper').withCartLock((standardEvent) => fetch(Shopify.routes.root+'cart/update', {
          method:'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(formData)
        }).then((response) => {
          return Alpine.store('xCartHelper').cartJson(response);
        }).then((cart) => {
          if (window.Eurus && cart.attributes) window.Eurus.cart_attributes = cart.attributes;
          standardEvent.settle(cart, Alpine.store('xCartHelper').userErrorsFrom(cart));
        }), Alpine.store('xCartHelper').describeCartUpdate(formData));
      },
      _addErrorMessage(itemId, message) {
        const lineItemError = document.getElementById(`LineItemError-${itemId}`);
        if (!lineItemError) return;
        lineItemError.classList.remove('hidden');
        lineItemError
          .getElementsByClassName('cart-item__error-text')[0]
          .innerHTML = message;
      },
      validateQty: function(number) {
        if((parseFloat(number) != parseInt(number)) && isNaN(number)) {
          return false
        }

        return true;
      }
    }));

    let cartQueue = Promise.resolve();

    const standardEventCtor = {
      'shopify:cart:lines-update': 'CartLinesUpdateEvent',
      'shopify:cart:note-update': 'CartNoteUpdateEvent',
      'shopify:cart:attributes-update': 'CartAttributesUpdateEvent',
      'shopify:cart:discount-update': 'CartDiscountUpdateEvent'
    };

    const silentStandardEvent = { live: false, settle() {}, fail() {} };

    /**
     * Maps a thrown cart error to the code CartErrorEvent reports. An explicit
     * error.cartErrorCode wins over the status.
     * @param {Error|*} error Whatever the mutation threw.
     * @returns {string} A Storefront API CartErrorCode enum value.
     */
    function standardEventErrorCode(error) {
      if (error && error.cartErrorCode) return error.cartErrorCode;
      const status = error && error.status;
      if (!status || status === 429 || status >= 500) return 'SERVICE_UNAVAILABLE';
      if (status >= 400) return 'INVALID';
      return 'SERVICE_UNAVAILABLE';
    }

    /**
     * Dispatches the cart standard event for a mutation and returns its settle handle.
     * Used by withCartLock; call sites pass a descriptor rather than calling this.
     * @param {object|Function|null|undefined} describe Descriptor, or a function returning
     *   one. `type` selects the constructor, `target` the element; other fields pass to
     *   the event as-is. Falsy dispatches nothing.
     * @returns {{live: boolean, settle: Function, fail: Function}} `settle(ajaxCart,
     *   userErrors)` resolves the event promise, first caller wins. `fail(error)`
     *   dispatches CartErrorEvent and rejects. `live` is false when nothing dispatched.
     */
    function beginStandardEvent(describe) {
      if (!describe) return silentStandardEvent;

      const library = window.StandardEvents;
      if (!library) return silentStandardEvent;

      let payload;
      try {
        payload = typeof describe === 'function' ? describe() : describe;
      } catch (e) {
        return silentStandardEvent;
      }
      if (!payload) return silentStandardEvent;

      const Ctor = library[standardEventCtor[payload.type]];
      if (!Ctor) return silentStandardEvent;
      if (payload.type === 'shopify:cart:lines-update' && !(payload.lines && payload.lines.length)) return silentStandardEvent;

      const { type, target, ...fields } = payload;
      let element = target;
      if (!element && window.EurusStandardEventTarget) {
        try {
          element = window.EurusStandardEventTarget({ type: type, action: fields.action });
        } catch (e) {}
      }
      if (!element) element = document;

      let deferred;
      try {
        deferred = Ctor.createPromise();
        const event = new Ctor({ ...fields, promise: deferred.promise });
        event.promise.catch(() => {});
        element.dispatchEvent(event);
      } catch (e) {
        return silentStandardEvent;
      }

      let done = false;
      return {
        live: true,
        settle(ajaxCart, userErrors) {
          if (done) return;
          done = true;
          try {
            deferred.resolve({
              cart: ajaxCart ? Ctor.createCartFromAjaxResponse(ajaxCart) : null,
              userErrors: userErrors || []
            });
          } catch (e) {}
        },
        fail(error) {
          if (done) return;
          done = true;
          try {
            element.dispatchEvent(new library.CartErrorEvent({
              error: error && error.message ? error.message : String(error),
              code: standardEventErrorCode(error)
            }));
          } catch (e) {}
          deferred.reject(error);
        }
      };
    }

    Alpine.store('xCartHelper', {
      currentItemCount: 0,
      validated: true,
      openField: '',
      openDeliveryDateField: '',
      openDiscountField: '',
      updateCart: async function(data, needValidate = false) {
        const formData = JSON.stringify(data);
        return this.withCartLock((standardEvent) => fetch(Shopify.routes.root + 'cart/update', {
          method:'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: formData
        }).then((response) => {
          if (needValidate) this.validateCart();
          return this.cartJson(response);
        }).then((response)=>{
          if (window.Eurus && response.attributes) window.Eurus.cart_attributes = response.attributes;
          standardEvent.settle(response, this.userErrorsFrom(response));
          document.dispatchEvent(new CustomEvent('eurus:cart-drawer:order-note:update', {
            detail: { message: response.note }
          } ));
        }), this.describeCartUpdate(data));
      },
      cartValidationRequest() {
        this.validateCart();
        Alpine.store('xMiniCart').openCart();
      },
      validateCart: function(isCheckOut = false) {
        this.validated = true;

        document.dispatchEvent(new CustomEvent("eurus:cart:validate", {detail: {isCheckOut: isCheckOut}}));
      },
      goToCheckout(e) {
        this.validateCart(true);
        
        if (this.validated) {
          let formData = {
            'attributes': {
              'collection-pagination': null,
              'blog-pagination': null,
              'choose_option_id': null,
              'datetime-updated': null
            }
          };

          this.withCartLock((standardEvent) => fetch(Shopify.routes.root+'cart/update', {
            method:'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(formData)
          }).then((response) => {
            return this.cartJson(response);
          }).then((cart) => {
            standardEvent.settle(cart, this.userErrorsFrom(cart));
          }), this.describeCartUpdate(formData));
        } else {
          e.preventDefault();
        }
      },
      /**
       * Runs a cart mutation with exclusive access to the cart, dispatching its standard
       * event. Usage: withCartLock((standardEvent) => fetch(...).then(...), descriptor).
       * Work deferred a tick must return a promise resolving after the deferred re-render.
       * @param {Function} mutate Receives the standard-event handle; returns a promise.
       * @param {object|Function} [describe] Event descriptor. Omitted, nothing dispatches.
       *   On success the event settles with a null cart unless mutate settled it first; a
       *   throw dispatches CartErrorEvent and rejects the caller.
       * @returns {Promise<*>} Whatever mutate resolved with.
       */
      withCartLock(mutate, describe) {
        const held = cartQueue.then(async () => {
          window.updatingCart = true;
          const standardEvent = beginStandardEvent(describe);
          try {
            const result = await mutate(standardEvent);
            standardEvent.settle(null);
            return result;
          } catch (error) {
            standardEvent.fail(error);
            throw error;
          } finally {
            window.updatingCart = false;
          }
        });
        cartQueue = held.catch(() => {});
        return held;
      },
      
      /**
       * Tail of the cart mutation queue. Await it to know pending writes finished, without
       * taking the lock.
       * @returns {Promise<void>}
       */
      waitForCartUpdate() {
        return cartQueue;
      },

      /**
       * Settles an add-to-cart event, fetching cart.js for the full cart. Use after
       * cart/add.js; endpoints that return the cart call standardEvent.settle(response).
       * @param {object} standardEvent Handle from withCartLock.
       * @param {Array} [userErrors] Validation errors, e.g. userErrorsFrom on a 422.
       * @returns {Promise<void>} Resolves once settled, never rejects.
       */
      settleWithCart(standardEvent, userErrors) {
        if (!standardEvent || !standardEvent.live) return Promise.resolve();
        return fetch(`${Shopify.routes.root}cart.js`)
          .then((response) => (response.ok ? response.json() : null))
          .then((cart) => { standardEvent.settle(cart, userErrors); })
          .catch(() => { standardEvent.settle(null, userErrors); });
      },

      /**
       * Builds the event descriptor for a cart/update body, for call sites that do not
       * know statically what they write. Usage: withCartLock(mutate,
       * this.describeCartUpdate(data)). One event only: a body combining keys reports the
       * first match. Attributes are folded into window.Eurus.cart_attributes and reported
       * whole; a null or empty value drops a key.
       * @param {object} data The request body -- `note`, `attributes` or `discount`.
       * @returns {object|null} Descriptor, or null when nothing should dispatch.
       */
      describeCartUpdate(data) {
        if (!data) return null;
        if (data.note !== undefined) {
          return { type: 'shopify:cart:note-update', context: 'cart', note: String(data.note || '') };
        }
        if (data.attributes) {
          const merged = Object.assign({}, (window.Eurus && window.Eurus.cart_attributes) || {});
          Object.keys(data.attributes).forEach((key) => {
            const value = data.attributes[key];
            if (value === null || value === '') delete merged[key];
            else merged[key] = value;
          });
          return {
            type: 'shopify:cart:attributes-update',
            context: 'cart',
            attributes: Object.keys(merged).map((key) => ({ key: key, value: String(merged[key]) }))
          };
        }
        if (data.discount !== undefined) {
          return {
            type: 'shopify:cart:discount-update',
            context: 'cart',
            discountCodes: String(data.discount).split(',').filter(Boolean).map((code) => ({ code: code }))
          };
        }
        return null;
      },

      /**
       * Parses a cart response. Use instead of response.json() on every cart write.
       * @param {Response} response
       * @returns {Promise<object>} Parsed body for 2xx and 422 -- a declined cart is not a
       *   failure. Any other status throws a cartRequestError.
       */
      cartJson(response) {
        if (response.ok || response.status === 422) return response.json();
        return response.text().then(() => {
          throw Alpine.store('xCartHelper').cartRequestError(response);
        });
      },

      /**
       * Reads the current cart lines off the rendered quantity inputs. Call BEFORE a
       * cart/clear.js request, while the line keys still exist.
       * @returns {Array<{id: string, quantity: number}>} One removal per line.
       */
      cartLinesFromDom() {
        const lines = [];
        const seen = {};
        document.querySelectorAll('[id^="cart-qty-"]').forEach((input) => {
          const key = input.id.slice(9);
          if (!key || seen[key]) return;
          seen[key] = true;
          lines.push({ id: key, quantity: 0 });
        });
        return lines;
      },

      /**
       * Builds the error a failed cart request should throw. Set .cartErrorCode on it
       * before throwing to report a code more precise than the status implies.
       * @param {Response} response
       * @param {object} [body] Parsed body, if readable -- its description or message
       *   becomes the error message.
       * @returns {Error} With .status, and .cartErrorCode already set for a 429.
       */
      cartRequestError(response, body) {
        const message = (body && (body.description || body.message)) || `Cart request failed with ${response.status}`;
        const error = new Error(message);
        error.status = response.status;
        if (response.status === 429) error.cartErrorCode = 'SERVICE_UNAVAILABLE';
        return error;
      },

      /**
       * Turns a 422 body into the userErrors a cart event resolves with. Safe to call with
       * any parsed cart body.
       * @param {object} response Parsed cart body.
       * @returns {Array<{code: string, field: Array, message: string}>} Empty unless 422.
       *   INVALID is the enum's generic value; build the array by hand for a sharper one.
       */
      userErrorsFrom(response) {
        if (!response || response.status != '422') return [];
        return [{
          code: 'INVALID',
          field: [],
          message: response.description || response.message || ''
        }];
      },
      
      /**
       * Builds the `lines` for an add event from the body about to be posted. One entry
       * point for every shape.
       * @param {Array|object|FormData} source A JSON items array; an object keyed by
       *   variant id, as the bundle sections build; or a product form's FormData, carrying
       *   the main variant in id/quantity and extras in an items[N] series.
       * @returns {Array<{merchandiseId: *, quantity: number}>} Adds are keyed by
       *   merchandiseId; updates and removes use the cart line id. Quantities are coerced.
       */
      addLines(source) {
        if (typeof FormData !== 'undefined' && source instanceof FormData) {
          const lines = [];
          const id = source.get('id');
          if (id) lines.push({ merchandiseId: id, quantity: Number(source.get('quantity')) || 1 });
          for (let index = 0; source.has(`items[${index}][id]`); index++) {
            lines.push({
              merchandiseId: source.get(`items[${index}][id]`),
              quantity: Number(source.get(`items[${index}][quantity]`)) || 1
            });
          }
          return lines;
        }
        return Object.values(source || {}).map((item) => ({
          merchandiseId: item.id || item.merchandiseId,
          quantity: Number(item.quantity) || 1
        }));
      },

      getSectionsToRender() {
        const cartItemEl = document.getElementById('main-cart-items');
        if (cartItemEl) {
          const templateId = cartItemEl.closest('.shopify-section').id
                              .replace('cart-items', '')
                              .replace('shopify-section-', '');

          return [
            {
              id: templateId + 'cart-items',
              selector: '#main-cart-items'
            },
            {
              id: templateId + 'cart-footer',
              selector: '#main-cart-footer'
            },
            {
              id: templateId + 'cart-upsell',
              selector: '#main-cart-upsell'
            },
            {
              id: "cart-icon-bubble",
              selector: '#cart-icon-bubble'
            },
            {
              id: 'mobile-cart-icon-bubble',
              selector: '#mobile-cart-icon-bubble'
            },
            {
              id: 'cart-icon-bubble-mobile-dock',
              selector: '#cart-icon-bubble-mobile-dock'
            }
          ];
        }

        return [
          {
            id: "cart-icon-bubble",
            selector: '#cart-icon-bubble'
          },
          {
            id: 'mobile-cart-icon-bubble',
            selector: '#mobile-cart-icon-bubble'
          },
          {
            id: 'cart-icon-bubble-mobile-dock',
            selector: '#cart-icon-bubble-mobile-dock'
          },
          {
            id: 'cart-drawer',
            selector: '#CartDrawer'
          }
        ];
      },
      async reRenderSections(sections) {
        let resSection = sections;
        const sectionsToRender = this.getSectionsToRender();
        if (!resSection) {
          const sectionsToRenderIds = sectionsToRender.map(s => s.id);

          if (sectionsToRender.length > 4) {
            const results = await Promise.all(
              sectionsToRenderIds.map(id =>
                fetch(`${window.location.pathname}?sections=${id}`).then(res => res.json())
              )
            );
            resSection = Object.assign({}, ...results);
          } else {
            const res = await fetch(`${window.location.pathname}?sections=${sectionsToRenderIds.join(',')}`);
            resSection = await res.json();
          }
        }
        this.getSectionsToRender().forEach((section => {
          section.selector.split(',').forEach((selector) => {
            const sectionElement = document.querySelector(selector);
            if (sectionElement) {
              if (resSection[section.id])
                sectionElement.innerHTML = getSectionInnerHTML(resSection[section.id], selector);
            }
          })
        }));
      }
    });

    Alpine.store('xVariantHelper', {
      /**
       * Parses a standard-event view payload.
       * @param {Element|Document|DocumentFragment|null} source An s-view-event marker, or
       *   anything to search from: the climb takes the first marker inside each ancestor, and
       *   a document or fragment matches on the first pass since it has no parentElement.
       * @returns {object|null} The parsed payload, or null when there is none or it is invalid.
       */
      viewPayload(source) {
        if (!source) return null;
        let marker = null;
        if (source.tagName === 'S-VIEW-EVENT') {
          marker = source;
        } else {
          while (source && source.querySelector && !marker) {
            marker = source.querySelector('s-view-event[view-event-payload]');
            source = source.parentElement;
          }
        }
        if (!marker) return null;
        try {
          return JSON.parse(marker.getAttribute('view-event-payload'));
        } catch (error) {
          return null;
        }
      },

      /**
       * Reads the options a picker currently shows.
       * @param {Element} root The picker element. Option groups carry data-option-title (the
       *   raw option name) and data-option-index; input names differ per surface and are not used.
       * @returns {Array<{name: string, value: string}>} One entry per chosen option, in option
       *   order. A group with nothing chosen is left out.
       */
      selectedOptions(root) {
        if (!root || !root.querySelectorAll) return [];
        const options = new Map();
        root.querySelectorAll('[data-option-title]').forEach((group, position) => {
          const index = Number(group.dataset.optionIndex);
          const key = Number.isInteger(index) ? index : position;
          if (options.has(key)) return;
          const name = group.dataset.optionTitle;
          const select = group.querySelector('select');
          const selected = select
            ? group.querySelector('select option[selected]') || select.options[select.selectedIndex]
            : group.querySelector('input[type="radio"]:checked');
          const value = selected ? selected.value : '';
          if (!name || !value) return;
          options.set(key, { name: name, value: value });
        });
        return Array.from(options.keys()).sort((a, b) => a - b).map((key) => options.get(key));
      },

      /**
       * Shapes a Liquid variant blob as the ProductVariant a product:select promise resolves
       * with. Use for card pickers, whose section response carries `variant | json` rather
       * than a payload.
       * @param {object|null} variant Parsed `variant | json` output.
       * @param {Array<{name: string, value: string}>} [selectedOptions]
       * @returns {object|null} null for no variant, which is what an unmatched selection reports.
       */
      variantFromLiquid(variant, selectedOptions) {
        if (!variant || !variant.id) return null;
        const currency = (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || '';
        return {
          id: variant.id,
          title: variant.title,
          availableForSale: !!variant.available,
          price: { amount: ((Number(variant.price) || 0) / 100).toFixed(2), currencyCode: currency },
          selectedOptions: selectedOptions || []
        };
      },

      /**
       * Dispatches shopify:product:select and returns the handle that settles its promise.
       * @param {Element} element The element holding the option picker.
       * @param {object|null} product Identity: id, title, handle. Falsy dispatches nothing.
       * @param {Array<{name: string, value: string}>} selectedOptions The options after the
       *   change; the event requires at least one.
       * @returns {{live: boolean, resolve: Function, reject: Function}} `resolve(variant|null)`
       *   and `reject(error)` settle once. `live` is false when nothing was dispatched.
       */
      /**
       * Dispatches product:select for a selection the response already resolved, and settles
       * it. Use when the identity changed mid-flight -- a combined-listing sibling swap.
       * @param {Element} element The element holding the option picker.
       * @param {Element|null} marker The s-view-event of the swapped-in product.
       * @returns {boolean} False when the marker carried nothing usable.
       */
      reportResolvedSelect(element, marker) {
        const payload = this.viewPayload(marker);
        if (!payload?.product) return false;
        const variant = payload.product.selectedVariant;
        const selectedOptions = variant?.selectedOptions || payload.selectedOptions;
        if (!selectedOptions || !selectedOptions.length) return false;
        this.beginProductSelect(element, payload.product, selectedOptions).resolve(variant);
        return true;
      },

      beginProductSelect(element, product, selectedOptions) {
        const inert = { live: false, resolve() {}, reject() {} };
        const library = window.StandardEvents;
        if (!library || !library.ProductSelectEvent) return inert;
        if (!product || !product.id) return inert;
        if (!selectedOptions || !selectedOptions.length) return inert;

        let deferred;
        try {
          deferred = library.ProductSelectEvent.createPromise();
          const event = new library.ProductSelectEvent({
            product: { id: product.id, title: product.title, handle: product.handle },
            selectedOptions: selectedOptions,
            promise: deferred.promise
          });
          event.promise.catch(() => {});
          (element && element.isConnected ? element : document).dispatchEvent(event);
        } catch (error) {
          return inert;
        }

        let done = false;
        return {
          live: true,
          resolve(variant) {
            if (done) return;
            done = true;
            deferred.resolve({ variant: variant || null });
          },
          reject(error) {
            if (done) return;
            done = true;
            deferred.reject(error);
          }
        };
      }
    });
  });
});

requestAnimationFrame(() => {
  document.addEventListener('alpine:init', () => {
    Alpine.data('xModalSearch', (type, desktopMaximunResults, mobileMaximunResults, productTypeSelected) => ({
      open_search: '',
      t: '',
      result: ``,
      query: '',
      cachedResults: [],
      openResults: false,
      productTypeSelected: productTypeSelected,
      showSuggest: false,
      loading: false,
      open(refName) {
        this.$refs[refName]?.classList.remove("popup-hidden");
        const input_search = document.getElementById('search-in-modal');
        if (input_search) {
          setTimeout(() => {
            input_search.focus();
          }, 100);
        }
      },
      close(refName) {
        this.$refs[refName]?.classList.add("popup-hidden");
      },
      keyUp() {
        this.query = this.$el.value;
        return () => {
          clearTimeout(this.t);
          this.t = setTimeout(() => {
            if (this.query != "") {
              this.showSuggest = false;
              this.getSearchResult(this.query);
            } else {
              this.showSuggest = true;
              this.result = "";
            }
          }, 300);
        };
      },
      getSearchResult(query) {
        this.openResults = true;
        const limit = window.xViewport.innerWidth > 767 ? desktopMaximunResults : mobileMaximunResults;
        let q = this.productTypeSelected != productTypeSelected ? `${this.productTypeSelected} AND ${query}` : query;

        const queryKey = q.replace(" ", "-").toLowerCase() + '_' + limit;

        if (this.cachedResults[queryKey]) {
          this.result = this.cachedResults[queryKey];
          return;
        }

        this.loading = true;
        const field = "author,body,product_type,tag,title,variants.barcode,variants.sku,variants.title,vendor"
        fetch(`${Shopify.routes.root}search/suggest?q=${encodeURIComponent(q)}&${encodeURIComponent('resources[type]')}=${encodeURIComponent(type)}&${encodeURIComponent('resources[options][fields]')}=${encodeURIComponent(field)}&${encodeURIComponent('resources[limit]')}=${encodeURIComponent(limit)}&section_id=predictive-search`)
          .then((response) => {
            return response.text();
          })
          .then((response) => {
            const parser = new DOMParser();
            const text = parser.parseFromString(response, 'text/html');
            this.result = text.getElementById("shopify-section-predictive-search").innerHTML;
            this.cachedResults[queryKey] = this.result;
          })
          .catch((error) => {
            throw error;
          });
        this.loading = false;
      },
      setProductType(value, input) {
        this.productTypeSelected = value;
        document.getElementById(input).value = value;
        if(this.query != '') {
          this.getSearchResult(this.query);
        }
      },
      focusForm() {
        if (this.$el.value != '') {
          this.showSuggest = false;
        } else {
          this.showSuggest = true;
        }
      }
    }));
  });
});

requestAnimationFrame(() => {
  document.addEventListener('alpine:init', () => {
    Alpine.store('xMobileNav', {
      show: false,
      loading: false,
      currentMenuLinks: [],
      open() {
        this.show = true;
        Alpine.store('xPopup').open = true;
      },
      close() {
        this.show = false;
        Alpine.store('xPopup').close();
      },
      setActiveLink(linkId) {
        this.currentMenuLinks.push(linkId);
      },
      removeActiveLink(linkId) {
        const index = this.currentMenuLinks.indexOf(linkId);
        if (index !== -1) {
          this.currentMenuLinks.splice(index, 1);
        }
      },
      resetMenu() {
        this.currentMenuLinks = [];
      },
      scrollTop(el = null) { 
        document.getElementById('menu-navigation').scrollTop = 0; 
        if (el) {
          el.closest('.scrollbar-body').scrollTop = 0;
        }
      }
    });

    Alpine.store('xPopup', {
      open: false,
      widthScrollBar: 0,
      _mqInited: false,
      setWidthScrollbar(firstLoad = true) {
        if (!this._mqInited) {
          this._mqInited = true;
          [1024, 768].forEach((bp) => {
            window.matchMedia(`(max-width: ${bp}px)`).addEventListener('change', () => {
              this.widthScrollBar = 0;
              this.setWidthScrollbar(false);
            });
          });
        }
        window.requestAnimationFrame(() => {
          const root = document.documentElement;
          const clientWidth = root.clientWidth;
          if (firstLoad) {
            const width = Math.abs(window.xViewport.innerWidth - clientWidth);
            window.requestAnimationFrame(() => {
              this.widthScrollBar = Math.max(this.widthScrollBar, width);
              root.style.setProperty('--width-scrollbar', this.widthScrollBar + "px");
            });
          } else {
            const width = Math.abs(window.innerWidth - clientWidth);
            window.requestAnimationFrame(() => {
              this.widthScrollBar = width;
              root.style.setProperty('--width-scrollbar', this.widthScrollBar + "px");
            });
          }
        });
      },
      close() {
        document.dispatchEvent(new CustomEvent("eurus:popup:close"));
        setTimeout(() => {
          this.open = false;
        }, 500);
      }
    }); 

    Alpine.store('xShowCookieBanner', {
      show: false
    });


    Alpine.store('xMiniCart', {
      open: false,
      type: '',
      loading: false,
      needReload: false,
      reLoad() {
        this.loading = true;
        const sections = Alpine.store('xCartHelper').getSectionsToRender().map(s => s.id).join(',');
        fetch(`${window.location.pathname}?sections=${sections}`)
        .then(response => response.json())
        .then(response => {
          requestAnimationFrame(() => {
            setTimeout(() => {
              Alpine.store('xCartHelper').getSectionsToRender().forEach((section => {
                section.selector.split(',').forEach((selector) => {
                  const sectionElement = document.querySelector(selector);
                  if (sectionElement && response[section.id]) {
                    sectionElement.innerHTML = getSectionInnerHTML(response[section.id], selector);
                  }
                })
              }));
              this.loading = false;
            }, 0)
          });
        });
      },
      openCart() {
        const cartPath = window.Shopify.routes.root + 'cart';
        if (window.location.pathname != cartPath && window.location.pathname != cartPath + '/') {
          requestAnimationFrame(() => {
            if (Alpine.store('xQuickView') && Alpine.store('xQuickView').show) {
              Alpine.store('xQuickView').show = false;
            }
          });

          requestAnimationFrame(() => {
            if (window.xViewport.innerWidth < 768 || this.type == "drawer") {
              setTimeout(() => {
                Alpine.store('xPopup').open = true;
              }, 50);
            }

            requestAnimationFrame(() => {
              document.getElementById('x-header-container').classList.remove('header-up');
              this.open = true;
              if (document.querySelector(".section-announcement")) {
                document.querySelector(".section-announcement").style.zIndex = 49;
              }
            });
          });
        }
      },
      hideCart() {
        requestAnimationFrame(() => {
          this.open = false;
          Alpine.store('xPopup').close();
          if (document.querySelector(".section-announcement")) {
            setTimeout(() => {
              document.querySelector(".section-announcement").style.zIndex = 60;
            }, 500);
          }
        });
      }
    });

    Alpine.store('xModal', {
      activeElement: "",
      focused: false,
      setActiveElement(element) {
        this.activeElement = element;
      },
      focus(container, elementFocus) {
        this.focused = true;
        window.requestAnimationFrame(() => {
          Alpine.store('xFocusElement').trapFocus(container, elementFocus);
        });
      },
      removeFocus() {
        this.focused = false;
        const openedBy = document.getElementById(this.activeElement);
        Alpine.store('xFocusElement').removeTrapFocus(openedBy);
      }
    });

    Alpine.store('xFocusElement', {
      focusableElements: ['button, [href], input, select, textarea, [tabindex]:not([tabindex^="-"])'],
      listeners: {},
      windowWidth: window.xViewport.innerWidth,
      trapFocus(container, elementFocus) {
        if ( this.windowWidth < 1025 ) return;

        let c = document.getElementById(container);
        let e = document.getElementById(elementFocus);
        this.listeners = this.listeners || {};
        const elements = Array.from(c.querySelectorAll(this.focusableElements));
        var first = elements[0];
        var last = elements[elements.length - 1];
        
        this.removeTrapFocus();
        
        this.listeners.focusin = (event)=>{
          if (
            event.target !== c &&
            event.target !== last &&
            event.target !== first
          ){
            return;
          }
          document.addEventListener('keydown', this.listeners.keydown);
        };

        this.listeners.focusout = () => {
          document.removeEventListener('keydown', this.listeners.keydown);
        }

        this.listeners.keydown = (e) =>{
          if (e.code.toUpperCase() !== 'TAB') return;
  
          if (e.target === last && !e.shiftKey) {
            e.preventDefault();
            first.focus();
          }
  
          if ((e.target === first || e.target == c) && e.shiftKey) {
            e.preventDefault();
            last.focus();
          }
        }
        document.addEventListener('focusout', this.listeners.focusout);
        document.addEventListener('focusin', this.listeners.focusin);
        window.requestAnimationFrame(() => {
          e.focus();
        });
      },
      removeTrapFocus(elementToFocus = null) {
        if ( window.xViewport.innerWidth < 1025 ) return;

        document.removeEventListener('focusin', ()=>{
          document.addEventListener('keydown', this.listeners.focusin);
        });
        document.removeEventListener('focusout', ()=>{
          document.removeEventListener('keydown', this.listeners.focusout);
        });
        document.removeEventListener('keydown', this.listeners.keydown);
        if (elementToFocus) elementToFocus.focus();
      }
    });
    
    Alpine.store("xEstimateDelivery", {
      day: 0,
      hour: 0,
      minute: 0,
      noti: '',
      countdownCutOffTime(cutOffHour, cutOffMinute, hrsText, minsText, calculationType, daysText, dayText, hrText, minText, excludeDay, holidayList, currentLanguage) {
        if (this.noti != '') return;
        const holidayArray = holidayList ? holidayList.split(',').map(holiday => { 
          const parts = holiday.trim().split(' ');
          const day = parts.pop().padStart(2, '0');
          
          return `${parts.join(' ')} ${day}`;
        }) : [];

        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        const current = new Date(now.getFullYear(), now.getMonth(), now.getDate(), currentHour, currentMinute);
        const cutOff = new Date(now.getFullYear(), now.getMonth(), now.getDate(), cutOffHour, cutOffMinute);

        if (current >= cutOff) {
          cutOff.setDate(cutOff.getDate() + 1);
        }
        if (calculationType == 'working') {
          let isInvalid = true;

          while (isInvalid) {
            isInvalid = false;

            if (excludeDay === 'saturday_sunday' && (cutOff.getDay() === 6 || cutOff.getDay() === 0)) {
              if (cutOff.getDay() === 6) {
                cutOff.setDate(cutOff.getDate() + 2);
              } else {
                cutOff.setDate(cutOff.getDate() + 1);
              }
              isInvalid = true;
              continue;
            }

            if (excludeDay === 'saturday' && cutOff.getDay() === 6) {
              cutOff.setDate(cutOff.getDate() + 1);
              isInvalid = true;
              continue;
            }

            if (excludeDay === 'sunday' && cutOff.getDay() === 0) {
              cutOff.setDate(cutOff.getDate() + 1);
              isInvalid = true;
              continue;
            }

            if (holidayArray.length > 0) {
              const dayOfMonth = cutOff.getDate();
              const monthName = new Intl.DateTimeFormat(currentLanguage, { month: "long" }).format(cutOff);
              const dateString = `${monthName} ${dayOfMonth < 10 ? `0${dayOfMonth}` : dayOfMonth}`;

              if (holidayArray.includes(dateString)) {
                cutOff.setDate(cutOff.getDate() + 1);
                isInvalid = true;
                continue;
              }
            }
          }
        }

        const diffMs = cutOff - current;

        this.day = Math.floor(diffMs / 1000 / 60 / 60 / 24);
        this.hour = Math.floor((diffMs / 1000 / 60 / 60) % 24);
        this.minute = Math.floor((diffMs / 1000 / 60) % 60);

        this.noti = this.day > 0 ? this.day + ' ' + (this.day > 1 ? daysText : dayText) + ' ' : ''
        this.noti += this.hour > 0 ? this.hour + ' ' + (this.hour > 1 ? hrsText : hrText) + ' ' + this.minute + ' ' + (this.minute > 1 ? minsText : minText) : this.minute + ' ' + (this.minute > 1 ? minsText : minText);
        return this.noti;
      },
      calculateCutOffTime(el, cutOffHour, cutOffMinute, hrsText, minsText, calculationType, daysText, dayText, hrText, minText, excludeDay, holidayList, currentLanguage) {
        const holidayArray = holidayList ? holidayList.split(',').map(holiday => { 
          const parts = holiday.trim().split(' ');
          const day = parts.pop().padStart(2, '0');

          return `${parts.join(' ')} ${day}`;
        }) : [];

        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        const current = new Date(now.getFullYear(), now.getMonth(), now.getDate(), currentHour, currentMinute);
        const cutOff = new Date(now.getFullYear(), now.getMonth(), now.getDate(), cutOffHour, cutOffMinute);

        if (current >= cutOff) {
          cutOff.setDate(cutOff.getDate() + 1);
        }

        if (calculationType == 'working') {
          let isInvalid = true;

          while (isInvalid) {
            isInvalid = false;

            if (excludeDay === 'saturday_sunday' && (cutOff.getDay() === 6 || cutOff.getDay() === 0)) {
              if (cutOff.getDay() === 6) {
                cutOff.setDate(cutOff.getDate() + 2);
              } else {
                cutOff.setDate(cutOff.getDate() + 1);
              }
              isInvalid = true;
              continue;
            }

            if (excludeDay === 'saturday' && cutOff.getDay() === 6) {
              cutOff.setDate(cutOff.getDate() + 1);
              isInvalid = true;
              continue;
            }

            if (excludeDay === 'sunday' && cutOff.getDay() === 0) {
              cutOff.setDate(cutOff.getDate() + 1);
              isInvalid = true;
              continue;
            }

            if (holidayArray.length > 0) {
              const dayOfMonth = cutOff.getDate();
              const monthName = new Intl.DateTimeFormat(currentLanguage, { month: "long" }).format(cutOff);
              const dateString = `${monthName} ${dayOfMonth < 10 ? `0${dayOfMonth}` : dayOfMonth}`;

              if (holidayArray.includes(dateString)) {
                cutOff.setDate(cutOff.getDate() + 1);
                isInvalid = true;
                continue;
              }
            }
          }
        }

        const diffMs = cutOff - current;
        
        const day = Math.floor(diffMs / 1000 / 60 / 60 / 24);
        const hour = Math.floor((diffMs / 1000 / 60 / 60) % 24);
        const minute = Math.floor((diffMs / 1000 / 60) % 60);
        let noti = day > 0 ? day + ' ' + (day > 1 ? daysText : dayText) + ' ' : ''
        noti += hour > 0 ? hour + ' ' + (hour > 1 ? hrsText : hrText) + ' ' + minute + ' ' + (minute > 1 ? minsText : minText) : minute + ' ' + (minute > 1 ? minsText : minText);

        this.noti = noti;

        el.value = el.value.replace('time_to_cut_off', noti);
      }
    });
  });
});

requestAnimationFrame(() => {
  document.addEventListener('alpine:init', () => {
    Alpine.store('xCartAnalytics', {
      viewCart() {
        fetch(
          '/cart.js'
        ).then(response => {
          return response.text();
        }).then(cart => {
          cart = JSON.parse(cart);
          if (cart.items.length > 0) {
            Shopify.analytics.publish('view_cart', {'cart': cart});
          }
        });
      }
    });
  });
});

requestAnimationFrame(() => {
  document.addEventListener('alpine:init', () => {
    Alpine.store('xCustomerEvent', {
      fire(eventName, el, data) {
        if (Shopify.designMode) return;
        
        const formatedData = data ? data : xParseJSON(el.getAttribute('x-customer-event-data'));
        Shopify.analytics.publish(eventName, formatedData);
      }
    });
  });
});

requestAnimationFrame(() => {
  document.addEventListener('alpine:init', () => {
    Alpine.store('xSplide', {
      load(el, configs) {
        const initSlider = () => {
          const id = el.getAttribute("id");
          if(configs.classes != undefined) {
            if (!configs.classes.arrow) configs.classes.arrow = "arrow w-8 h-8 pt-2 pb-2 pl-2 pr-2 absolute z-10 top-1/2 -translate-y-1/2 hidden md:flex items-center justify-center";
            if (!configs.classes.next) configs.classes.next = "right-0";
            if (!configs.classes.prev) configs.classes.prev = "-rotate-180";
          }
          let splide = new Splide("#" + id, configs);
          if (configs.thumbs) {
            let thumbsRoot = document.getElementById(configs.thumbs);
            let thumbs = thumbsRoot.getElementsByClassName('x-thumbnail');
            let current;
            let _this = this;

            for (let i = 0; i < thumbs.length; i++) {
              if (thumbs[i] == current) {
                if (configs.enableThumbnailOverlay) {
                  thumbs[i].classList.remove('opacity-30');
                  thumbs[i].classList.add('quickview-border');
                } else {
                  thumbs[i].classList.add('border');
                }
              } else {
                if (configs.enableThumbnailOverlay) {
                  thumbs[i].classList.add('opacity-30');
                  thumbs[i].classList.remove('quickview-border');
                } else {
                  thumbs[i].classList.remove('border');
                }
              }
              thumbs[i].addEventListener('click', function () {
                _this.moveThumbnail(i, thumbs[i], thumbsRoot, configs.thumbs_direction, configs.direction);
                splide.go(i);
              });
            }

            splide.on('refresh', function () {
              for (let i = 0; i < thumbs.length; i++) {
                thumbs[i].removeEventListener('click', function () {
                  _this.moveThumbnail(i, thumbs[i], thumbsRoot, configs.thumbs_direction, configs.direction);
                  splide.go(i);
                });
              }

              let thumbsRoot = document.getElementById(configs.thumbs);
              let thumbsNew = thumbsRoot.getElementsByClassName('x-thumbnail');

              for (let i = 0; i < thumbsNew.length; i++) {
                if (i == 0) {
                  if (configs.enableThumbnailOverlay) {
                    thumbsNew[i].classList.remove('opacity-30');
                    thumbsNew[i].classList.add('quickview-border');
                  } else {
                    thumbsNew[i].classList.add('border');
                  }
                } else {
                  if (configs.enableThumbnailOverlay) {
                    thumbsNew[i].classList.add('opacity-30');
                    thumbsNew[i].classList.remove('quickview-border');
                  } else {
                    thumbsNew[i].classList.remove('border');
                  }
                }
                
                thumbsNew[i].addEventListener('click', function () {
                  _this.moveThumbnail(i, thumbsNew[i], thumbsRoot, configs.thumbs_direction, configs.direction);
                  splide.go(i);
                });
              }
            })
            splide.on('mounted move', function () {
              let thumbnail = thumbs[splide.index];
              if (thumbnail) {
                if (current) {
                  if (configs.enableThumbnailOverlay) {
                    current.classList.add('opacity-30');
                    current.classList.remove('quickview-border');
                  } else {
                    current.classList.remove('border');
                  }
                }
                if (configs.enableThumbnailOverlay) {
                  thumbnail.classList.remove('opacity-30');
                  thumbnail.classList.add('quickview-border');
                } else {
                  thumbnail.classList.add('border')
                }
                current = thumbnail;
                _this.moveThumbnail(splide.index, thumbnail, thumbsRoot, configs.thumbs_direction, configs.direction);
              }
            });
          }

          if (configs.hotspot) {
            let hotspotRoot = document.getElementById(configs.hotspot);
            let hotspots = hotspotRoot.getElementsByClassName('x-hotspot');
            let current;

            if (configs.disableHoverOnTouch && (('ontouchstart' in window) || window.DocumentTouch && window.document instanceof DocumentTouch || window.navigator.maxTouchPoints || window.navigator.msMaxTouchPoints)) {
              for (let i = 0; i < hotspots.length; i++) {
                hotspots[i].addEventListener('click', function () {
                  splide.go(i);
                });
              }
            } else {
              for (let i = 0; i < hotspots.length; i++) {
                hotspots[i].addEventListener('mouseover', function () {
                  splide.go(i);
                });
                hotspots[i].addEventListener('focus', function () {
                  splide.go(i);
                });
              }             
            }
            splide.on('mounted move', function () {
              let hotspot = hotspots[splide.index];
              
              if (hotspot) {
                if (current) {
                  current.classList.remove('active-hotspot');
                }
                hotspot.classList.add('active-hotspot');
                current = hotspot;
              }
            });
          }
          if (configs.cardHover) {
            let cardImage = document.getElementById(configs.cardHover);
            if (window.xViewport.innerWidth > 1024) {
              cardImage.addEventListener('mousemove', function (e) {
                let left = e.offsetX;
                let width = cardImage.getBoundingClientRect().width;
                let spacing = left / width;
                let index = Math.floor(spacing * configs.maxSlide);
                splide.go(index);
              });
              cardImage.addEventListener('mouseleave', function (e) {
                splide.go(0);
              });
            }
          }
          if (configs.progressBar) {
            var bar = splide.root.querySelector( '.splide-progress-bar' );
            splide.on( 'mounted move', function () {
              var end  = configs.progressBar;
              if (configs.progressBarHeader) {
                end  = splide.Components.Slides.getLength();
              }
              var rate = 100 * (splide.index / end);
              if (bar) {
                var widthBar =  window.getComputedStyle(bar).getPropertyValue('width').replace("px", '');
                var widthProgressBar = window.getComputedStyle(bar.closest('.splide-progress')).getPropertyValue('width').replace("px", '');
                var percentBar = 100 * (Number(widthBar) /  Number(widthProgressBar));
                var rateBar = rate + percentBar;
                var maxRate = 100 - percentBar;
                if (rateBar > 100 ) {
                  rate = maxRate;
                }
                if (document.querySelector('body').classList.contains('rtl')) {
                  bar.style.marginRight = rate + '%';
                } else {
                  bar.style.marginLeft = rate + '%';
                }  
              }
            });
            var progressBar = splide.root.querySelector( '.splide-progress' );
            progressBar?.addEventListener('click', function (e) {
              var rect = progressBar.getBoundingClientRect();
              var clickX = e.clientX - rect.left;
              var percent = clickX / rect.width;
              var totalPages = Math.ceil(splide.length / splide.options.perPage);
              var page = Math.floor(percent * totalPages);
              if (page >= totalPages) page = totalPages - 1;
              var index = page * splide.options.perPage;
              splide.go(index);
            });
          }
          if(el.classList.contains('card-product-img')) {
            splide.on('resized', function() { 
              var height = splide.root.querySelector('.splide__track').offsetHeight;
              splide.Components.Slides.get().forEach((item) => {
                item.slide.style.height = height+"px";
              });
            }) 
          }

          if (configs.events) {
            configs.events.forEach((e) => {
              splide.on(e.event, e.callback);
            });
          }

          
          el.splide = splide;
          splide.mount();
          if (configs.videoProduct) {
            const move = splide.Components.Move;
            move.translate(move.toPosition(0));  
          }

          if (configs.playOnHover) {
            const breakPoint = window.matchMedia('(min-width: 1024px)');
            breakPoint.addEventListener('change', () => {
              if (breakPoint.matches) splide.Components.Autoplay.pause();
            })
          }

          if (configs.playOnHover && window.innerWidth > 1024) {
            splide.Components.Autoplay.pause();
            el.onmouseover = function() {
              splide.Components.Autoplay.play();
            };
            el.onmouseout = function() {
              splide.Components.Autoplay.pause();
            };
          }
        }

        if (window.Splide) {
          initSlider();
        } else {
          window.addEventListener('load', initSlider, { once: true });
        }
      },
      togglePlayPause(el) {
        if (!el || !el.splide || !el.splide.Components.Autoplay) return;
      
        const splide = el.splide;
        const autoplay = splide.Components.Autoplay;
      
        if (autoplay.isPaused()) {
          autoplay.play();
        } else {
          splide.go(0);
          autoplay.pause();
        }
      },
      moveThumbnail(index, thumbnail, thumbsRoot, direction) {
        if (thumbnail) {
          if (direction == 'vertical') {
            const thumbnailHeight = thumbnail.offsetHeight;
            const rootHeight = thumbsRoot.offsetHeight;
            setTimeout(() => {
              window.requestAnimationFrame(() => {
                thumbsRoot.scrollTop = (index + 1) * thumbnailHeight - rootHeight * 0.5 + thumbnailHeight * 0.5 + index * 6;
              })
            },50);
          } else {
            thumbsRoot.scrollLeft = (index - 2) * thumbnail.offsetWidth;
          }
        }
      },
      jumpToLast(el) {
        const splide = el.splide;
        const controller = splide.Components.Controller;

        const index = controller.getEnd() + 2
        splide.go(index);
      }
    });
  });
});

requestAnimationFrame(() => {
  document.addEventListener('alpine:init', () => {
    Alpine.data('xParallax', () => ({
      debounce(func, wait) {
        var timeout;
        return function() {
            var context = this, args = arguments;
            var later = function() {
              timeout = null;
              func.apply(context, args);
            };
          clearTimeout(timeout);
          timeout = setTimeout(later, wait);
        };
      },
      load(disable) {
        if (disable) return;

        if ("IntersectionObserver" in window && 'IntersectionObserverEntry' in window) {
          const observerOptions = {
            root: null,
            rootMargin: '0px 0px',
            threshold: 0
          };

          var observer = new IntersectionObserver(handleIntersect, observerOptions);
          var el;
          function handleIntersect(entries) {
            entries.forEach(function(entry) {
              if (entry.isIntersecting) {
                el = entry.target;
                window.addEventListener('scroll', parallax, {passive: true, capture: false});
              } else {
                window.removeEventListener('scroll', parallax, {passive: true, capture: false});
              }
            });
          }

          observer.observe(this.$el);
          
          var parallax = this.debounce(function() {
            var rect = el.getBoundingClientRect();
            var speed = (window.xViewport.innerHeight / el.parentElement.offsetHeight) * 20;
            var shiftDistance = (rect.top - window.xViewport.innerHeight) / speed;
            var maxShiftDistance = el.parentElement.offsetHeight / 11;
            
            if (shiftDistance < -maxShiftDistance || shiftDistance > maxShiftDistance) {
              shiftDistance = -maxShiftDistance;
            }
            
            requestAnimationFrame(() => {
              el.style.transform = 'translate3d(0, '+ shiftDistance +'px, 0)';
            })
          }, 10);
        }
      }
    }));
  });
});

requestAnimationFrame(() => {
  // Optimize INP
  document.addEventListener('alpine:init', () => {
    Alpine.store('xDOM', {
      rePainting: null, // String: alias element re-painting.
    })
  })
})

requestAnimationFrame(() => {
  document.addEventListener('eurus:cart:reload', () => {
    if (window.location.pathname !== '/cart'){
      Alpine.store('xMiniCart').reLoad();
      console.log('Mini cart has been reloaded');
    } else {
      Alpine.store('xCartHelper').reRenderSections();
      console.log('Cart has been reloaded');
    }
  })
})

requestAnimationFrame(() => {
  document.addEventListener('alpine:init', () => { 
    Alpine.data('xEmailForm', (el, blockId) => ({ 
      loading: false,
      async subscribe() {
        const form = el.querySelector('form');
        if (!form.reportValidity()) return;

        this.loading = true;        
        if (form.querySelector('[class*="captcha"]')) {
          form.submit();
          return;
        }
          
        try {
          const res = await fetch('/contact', {
            method: 'POST',
            body: new FormData(form),
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
          });
          const html = await res.text();
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const newWrapper = doc.querySelector('template[x-teleport="#eurus-popup"]')?.content.getElementById(`email-${blockId}`);
          if (newWrapper) {
            el.innerHTML = newWrapper.innerHTML;
          } else {
            form.submit();
            return;
          }
        } catch (err) {
          console.error('Error:', err);
        } finally {
          this.loading = false;
        }
      }
    })) 
  }) 
})