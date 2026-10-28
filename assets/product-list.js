if (!window.Eurus.loadedScript.has('product-list.js')) {
  window.Eurus.loadedScript.add('product-list.js');

  requestAnimationFrame(() => {
    document.addEventListener("alpine:init", () => {
      Alpine.data('xProductsList', (sectionId) => ({
        errorMessage: false,
        loading: false,
        showModal: false,
        showModalBlock: '',
        productNum: 0,
        currentInject: '',
        init() {
          document.addEventListener('eurus:cart:items-changed', () => {
            if (this.showModal) this.closeVariantContainer();
          });

          document.addEventListener('eurus:product-card-update', () => {
            if (this.showModal) this._updatePopupAddAll();
          });
        },
        async handleAddToCart(el, containerQuery, formQuery, name_edt) {
          let items = [];
          let productFormEls = el.closest(containerQuery).querySelectorAll(formQuery);
          productFormEls.forEach((element) => {
            let productId = element.querySelector('.product-id').value;
            let productQty = element.querySelector('.product-qty')?.value || 1;
            let edtElement = element.querySelector(`.hidden.cart-edt-properties-${productId}`);
            
            let shippingMessage = '';
            if(edtElement){
              shippingMessage = edtElement.value.replace("time_to_cut_off", Alpine.store('xEstimateDelivery').noti);
            }

            let preorderMessage = '';
            let preorderElement = element.querySelector('.hidden.preorder-edt-properties');
            if(preorderElement){
              preorderMessage = preorderElement.value;
            }

            let properties = {
              ...(name_edt && shippingMessage && { [name_edt]: shippingMessage }),
              ...(preorderMessage && { Preorder: preorderMessage }),
            };

            items.push(
              {
                'id': productId,
                'quantity': productQty,
                "properties": properties
              }
            );
          })
          
          this.loading = true;

          const context = el.closest('#ajax-loading-cart, #main-cart-items, #main-cart-footer') ? 'cart'
            : el.closest('[role="dialog"]') ? 'dialog'
            : 'product';

          return Alpine.store('xCartHelper').withCartLock((standardEvent) => fetch(window.Shopify.routes.root + 'cart/add.js', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body:  JSON.stringify({ "items": items, "sections":  Alpine.store('xCartHelper').getSectionsToRender().map((section) => section.id) })
          }).then((response) => {
            return Alpine.store('xCartHelper').cartJson(response);
          }).then((response) => {
            if (response.status == '422') {
              document.dispatchEvent(new CustomEvent("eurus:product:add-failed", {
                detail: {
                  errorMessage: response.description
                }
              }));
              const error_message = el.closest(`.add-all-container-${sectionId}`)?.querySelector('.cart-warning');

              this.errorMessage = true;
              if (error_message) {
                error_message.textContent = response.description;
              }
              this.loading = false;
              return Alpine.store('xCartHelper').settleWithCart(standardEvent, Alpine.store('xCartHelper').userErrorsFrom(response));
            } else {
              this.errorMessage = false;
              this.loading = false;
              Alpine.store('xCartHelper').reRenderSections(response.sections);
              document.dispatchEvent(new CustomEvent("eurus:product:added", {
                detail: {
                  product: response.items
                }
              }));
              if (Alpine.store('xQuickView') && Alpine.store('xQuickView').show) {
                Alpine.store('xQuickView').show = false;
              }
              Alpine.store('xPopup').close();
              if (Alpine.store('xCartNoti') && Alpine.store('xCartNoti').enable) {
                Alpine.store('xCartNoti').setItem(response); 
              } else {
                Alpine.store('xMiniCart').openCart();
                document.dispatchEvent(new CustomEvent("eurus:cart:redirect"));
              }
              Alpine.store('xCartHelper').currentItemCount = parseInt(document.getElementById('cart-icon-bubble').innerHTML);
              document.dispatchEvent(new CustomEvent("eurus:cart:items-changed"));
              return Alpine.store('xCartHelper').settleWithCart(standardEvent);
            }
          }), {
            type: 'shopify:cart:lines-update',
            action: 'add',
            context: context,
            lines: Alpine.store('xCartHelper').addLines(items)
          });
        },

        _updatePopupAddAll() {
          const addAllBtn = document.getElementById(`variant-popup-add-all-${sectionId}`);
          if (addAllBtn) {
            if (!this.checkSelectedVariants(addAllBtn)) return;
            const productContainer = addAllBtn.closest('.product-variant-modal');

            const variantEls = productContainer?.querySelectorAll('.x-variants-data-js');

            if (variantEls) {
              const hasUnavailable = [...variantEls].some(el => {
                const selectedValueId = el.querySelector("select option[selected][value], fieldset input:checked")?.dataset.optionValueId;
                const currentVariant = JSON.parse(el.querySelector(`script[type="application/json"][data-option-value-id='${selectedValueId}']`)?.textContent);

                return !currentVariant || !currentVariant.available;
              });

              addAllBtn.disabled = hasUnavailable;
            }
          }
        },

        openVariantContainer(modalId = '') {
          this.showModal = true;
          if (modalId !== '') this.showModalBlock = modalId;
          Alpine.store('xPopup').open = true;
        },

        closeVariantContainer() {
          this.showModal = false;
          if (this.showModalBlock !== '') {
            setTimeout(() => {
              this.showModalBlock = '';
            }, 500);
          }
          if(!Alpine.store('xMiniCart').open) {
            Alpine.store('xPopup').close();
          }
        },

        checkSelectedVariants(addAllBtn) {
          const container = addAllBtn.closest('.product-variant-modal');

          const optionGroups = [...container.querySelectorAll(`.x-variants-data-js fieldset, .x-variants-data-js select`)];

          const allSelected = optionGroups.every(item => {
            if (item.matches("select")) return !!item.querySelector("option[selected][value]");
            return !!item.querySelector("input:checked");
          });

          addAllBtn.disabled = !allSelected;

          return allSelected;
        },

        injectCardproduct(id) {
          if (this.currentInject === id) return;

          this.currentInject = id;

          const templateEl = document.getElementById(`card-products-template-${id}`);
          const cardProducts = templateEl.content.children;

          this.productNum = cardProducts.length;
          const splide = templateEl.closest('.splide')?.splide;

          if (splide) {
            splide.remove(() => true);
            splide.add(Array.from(cardProducts).map(el => el.cloneNode(true)));
            templateEl.closest('.product-variant-modal')?.style.setProperty('--product-num', this.productNum);
          }
        }
      }));
    });
  });
}