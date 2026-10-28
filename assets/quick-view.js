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
      load(url, el, optionId) {
        this.loading = true;

        requestAnimationFrame(() => {
          setTimeout(() => { 
            if (this.buttonQuickView == '') {
              this.buttonQuickView = el;
            }
            let variant = document.getElementById('current-variant-' + optionId)?.innerText;
            let productUrl = variant?`${url}?variant=${variant}&section_id=${this.sectionId}`:`${url}?section_id=${this.sectionId}`;
            productUrl = productUrl.replace(/\s+/g, '');
            
            if (this.cachedResults[productUrl]) {
              document.getElementById('quickview-product-content').innerHTML = this.cachedResults[productUrl];
              this.loading = false;
              this.applyBundleLabel();
              return true;
            }
            
            if (this.cachedfetch[productUrl]) {
              return true;
            }

            this.cachedfetch[productUrl] = true;
            fetch(productUrl)
              .then(reponse => {
                return reponse.text();
              })
              .then((response) => {
                const parser = new DOMParser();
                const content = parser.parseFromString(response,'text/html').getElementById("quickview-product-content").innerHTML;
                document.getElementById('quickview-product-content').innerHTML = content;
                this.cachedResults[productUrl] = content;
                this.applyBundleLabel();
                document.dispatchEvent(new CustomEvent("eurus:quickview:loaded", {
                  detail: {
                    productUrl: url
                  }
                }));
              })
              .finally(() => {
                this.loading = false;
                this.cachedfetch[productUrl] = false;
              })

            return true;
          }, 0)
        });
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
        this.buttonQuickView = '';
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
        if ( !this.selected ) { 
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