if (!window.Eurus.loadedScript.has('product-grid-b2b.js')) {
  window.Eurus.loadedScript.add('product-grid-b2b.js');

  requestAnimationFrame(() => {
    document.addEventListener('alpine:init', () => {
      Alpine.data('xProductCartB2B', ( productCartId ) => ({
        loading: false,
        errorMessage: false,
        showOptions: false,
        zoomMedia: false,
        buttonSubmit: "",
        variantsBundle: [],
        variantsError: [],
        variantsQty: [],
        hasErrVariant: false,
        hasQty: false,
        moneyFormatType: '',
        insuranceVariantId: '',
        loadingUrls: [],
        loadedChooseOptionsB2B: [],
        loadingChooseOption: false,
        lastChooseOptions: null,
        _onCartItemsChanged: null,
        addListener() {
            document.addEventListener('eurus:cart:items-changed', () => {
            this.loadedChooseOptionsB2B = [];
            this.resetVariantTotals();
            });
        },
        loadInsurance(id) {
          if (this.insuranceVariantId == '') {
            this.insuranceVariantId = id;
          }
        },
        async addToCart(e) {
          this.loading = true;         
          e.preventDefault();

          setTimeout(async () => {
            var productForm = this.$el.closest('form');
            let formData = new FormData(this.$refs.product_form);
            const productId = formData.get('product-id');
            var edt_element = productForm ? productForm.querySelector(`.hidden.cart-edt-properties-${productId}`) : null;
            if (edt_element) {
              edt_element.value = edt_element.value.replace("time_to_cut_off", Alpine.store('xEstimateDelivery').noti)
            }
            formData = new FormData(this.$refs.product_form);

            formData.append(
              'sections',
              Alpine.store('xCartHelper').getSectionsToRender().map((section) => section.id)
            );
            formData.append('sections_url', window.location.pathname);
            const newFormData = new FormData();
            for (let [key, value] of formData.entries()) {
              if (value !== '') {
                newFormData.append(key, value);
              }
            }

            const match = document.cookie.match('(^|;)\\s*' + 'eurus_insurance' + '\\s*=\\s*([^;]+)');
            const linkedProductList = newFormData.getAll('properties[_linked_product_id][]');
            const linkedProductListQty = newFormData.getAll('properties[_linked_product_id_qty][]');
            if (
              (this.insuranceVariantId && !localStorage.getItem('insuranceRemoved') && (!match || match[1].trim() === '')) || 
              (linkedProductList.length > 0) ||
              (linkedProductListQty.length > 0)
            ) {
              const variantId = formData.get('id');
              const productTitle = productForm ? productForm.querySelector(`.product-variant-title-${formData.get('product-id')}-${variantId}`)?.textContent : null
              let additionalOptionData = [];
              if (linkedProductListQty.length > 0) {
                let qty = newFormData.get('quantity');
                linkedProductListQty.forEach(val => {
                  additionalOptionData.push(
                    {
                      id: val,
                      quantity: qty,
                      parent_id: variantId,
                      properties: {
                        "For": productTitle
                      }
                    }
                  );
                });
              }
              if (linkedProductList.length > 0) {
                linkedProductList.forEach(val => {
                  additionalOptionData.push(
                    {
                      id: val,
                      quantity: 1,
                      parent_id: variantId,
                      properties: {
                        "For": productTitle
                      }
                    }
                  );
                });
              }
              if (this.insuranceVariantId && !localStorage.getItem('insuranceRemoved') && (!match || match[1].trim() === '')) {
                additionalOptionData.push(
                  {
                    id: this.insuranceVariantId,
                    quantity: 1
                  }
                );
              }
              if (additionalOptionData.length !== 0) {
                additionalOptionData.forEach((item, index) => {
                  const base = `items[${index}]`;

                  newFormData.append(`${base}[id]`, item.id);
                  newFormData.append(`${base}[quantity]`, item.quantity);

                  if (item.parent_id) {
                    newFormData.append(`${base}[parent_id]`, item.parent_id);
                  }

                  if (item.properties) {
                    Object.entries(item.properties).forEach(([key, value]) => {
                      newFormData.append(`${base}[properties][${key}]`, value);
                    })
                  }
                })
              }
            }
            let resProductId;
            await Alpine.store('xCartHelper').withCartLock((standardEvent) => fetch(`${Eurus.cart_add_url}`, {
              method:'POST',
              headers: { Accept: 'application/javascript', 'X-Requested-With': 'XMLHttpRequest' },
              body: newFormData
            }).then(reponse => {
              return Alpine.store('xCartHelper').cartJson(reponse);
            }).then(async (response) => {
              if (response.status == '422') {
                document.dispatchEvent(new CustomEvent("eurus:product:add-failed", {
                  detail: {
                    errorMessage: response.description
                  }
                }));
                this.errorMessage = true;
                if(this.$refs.error_message){
                this.$refs.error_message.textContent = response.description;
                }                
                setTimeout(() => {
                this.errorMessage = false;
                }, 3000);
                if (Alpine.store('xMiniCart')) {
                  Alpine.store('xMiniCart').reLoad();
                  document.dispatchEvent(new CustomEvent("eurus:cart:items-changed"));
                }
                await Alpine.store('xCartHelper').settleWithCart(standardEvent, Alpine.store('xCartHelper').userErrorsFrom(response));
              } else {
                resProductId = response.product_id;

                if (this.$refs.product_form) {
                  document.dispatchEvent(new CustomEvent(`eurus:cart:custom-options:reset:${this.$refs.product_form.getAttribute('id')}`));
                }

                if (Alpine.store('xCartNoti') && Alpine.store('xCartNoti').enable) {
                  Alpine.store('xCartNoti').setItem(response); 
                }
                Alpine.store('xPopup').close();
                document.dispatchEvent(new CustomEvent("eurus:video-popup:close-popup"));
                Alpine.store('xCartHelper').reRenderSections(response.sections);
                if (!Alpine.store('xCartNoti') || !Alpine.store('xCartNoti').enable) {
                Alpine.store('xMiniCart').openCart();
                }               
                Alpine.store('xCartHelper').currentItemCount = parseInt(document.getElementById('cart-icon-bubble').innerHTML);

                document.dispatchEvent(new CustomEvent("eurus:cart:items-changed"));
                document.dispatchEvent(new CustomEvent("eurus:cart:redirect"));
                document.dispatchEvent(new CustomEvent("eurus:product:added", {
                detail: {
                    product: response
                }
                }));
                await Alpine.store('xCartHelper').settleWithCart(standardEvent);
              }
            }).catch((error) => {
              standardEvent.fail(error);
              document.dispatchEvent(new CustomEvent("eurus:product:add-failed", {
                detail: {
                  errorMessage: error
                }
              }));
              console.error('Error:', error);
            }).finally(() => {
              document.dispatchEvent(new CustomEvent(`eurus:product-card:clear:${resProductId}`));
              this.loading = false;
              document.cookie = `eurus_insurance=${this.insuranceVariantId}; path=/`;
            }), {
              type: 'shopify:cart:lines-update',
              action: 'add',
              context: 'product',
              lines: Alpine.store('xCartHelper').addLines(newFormData)
            });
          }, 0)
        },
        async fetchChooseOptionsContent(url, index) {
          const urlProduct = `${url}?section_id=choose-option-b2b-list-view&page=${index}`;
          try {
            const content = await fetch(urlProduct).then((response) => response.text());
            const parsedContent = new DOMParser().parseFromString(content, 'text/html').getElementById("choose-options-content")?.innerHTML;
            if (parsedContent) this.loadedChooseOptionsB2B[urlProduct] = parsedContent;
            return parsedContent || null;
          } catch (error) {
            console.error(error);
            return null;
          }
        },
        async loadChooseOptionsB2B(url, el, optionId, index) {
            this.lastChooseOptions = { url, optionId, index };
            setTimeout(async () => {
            let urlProduct = `${url}?section_id=choose-option-b2b-list-view&page=${index}`;
            
            let destinationElm = document.getElementById('choose-options-b2b-' + optionId)?.querySelector('.choose-options');
            let loadingEl = document.getElementById('choose-options-b2b-' + optionId)?.querySelector('.icon-loading');
            
            if (this.loadedChooseOptionsB2B[urlProduct]) {
                if (!el.closest('.card-product-b2b-list-view')?.querySelector('#choose-options-b2b-' + optionId)?.querySelector('.choose-options-content')) {
                destinationElm && (destinationElm.innerHTML = this.loadedChooseOptionsB2B[urlProduct]);
                }
                return true;
            }
            try {
                this.loadingChooseOption = true;
                if (!this.loadingUrls.includes(urlProduct)) {
                if (loadingEl) {
                    loadingEl.classList.remove('hidden');
                }
                this.loadingUrls.push(urlProduct);
                await fetch(urlProduct).then((response) => response.text()).then((content) => {
                    const parser = new DOMParser();
                    const parsedContent = parser.parseFromString(content, 'text/html').getElementById("choose-options-content").innerHTML;
                    
                    if (parsedContent) {
                    destinationElm && (destinationElm.innerHTML = parsedContent);
                    this.loadedChooseOptionsB2B[urlProduct] = parsedContent;
                    }
                    if (loadingEl) {
                    loadingEl.classList.add('hidden');
                    }  
                }).finally(() => {
                    const index = this.loadingUrls.indexOf(urlProduct);
                    if (index !== -1) this.loadingUrls.splice(index, 1); 
                });
                }
                this.loadingChooseOption = false;
            } catch (error) {
                console.error(error);
            }
            }, 0)
        },
        updateInfoFollowCartQty(sectionId, elementId) {
          this._onCartItemsChanged = async () => {
            try{
              const [html, optionsContent] = await Promise.all([
                fetch(`${window.location.pathname}?section_id=${sectionId}`)
                  .then((response) => response.text())
                  .then((content) => new DOMParser().parseFromString(content, 'text/html')),
                this.lastChooseOptions ? this.fetchChooseOptionsContent(this.lastChooseOptions.url, this.lastChooseOptions.index) : null
              ]);
              const destination = document.getElementById(`x-product-cart-${sectionId}-${elementId}`)
              const source = html.getElementById(`x-product-cart-${sectionId}-${elementId}`);
              if(source && destination) {
                const optionsEl = optionsContent ? source.querySelector('.choose-options') : null;
                if (optionsEl) optionsEl.innerHTML = optionsContent;
                destination.innerHTML = source.innerHTML;
                this.resetVariantTotals();
              }
            } catch (e) {
              console.error(e);
            }
          };
          document.addEventListener('eurus:cart:items-changed', this._onCartItemsChanged);
        },
        listenVariantErr(variantId, err) {
          this.variantsError[variantId] = err;
          this.hasErrVariant = Object.values(this.variantsError).some(Boolean);
        },
        resetVariantTotals() {
          this.variantsBundle = [];
          this.variantsQty = [];
          this.hasQty = false;
          const root = document.getElementById(`x-product-cart-${productCartId}`);
          if (root) root.querySelectorAll('.total-variant-price').forEach((el) => { el.innerHTML = '–'; });
          const destination = document.getElementById(`x-block-sum-price-product-${productCartId}`);
          if (destination) destination.innerHTML = Alpine.store('xHelper').formatMoney(0, this.moneyFormatType || Eurus.money_format);
        },
        updateSumProductPrice(variantId, variantTotalPrice, moneyFormatType, qty) {
          this.variantsBundle[variantId] = variantTotalPrice;
          this.variantsQty[variantId] = Number(qty) || 0;
          this.hasQty = Object.values(this.variantsQty).some((variantQty) => variantQty > 0);
          this.moneyFormatType = moneyFormatType;
          const sumPrice = Object.values(this.variantsBundle).reduce((sum, price) => sum + price, 0);
          const destination = document.getElementById(`x-block-sum-price-product-${productCartId}`);
          if(destination) destination.innerHTML = Alpine.store('xHelper').formatMoney(sumPrice, moneyFormatType);
        },
        destroy() {
          if (this._onCartItemsChanged) {
            document.removeEventListener('eurus:cart:items-changed', this._onCartItemsChanged );
          }
        }
      }))
    });
  });
  requestAnimationFrame(() => {
    document.addEventListener('alpine:init', () => {
      Alpine.data('xQuantitySelectorB2B', (
        variantId,
        sectionId,
        qtyRuleMin,
        qtyRuleMax,
        isQtyRule,
        currencyCodeEnable,
        moneyWithCurrency,
        moneyFormat,
        quantityPriceBreaks,
        cartQtyVariant,
        active,
        isTrackedInventory,
        inventoryQuantity
      ) => ({
        qty: 0,
        min: qtyRuleMin,
        max: qtyRuleMax,
        errMin: false,
        errIncrement: false,
        errMax: false,
        errInventory: false,
        active: active,
        inventoryQuantity: inventoryQuantity,
        showPopup: false,
        init() {
            window.matchMedia('(min-width: 768px)').addEventListener('change', () => {
            this.showPopup = false;
            $store.xPopup.open = false;
            });
        },
        initQtyChangeEvent(selector) {
          this.$nextTick(() => { 
            this.qty = document.getElementById(selector)?.value;
            document.addEventListener(`eurus:product:quantity-changed-${sectionId}`, (e) => {
              this.qty = e.detail.quantity;
            })
          });
        },
        minus(value, dispatchStatus) {
          const step = value > 1 ? value : 1;
          const current = parseInt(this.qty) || 0;
          let next = current - step;
          if (next < this.ruleMin()) next = 0;
          this.qty = next > 0 ? next : 0;
          this.validateQty(this.qty, step, dispatchStatus);
        },
        plus(value, dispatchStatus) {
          const step = value > 1 ? value : 1;
          const current = parseInt(this.qty) || 0;
          this.qty = current <= 0 ? this.ruleMin() : current + step;
          this.validateQty(this.qty, step, dispatchStatus);
        },
        invalid(el, qtyRuleIncrement, dispatchStatus) {
          const step = qtyRuleIncrement > 1 ? qtyRuleIncrement : 1;
          this.validateQty(parseFloat(el.value), step, dispatchStatus);
        },
        ruleMin() {
          return this.min > 1 ? parseInt(this.min) : 1;
        },
        validateQty(number, step, dispatchStatus) {
          this.clearErrors();
          if (!Number.isInteger(number) || number < 1) {
            this.qty = 0;
            this.updatePrice(dispatchStatus);
            if (dispatchStatus) Alpine.$data(this.$root).listenVariantErr(variantId, false);
            return;
          }
          const min = this.ruleMin();
          const max = this.max != null ? this.max - cartQtyVariant : null;
          if (number < min) {
            this.errMin = true;
          } else if (step > 1 && (number - min) % step !== 0) {
            this.errIncrement = true;
          } else if (max != null && number > max) {
            this.errMax = true;
          } else if (isTrackedInventory && number > (this.inventoryQuantity - cartQtyVariant)) {
            this.errInventory = true;
          } else {
            this.updatePrice(dispatchStatus);
          }
          if (dispatchStatus) Alpine.$data(this.$root).listenVariantErr(variantId, this.hasError());
        },
        clearErrors() {
          this.errMin = false;
          this.errIncrement = false;
          this.errMax = false;
          this.errInventory = false;
        },
        hasError() {
          return this.errMin || this.errIncrement || this.errMax || this.errInventory;
        },
        updatePrice(dispatchStatus) {
          const productTemplate = document.getElementById(`x-product-template-${sectionId}`);
          const moneyFormatType = currencyCodeEnable ? moneyWithCurrency : moneyFormat;
          const update = (selector, value) => {
            const el = productTemplate.querySelector(selector);
            if (el) el.innerHTML = value;
          };
          let currentPrice = Number(productTemplate.querySelector('.target-price').innerHTML);
          if (quantityPriceBreaks.length <= 0) {
            update(`#total-price-${sectionId}`, (this.qty > 0) ? Alpine.store('xHelper').formatMoney(currentPrice * this.qty, moneyFormatType) : '–');
            if (dispatchStatus) Alpine.$data(this.$root).updateSumProductPrice(variantId, currentPrice * this.qty, moneyFormatType, this.qty);
          } else {
            this.active = (this.qty + cartQtyVariant) < 1 ? -1 : 0;
            for(let i = 0; i < quantityPriceBreaks.length; i++) {
              if((this.qty + cartQtyVariant) >= quantityPriceBreaks[i].minimum_quantity && (this.qty + cartQtyVariant) > 0) {
                currentPrice = quantityPriceBreaks[i].price;
                this.active = i + 1;
              }
            }
            update(`#price-list-view-b2b-${sectionId} .price-unit-list-view-b2b-${sectionId}`, Alpine.store('xHelper').formatMoney(currentPrice, moneyFormatType));
            update(`#total-price-${sectionId}`, (this.qty > 0) ? Alpine.store('xHelper').formatMoney(currentPrice * this.qty, moneyFormatType) : '–');
            if (dispatchStatus) Alpine.$data(this.$root).updateSumProductPrice(variantId, currentPrice * this.qty, moneyFormatType, this.qty);
          };
          document.dispatchEvent(new CustomEvent(`quantity:changed-${sectionId}`, {
            detail: {
              qty: this.qty
            }
          }));            
        }
      }));
    })
  });
}