requestAnimationFrame(() => {
  document.addEventListener('alpine:init', () => {
    Alpine.store('xQuickView', {
      sectionId: window.xQuickView.sectionId,
      enabled: window.xQuickView.enabled,
      buttonLabel: window.xQuickView.buttonLabel,
      show_atc_button: window.xQuickView.show_atc_button,
      btn_atc_bottom: window.xQuickView.atc_btn_bottom,
      atc_btn_image_desktop: window.xQuickView.atc_btn_image_desktop,
      show: false,
      loading: false,
      error: false,
      productUrl: '',
      currentVariant: '',
      cachedResults: [],
      cachedfetch: [],
      loadingUrls: [],
      loadedChooseOptions: [],
      loadedChooseOptionsID: [],
      selected: false,
      loadingChooseOption: false,
      isMiniCart: false,
      hideViewDetail: false,
      hideQuantity: false,
      bundleTarget: '',
      bundleButtonLabel: '',
      bundleAddedLabel: '',
      bundleAddedIds: [],
      bundleStepFull: false,
      bundleChooseOptionLabel: '',
      resetOptionsTimeout: null,
      buttonQuickView: "",
      applyBundleLabel() {
        if (!this.bundleTarget || !this.bundleButtonLabel) return;

        requestAnimationFrame(() => {
          const content = document.getElementById('quickview-product-content');
          const buttonEl = content?.querySelector('.add_to_cart_button');
          if (!buttonEl) return;
          const textEl = buttonEl.querySelector('.x-atc-text');
          if (!textEl) return;
          const textNode = Array.from(textEl.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '');
          if (!textNode) return;

          const variantId = (document.getElementById('product-form-' + this.sectionId) || content).querySelector('input[name="id"]')?.value;
          if (buttonEl.hasAttribute('disabled')) {
            if (this.bundleChooseOptionLabel && buttonEl.dataset.available === 'true') {
              textNode.textContent = this.bundleChooseOptionLabel;
            }
            return;
          }

          if (this.bundleStepFull) {
            buttonEl.setAttribute('disabled', 'disabled');
            textNode.textContent = this.bundleButtonLabel;
            return;
          }

          if (this.bundleAddedLabel && variantId && this.bundleAddedIds.some((id) => id == variantId)) {
            buttonEl.setAttribute('disabled', 'disabled');
            textNode.textContent = this.bundleAddedLabel;
            return;
          }

          textNode.textContent = this.bundleButtonLabel;
        });
      },
      addListener() {
        if (this.listenersAdded) return;
        this.listenersAdded = true;
        document.addEventListener('eurus:cart:items-changed', () => {
          this.cachedResults = [];
        });
        document.addEventListener(`eurus:product-page-variant-select:updated:${this.sectionId}`, () => {
          this.applyBundleLabel();
        });
      },
      showBtn(enable, showATCButton, textBtn) {
        this.enabled = enable;
        this.buttonLabel = textBtn;
        this.show_atc_button = showATCButton;
      },
      async load(url, el, optionId) {
        this.loading = true;
        this.error = false;
        this.buttonQuickView = el;
        this.productUrl = url;
        this.requestId = (this.requestId || 0) + 1;
        const requestId = this.requestId;
        this.fetchController?.abort();
        this.fetchController = new AbortController();
        const variant = document.getElementById('current-variant-' + optionId)?.innerText.trim();
        const productUrl = new URL(url, location.origin);
        if (variant) productUrl.searchParams.set('variant', variant);
        productUrl.searchParams.set('section_id', this.sectionId);
        const key = productUrl.href;
        try {
          let content = this.cachedResults[key];
          if (!content) {
            const response = await fetch(productUrl, { signal: this.fetchController.signal });
            if (!response.ok) throw new Error('Quick view request failed');
            const html = new DOMParser().parseFromString(await response.text(), 'text/html');
            const product = html.getElementById('quickview-product-content');
            if (!product?.querySelector('[data-qv-product]')) throw new Error('Quick view product is missing');
            content = product.innerHTML;
            this.cachedResults[key] = content;
          }
          if (requestId !== this.requestId) return;
          document.getElementById('quickview-product-content').innerHTML = content;
          this.applyBundleLabel();
          document.dispatchEvent(new CustomEvent('eurus:quickview:loaded', { detail: { productUrl: url } }));
        } catch (error) {
          if (error.name !== 'AbortError' && requestId === this.requestId) this.error = true;
        } finally {
          if (requestId === this.requestId) this.loading = false;
        }
      },
      async loadChooseOptions(url, el, optionId, index) {
        setTimeout(async () => { 
          let getVariant = document.getElementById('current-variant-' + optionId)?.innerText;
          let urlProduct = `${url}?section_id=choose-option&page=${index}`;
          
          let destinationElm = document.getElementById('choose-options-' + optionId)?.querySelector('.choose-options');
          let destinationElmMobile = document.getElementById('choose-options-mobile');
          let loadingEl = document.getElementById('choose-options-' + optionId)?.querySelector('.icon-loading');
          
          if (this.loadedChooseOptions[urlProduct]) {
            if (window.xViewport.innerWidth > 767) {
              if (!el.closest('.card-product').querySelector('#choose-options-' + optionId)?.querySelector('.choose-options-content')) {
                destinationElm && (destinationElm.innerHTML = this.loadedChooseOptions[urlProduct]);
                destinationElmMobile && (destinationElmMobile.innerHTML = '');  
              }
              if (destinationElm) {
                if (destinationElm.querySelector(".add_to_cart_button")) {
                  destinationElm.querySelector(".add_to_cart_button").style.display="block";
                }
                if (destinationElm.querySelector(".label-btn-quickview")) {
                  destinationElm.querySelector(".label-btn-quickview").style.display="none";
                }
              }
            } else {
              if (!el.closest('.card-product').querySelector('#choose-options-mobile')) {
                destinationElmMobile && (destinationElmMobile.innerHTML = this.loadedChooseOptions[urlProduct]);
                destinationElm && (destinationElm.innerHTML = '');
              }
              if (destinationElmMobile) {
                if (destinationElmMobile.querySelector(".add_to_cart_button")) {
                  destinationElmMobile.querySelector(".add_to_cart_button").style.display="block";
                }
                if (destinationElmMobile.querySelector(".label-btn-quickview")) {
                  destinationElmMobile.querySelector(".label-btn-quickview").style.display="none";
                }
              }
            }
            return true;
          }
          
          try {
            if (loadingEl) {
              loadingEl.classList.remove('hidden');
            }
            this.loadingChooseOption = true;
            if (!this.loadingUrls.includes(urlProduct)) {
              this.loadingUrls.push(urlProduct);
              await fetch(urlProduct).then((response) => response.text()).then((content) => {
                const parser = new DOMParser();
                const parsedContent = parser.parseFromString(content, 'text/html').getElementById("choose-options-content").innerHTML;
                
                if (parsedContent) {
                  if (window.xViewport.innerWidth > 767) {
                    destinationElmMobile && (destinationElmMobile.innerHTML = '');
                    destinationElm && (destinationElm.innerHTML = parsedContent);
                  } else {
                    destinationElmMobile && (destinationElmMobile.innerHTML = parsedContent);
                    destinationElm && (destinationElm.innerHTML = '');
                  }
                  this.loadedChooseOptions[urlProduct] = parsedContent;
                }
                if (loadingEl) {
                  loadingEl.classList.add('hidden');
                }  
              }).finally(() => {
                const index = this.loadingUrls.indexOf(urlProduct);
                if (index !== -1) this.loadingUrls.splice(index, 1);  
                if (window.xViewport.innerWidth > 767) {
                  if (destinationElm) {
                    if (destinationElm.querySelector(".add_to_cart_button")) {
                      destinationElm.querySelector(".add_to_cart_button").style.display="block";
                    }
                    if (destinationElm.querySelector(".label-btn-quickview")) {
                      destinationElm.querySelector(".label-btn-quickview").style.display="none";
                    }
                  }
                } else {
                  if (destinationElmMobile) {
                    if (destinationElmMobile.querySelector(".add_to_cart_button")) {
                      destinationElmMobile.querySelector(".add_to_cart_button").style.display="block";
                    }
                    if (destinationElmMobile.querySelector(".label-btn-quickview")) {
                      destinationElmMobile.querySelector(".label-btn-quickview").style.display="none";
                    }
                  }
                }
                document.dispatchEvent(new CustomEvent("eurus:quickview:loaded", {
                  detail: {
                    productUrl: url
                  }
                }));  
              });
            }
            this.loadingChooseOption = false;
          } catch (error) {
            console.log(error);
          }
        }, 0)
      },
      reportProductView() {
        const fire = () => {
          if (!this.show) return;
          const element = document.getElementById('QuickViewProductViewEvent');
          if (!element || element.dataset.viewReported) return;
          if (typeof element.dispatchViewEvent !== 'function') return;
          element.dataset.viewReported = 'true';
          element.dispatchViewEvent();
        };

        if (!this.loading) {
          fire();
          return;
        }

        const waitForContent = Alpine.effect(() => {
          if (this.loading) return;
          Alpine.release(waitForContent);
          fire();
        });
      },

      open(isMiniCart = false, options = {}) {
        clearTimeout(this.resetOptionsTimeout);
        this.show = true;
        this.reportProductView();
        this.isMiniCart = isMiniCart;
        this.hideViewDetail = options.hideViewDetail || false;
        this.hideQuantity = options.hideQuantity || false;
        this.bundleTarget = options.bundleTarget || '';
        this.bundleButtonLabel = options.bundleButtonLabel || '';
        this.bundleAddedLabel = options.bundleAddedLabel || '';
        this.bundleAddedIds = options.bundleAddedIds || [];
        this.bundleStepFull = options.bundleStepFull || false;
        this.bundleChooseOptionLabel = options.bundleChooseOptionLabel || '';
        this.applyBundleLabel();
        Alpine.store('xPopup').open = true;
        document.dispatchEvent(new CustomEvent("eurus:quickview:open"));
      },
      close() {
        this.show = false;
        const trigger = this.buttonQuickView;
        this.buttonQuickView = '';
        this.fetchController?.abort();
        this.requestId = (this.requestId || 0) + 1;
        this.loading = false;
        document.documentElement.classList.remove('atelier-quick-view-open');
        requestAnimationFrame(() => {
          if (!this.show && !Alpine.store('xMiniCart')?.open && trigger?.isConnected) trigger.focus({ preventScroll: true });
        });
        clearTimeout(this.resetOptionsTimeout);
        this.resetOptionsTimeout = setTimeout(() => {
          this.hideViewDetail = false;
          this.hideQuantity = false;
          this.bundleTarget = '';
          this.bundleButtonLabel = '';
          this.bundleAddedLabel = '';
          this.bundleAddedIds = [];
          this.bundleStepFull = false;
          this.bundleChooseOptionLabel = '';
        }, 500);
        if(!Alpine.store('xMiniCart').open) {
          Alpine.store('xPopup').close();
        }
      },
      focusQuickView(quickView, btnClose) {
        if ( !this.selected && !document.querySelector('#QuickView dialog') ) {
          Alpine.store('xFocusElement').trapFocus(quickView, btnClose);
        }
      },
      removeFocusQuickView() {
        if ( !this.selected ) { 
          const elementActive = document.getElementById("button_quickview");
          Alpine.store('xFocusElement').removeTrapFocus(elementActive);
        }
      },
      closePopupMobile() {
        this.openPopupMobile = false;
      },
      showChooseOption(id, el) {
        this.openPopupMobile = true;
        const product = el.closest(".card-product");
        const addToCartBtn = product.querySelector('.choose-options')?.querySelector('.add_to_cart_button');
        const iconAddToCartBtn = product.querySelector('.choose-options')?.querySelector('.label-btn-quickview')
        const addToCartBtnMobile = document.querySelector('.choose-options-mobile')?.querySelector('.add_to_cart_button');
        const iconAddToCartBtnMobile = document.querySelector('.choose-options-mobile')?.querySelector('.label-btn-quickview')

        if(addToCartBtn && iconAddToCartBtn && window.xViewport.innerWidth > 767){
          addToCartBtn.style.display="block"
          iconAddToCartBtn.style.display="none"
        }else if(addToCartBtnMobile && iconAddToCartBtnMobile){
          addToCartBtnMobile.style.display="block"     
          iconAddToCartBtnMobile.style.display="none"
        }
        document.dispatchEvent(new CustomEvent("eurus:quickview:open"));       
      },
      clickInsideQuickView(evt, $el) {
        if(this.isMiniCart) {
          evt.stopPropagation();
          this.show = false;
          Alpine.store('xPopup').close();
        }
      },
      clickInsideContentQuickView(evt) {
        evt.stopPropagation();
      }
    });
  });
});
