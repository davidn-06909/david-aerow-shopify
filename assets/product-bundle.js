if (!window.Eurus.loadedScript.has('product-bundle.js')) {
window.Eurus.loadedScript.add('product-bundle.js');

requestAnimationFrame(() => {
  document.addEventListener("alpine:init", () => {
    Alpine.data('xProductBundle', (
      sectionId,
      minimumItems,
      shopCurrency,
      discountType,
      discountValue,
      applyDiscountOncePerOrder,
      enableQty
    ) => ({
      products: "",
      productsBundle: [],
      loading: false,
      addToCartButton: "",
      totalPrice: 0,
      errorMessage: false,
      totalDiscount: 0,
      amountPrice: 0,
      initBundle(el) {
        this.addToCartButton = el.querySelector(".button-atc");
        this.handleProductsBundle();
        const saved = sessionStorage.getItem("bundle-" + sectionId);
        if (saved) {
          this.productsBundle = JSON.parse(saved);
          this.updateBundleContent(this.productsBundle);
          setTimeout(() => {
            document.dispatchEvent(new CustomEvent(`eurus:product-bundle:productsCard-cached-${sectionId}`, {
              detail: {
                productsList: this.productsBundle
              }
            }));
          }, 500); 
        }
      },
      handleProductsBundle() {
        this.$watch('productsBundle', () => {
          document.dispatchEvent(new CustomEvent(`eurus:product-bundle:productsList-changed-${sectionId}`, {
            detail: {
              productsBundle: this.productsBundle
            }
          }));
          sessionStorage.setItem("bundle-" + sectionId, JSON.stringify(this.productsBundle));
        });
      },
      _getSelectedValueId(el) {
        return el.querySelector("select option[selected][value], fieldset input:checked")?.dataset.optionValueId;
      },
      _getCurrentVariantEl(el) {
        return el.querySelector(`script[type="application/json"][data-option-value-id='${this._getSelectedValueId(el)}']`)?.textContent;
      },
      _getCurrentVariable(el) {
        return JSON.parse(this._getCurrentVariantEl(el));
      },
      addToBundle(el, productId, productUrl, hasVariant, name_edt, productOnlyAddedOnce, options = {}) {
        let productsBundle = JSON.parse(JSON.stringify(this.productsBundle))
        const productName = el.closest(".x-product-bundle-data").querySelector(".product-name").textContent;
        const quantity = productOnlyAddedOnce ? 1 : (Number(options.quantity) > 0 ? Number(options.quantity) : 1);
        const allowQuantity = enableQty && options.allowQuantity !== false;
        const currentVariant = (hasVariant && options.variant) ? options.variant : (hasVariant ? this._getCurrentVariable(el.closest(".x-product-bundle-data")) : JSON.parse(el.closest(".x-product-bundle-data").querySelector(`script[type='application/json'][data-id='${productId}']`).textContent));

        if (productOnlyAddedOnce) {
          const isAdded = hasVariant
            ? productsBundle.some((item) => item.id == currentVariant?.id)
            : productsBundle.some((item) => item.product_id == productId);
          if (isAdded) return;
        }
        const price = !hasVariant && JSON.parse(el.closest(".x-product-bundle-data").querySelector(".current-price")?.textContent);
        const featured_image = currentVariant.featured_image ? currentVariant.featured_image.src : el.closest(".x-product-bundle-data").querySelector(".featured-image")?.textContent;
        const featured_image_alt = currentVariant.featured_image ? currentVariant.featured_image.alt : el.closest(".x-product-bundle-data").querySelector("featured-image-alt")?.textContent;
        const edtElement = el.closest(".x-product-bundle-data").querySelector(`.hidden.cart-edt-properties-${productId}`);
        let shippingMessage = '';
        if(edtElement){
          shippingMessage = edtElement.value.replace("time_to_cut_off", Alpine.store('xEstimateDelivery').noti);
        }
        const preorderElement = el.closest(".x-product-bundle-data").querySelector('.hidden.preorder-edt-properties');
        let preorderMessage = '';
        if(preorderElement){
          preorderMessage = preorderElement.value;
        }
        
        const properties = {
          ...(name_edt && shippingMessage && { [name_edt]: shippingMessage }),
          ...(preorderMessage && { Preorder: preorderMessage }),
        };

        let variantId = hasVariant ? currentVariant : currentVariant.id; 
        let newProductsBundle = [];
        let newItem = hasVariant ? { ...currentVariant, title: currentVariant.title.replaceAll("\\",""), product_id: productId, product_name: productName, productUrl: `${productUrl}?variant=${currentVariant.id}`, featured_image: featured_image, featured_image_alt: featured_image_alt, quantity: allowQuantity ? quantity : 1, "properties": properties} : { id: variantId, product_id: productId, product_name: productName, productUrl: productUrl, featured_image: featured_image, featured_image_alt: featured_image_alt, quantity: allowQuantity ? quantity : 1, price: price, "properties": properties }

        newProductsBundle = allowQuantity
          ? [...productsBundle , newItem]
          : [...productsBundle, ...Array.from({ length: quantity }, () => JSON.parse(JSON.stringify(newItem)))];
        this.productsBundle = newProductsBundle;
        this.errorMessage = false;
        this.updateBundleContent(newProductsBundle)
        let bundleContentContainer = document.getElementById(`bundle-content-container-${sectionId}`);
        requestAnimationFrame(() => {
          let splide = bundleContentContainer.splide;
          if (splide) {
            splide.refresh();
            let lastIndex = splide.Components.Controller.getEnd();
            splide.go(lastIndex);
          }
        });
      },
      getItemIndex(el, productId, hasVariant) {
        let productsBundle = JSON.parse(JSON.stringify(this.productsBundle));

        const currentVariant = hasVariant ? this._getCurrentVariable(el.closest(".x-product-bundle-data")) : JSON.parse(el.closest(".x-product-bundle-data").querySelector(`script[type='application/json'][data-id='${productId}']`).textContent);
        const variantId = typeof(currentVariant) === 'object' ? currentVariant.id : currentVariant;
        return productsBundle.findIndex(item => item.id === variantId);
      },
      updateProductQty(el, productId, hasVariant, qty) {
        let productsBundle = JSON.parse(JSON.stringify(this.productsBundle));

        const index = this.getItemIndex(el, productId, hasVariant);
        if (productsBundle[index]) {
          if (Number(qty) === 0) {
            this.removeBundle(el, index);
            return;
          }
          productsBundle[index].quantity = Number(qty);

          this.productsBundle = productsBundle;
          this.updateBundleContent(productsBundle);

          this.scrollToItem(el, index);
        }
      },
      minusProductQty(el, productId, hasVariant, qty) {
        let productsBundle = JSON.parse(JSON.stringify(this.productsBundle));

        const index = this.getItemIndex(el, productId, hasVariant);
        if (productsBundle[index]) {
          if (productsBundle[index].quantity === 1) {
            this.removeBundle(el, index);
            return;
          }
          productsBundle[index].quantity -= qty;
          this.productsBundle = productsBundle;
          this.updateBundleContent(productsBundle);

          this.scrollToItem(el, index);
        }
      },
      plusProductQty(el, productId, hasVariant, qty) {
        let productsBundle = JSON.parse(JSON.stringify(this.productsBundle));
        
        const index = this.getItemIndex(el, productId, hasVariant);
        if (productsBundle[index]) {
          productsBundle[index].quantity += qty;

          this.productsBundle = productsBundle;
          this.updateBundleContent(productsBundle);

          this.scrollToItem(el, index);
        }
      },
      async handleAddToCart(el) {
        this.loading = true;
        return Alpine.store('xCartHelper').withCartLock((standardEvent) => new Promise((resolve) => {
        setTimeout(() => {
          let items = JSON.parse(JSON.stringify(this.productsBundle));
          items = items.reduce((data, product) => {
            data[product.id] ? data[product.id].quantity += product.quantity : data[product.id] = product;
            return data;
          }, {});
          
          fetch(window.Shopify.routes.root + 'cart/add.js', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body:  JSON.stringify({ "items": items, "sections":  Alpine.store('xCartHelper').getSectionsToRender().map((section) => section.id) })
          }).then((response) => {
            return Alpine.store('xCartHelper').cartJson(response);
          }).then((response) => {

            document.dispatchEvent(new CustomEvent(`eurus:product-bundle:products-changed-${sectionId}`, {
              detail: {
                productsBundle: Object.values(items),
                el: el.closest(".product-bundler-wrapper")
              }
            }));

            if (response.status == '422') {
              document.dispatchEvent(new CustomEvent("eurus:product:add-failed", {
                detail: {
                  errorMessage: response.description
                }
              }));
              const errorMessage = el.closest('.bundler-sticky').querySelector('.cart-warning');

              this.errorMessage = true;
              if (errorMessage) {
                errorMessage.textContent = response.description;
              }
              return Alpine.store('xCartHelper').settleWithCart(standardEvent, Alpine.store('xCartHelper').userErrorsFrom(response));
            }
            this.errorMessage = false;
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
            this.loading = false;
            this.productsBundle = [];
            this.totalPrice = 0;
            this.addToCartButton.setAttribute('disabled', 'disabled');
            resolve();
          })
        }, 0)
        }), {
          type: 'shopify:cart:lines-update',
          action: 'add',
          context: 'product',
          lines: Alpine.store('xCartHelper').addLines(this.productsBundle)
        });
      },
      updateBundleContent(productsBundle) {
        let total = productsBundle.reduce((total, item) => total + item.price * item.quantity, 0);
        let totalQty = productsBundle.reduce((totalQty, item) => totalQty + item.quantity, 0);
        
        if (totalQty >= minimumItems) {
          this.addToCartButton.removeAttribute('disabled');
          let discount = 0;
          let totalDiscount = 0;

          if (!Number.isNaN(discountValue)) {
            discount = Number(discountValue);

            if (discountType == 'percentage' && Number.isInteger(discount) && discount > 0 && discount < 100) {
              totalDiscount = Math.ceil(total - total * discount / 100);
            }

            if (discountType == 'amount' && discount > 0) {
              discount = (Number.parseFloat(discountValue)).toFixed(2);
              if (applyDiscountOncePerOrder) {
                totalDiscount = total - discount * Shopify.currency.rate * 100;
              } else {
                totalDiscount = total - totalQty * discount * Shopify.currency.rate * 100;
              }
            }

            if (totalDiscount > 0) {
              let amount = total - totalDiscount;
              this.amountPrice = Alpine.store('xHelper').formatMoney(amount, shopCurrency);
              this.totalDiscount = Alpine.store('xHelper').formatMoney(totalDiscount, shopCurrency);
            } else {
              this.amountPrice = Alpine.store('xHelper').formatMoney(0, shopCurrency);
              this.totalDiscount = Alpine.store('xHelper').formatMoney(total, shopCurrency)
            }
          } else {
            this.amountPrice = 0;
            this.totalDiscount = 0;
          }
        } else {
          this.totalDiscount = 0;
          this.addToCartButton.setAttribute('disabled', 'disabled');
        }
        this.totalPrice = Alpine.store('xHelper').formatMoney(total, shopCurrency);

        document.dispatchEvent(new CustomEvent(`eurus:product-bundle:productsList-changed-${sectionId}`, {
          detail: {
            productsBundle: this.productsBundle
          }
        }));
      },
      scrollToItem(el, index) {
        const container = document.getElementById(`bundle-content-container-${sectionId}`);
        const splide = container?.splide;
        if (splide && !splide?.state.is(Splide.STATES.DESTROYED)) {
          splide.go(index);
        } else {
          container?.querySelectorAll('.bundler-product')?.[index]?.scrollIntoView({ behavior: "smooth", container: "nearest" });
        }
      },
      removeBundle(el, indexItem) {
        let item = this.productsBundle[indexItem]
        let newProductsBundle = this.productsBundle.filter((item, index) => index != indexItem)
        this.productsBundle = newProductsBundle;
        this.updateBundleContent(newProductsBundle);
        let bundleContentContainer = document.getElementById(`bundle-content-container-${sectionId}`);
        requestAnimationFrame(() => {
          let splide = bundleContentContainer.splide;
          if (splide) {
            splide.refresh();
            let lastIndex = splide.Components.Controller.getEnd();
            splide.go(lastIndex);
          }
        });

        document.dispatchEvent(new CustomEvent(`eurus:product-bundle:remove-item-${sectionId}`, {
          detail: {
            item: item,
            el: el
          }
        }));
      },
      displayDiscountValueLabel () {
        let discount = 0;
        if (!Number.isNaN(discountValue)) {
          discount = Number(discountValue);
          if (discount > 0) {
            discount = (Number.parseFloat(discountValue)).toFixed(2) * Shopify.currency.rate * 100;
          }
          return Alpine.store('xHelper').formatMoney(discount, shopCurrency);
        }
      }
    }));

    Alpine.data('xProductItemBundle', (
      el,
      sectionId,
      addToBundle,
      chooseOptionText,
      unavailableText,
      soldoutText,
      addedText,
      handleSectionId,
      productUrl,
      productId,
      hasVariant,
      productOnlyAddedOnce,
      enableQty,
      isByob
    ) => ({
      qty: 0,
      showQty: false,
      productsList: [],
      dataVariant: [],
      currentVariant: '',
      isSelect: false,
      productId: productId,
      productUrl: productUrl,
      _getCurrentStep() {
        return el.closest('.x-product-bundle-data')?.getElementsByClassName('current-step')[0]?.textContent;
      },
      checkProductQty() {
        if (!enableQty) return;

        const item = (hasVariant) 
          ? this.productsList?.find(({ id }) => id === this.currentVariant?.id) 
          : this.productsList?.find(({ product_id }) => product_id === this.productId);
        
        this.qty = (item) ? Number(item.quantity) : 0;
        this.showQty = Boolean(item);
      },
      initEvent() {
        if (hasVariant) {
          this.checkVariantSelected();
        } else {
          this.currentVariant = JSON.parse(el.closest('.card-product').querySelector('script[type="application/json"]').textContent);
        }
        document.addEventListener(`eurus:card-product-bundle:productsList-changed-${handleSectionId}`, (e) => {
          this.productsList = e.detail.productsList;
          this.checkProductQty();
        });
        if (isByob) {
          document.addEventListener(`eurus:byob:data-Loaded-${handleSectionId}`, (e) => {
            this.productsList = e.detail.productsBundle;
            this.checkProductQty();
          })
        }
        if (hasVariant) {
          document.addEventListener(`eurus:product-card-variant-select:updated:${sectionId}:${productUrl}`, (e) => {
            this.currentVariant = e.detail.currentVariant;
            this.checkVariantSelected();
            this.renderAddToBundleButton();
            this.checkProductQty();
            if (this.currentVariant && this.currentVariant.id) {
              this.productUrl = productUrl + `/?variant=${this.currentVariant.id}`
            }
          });
        }

        document.addEventListener(`eurus:product-bundle:productsCard-cached-${handleSectionId}`, (e) => {
          if (!productOnlyAddedOnce) return;
          const buttonATB = document.getElementById('x-atc-button-' + sectionId);
          if (!buttonATB) return;
          const item = hasVariant
            ? e.detail.productsList.find(({ id }) => id === this.currentVariant?.id)
            : e.detail.productsList.find(({ product_id }) => product_id === this.productId);
          if (!item) return;

          buttonATB.setAttribute('disabled', 'disabled');
          const addButtonText = buttonATB.querySelector('.x-atc-text');
          if (addButtonText) addButtonText.textContent = addedText;

          if (hasVariant) {
            this.dataVariant = JSON.parse(JSON.stringify(this.dataVariant)).map(variant =>
              (variant.id == this.currentVariant?.id) ? { id: variant.id, disable: true } : { id: variant.id, disable: variant.disable }
            );
          } else {
            const cardProducts = document.getElementById('bundle-product-' + this.productId);
            cardProducts?.classList.add("cursor-pointer", "pointer-events-none", "opacity-70");
          }
        });

        document.addEventListener(`eurus:product-bundle:products-changed-${handleSectionId}`, (e) => {
          e.detail.productsBundle.map(item => {
            if(hasVariant && item.product_id == this.productId && this.currentVariant.available) {
              let buttonATC = document.getElementById('x-atc-button-' + sectionId);
              if (buttonATC) buttonATC.removeAttribute('disabled');
            } else if(item.product_id == this.productId) {
              let buttonATC = document.getElementById('x-atc-button-' + sectionId);
              if (buttonATC) buttonATC.removeAttribute('disabled');
            }
          })
          if(productOnlyAddedOnce) {
            this.setUnSelectVariant();
          }
        })

        document.addEventListener(`eurus:product-bundle:remove-item-${handleSectionId}`, (e) => {
          if (this.isSelect && e.detail.item.product_id == this.productId && hasVariant) {
            if (this.currentVariant && this.currentVariant.available) {
              let buttonATC = document.getElementById('x-atc-button-' + sectionId);
              if (buttonATC) {
                buttonATC.removeAttribute('disabled');
                const addButtonText = buttonATC.querySelector('.x-atc-text');
                if (addButtonText) addButtonText.textContent = addToBundle
              }
            }
            this.setUnSelectVariant(e.detail.item);
          } else if(e.detail.item.product_id == this.productId) { 
            let buttonATC = document.getElementById('x-atc-button-' + sectionId);
            if (buttonATC) {
              const addButtonText = buttonATC.querySelector('.x-atc-text');

              if (hasVariant && !this.checkVariantSelected()) {
                buttonATC.setAttribute('disabled', 'disabled');
                if (addButtonText) addButtonText.textContent = chooseOptionText;
              } else {
                buttonATC.removeAttribute('disabled');
                if (addButtonText) addButtonText.textContent = addToBundle;
              }
            }

            if(productOnlyAddedOnce) {
              const cardProducts = document.getElementById('bundle-product-' + e.detail.item.product_id);
              cardProducts?.classList.remove("cursor-pointer", "pointer-events-none", "opacity-70")
            }
          } else if (e.detail.resetMax && (!isByob || e.detail.item?.current_step == this._getCurrentStep())) {
            this.renderAddToBundleButton();
          }
        })
        if (hasVariant) {
          const checkedInput = el.querySelector('fieldset input:checked');
          const selectEl = el.querySelector('select');
          const optionValueId = checkedInput?.dataset.optionValueId
            ?? selectEl?.selectedOptions[0]?.dataset.optionValueId;
          if (optionValueId) {
            const variantObj = el.querySelector(`script[type="application/json"][data-option-value-id="${optionValueId}"]`);
            if (variantObj) this.currentVariant = JSON.parse(variantObj.textContent);
          }
        }
      },
      setVariantSelected(el) {
        if (this.currentVariant && this.dataVariant.findIndex(item => (item.id == this.currentVariant.id && item.disable)) != -1) {
          let buttonATB = el.closest('.bundle-product').querySelector('.x-atb-button');
          buttonATB.setAttribute('disabled', 'disabled');
        }
      },
      setDisableSelectProduct(el) {
        if (productOnlyAddedOnce) {
          let newVariants = JSON.parse(JSON.stringify(this.dataVariant)).map(item => (item.id == this.currentVariant.id) ? { id: item.id, disable: true } : { id: item.id, disable: item.disable})
          this.dataVariant = newVariants;
          let buttonATB = el.closest('.bundle-product').querySelector('.x-atb-button');
          buttonATB.setAttribute('disabled', 'disabled');
          const addButtonText = buttonATB.querySelector('.x-atc-text');
          if (addButtonText) addButtonText.textContent = addedText;
        }
      },
      setUnSelectVariant(product) {
        let newVariants = "";
        if (product) {
          newVariants = JSON.parse(JSON.stringify(this.dataVariant)).map(item => (item.id == product.id) ? { id: item.id, disable: false } : { id: item.id, disable: item.disable})
        } else {
          newVariants = JSON.parse(JSON.stringify(this.dataVariant)).map(item => ({ id: item.id, disable: false }))
        }
        this.dataVariant = newVariants;
      },
      renderAddToBundleButton() {
        const buttonATB = document.getElementById('x-atc-button-' + sectionId)

        if (!buttonATB) return;

        const addButtonText = buttonATB.querySelector('.x-atc-text');

        if (addButtonText) {
          if (this.currentVariant) {
            const currentStep = this._getCurrentStep();
            const productsList = isByob
              ? this.productsList.filter(({ current_step }) => current_step == currentStep)
              : this.productsList;
            const itemVariant = productsList.find(({ id }) => id === this.currentVariant.id);
            if (itemVariant && buttonATB) {
              setTimeout(() => {
                buttonATB.setAttribute('disabled', 'disabled');
                if (this.currentVariant.available) {
                  addButtonText.textContent = productOnlyAddedOnce ? addedText : addToBundle;
                } else {
                  addButtonText.textContent = soldoutText;
                }
              }, 100);
              return;
            }
            if (this.currentVariant.available) {
              buttonATB.removeAttribute('disabled');
              addButtonText.textContent = addToBundle;
            } else {
              addButtonText.textContent = soldoutText;
            }
          } else {
            if (hasVariant && !this.checkVariantSelected()) {
              buttonATB.setAttribute('disabled', 'disabled');
              addButtonText.textContent = chooseOptionText;
            } else {
              addButtonText.textContent = unavailableText;
            }
          }
        }
      },
      checkVariantSelected() {
        const fieldsets = [...document.querySelectorAll(`#shopify-section-${handleSectionId} #variant-update-${sectionId} fieldset`)];
        if (fieldsets.findIndex(item => !item.querySelector("input:checked")) === -1) {
          this.isSelect = true;
          if (!this.currentVariant) {
            const selectedFieldset = fieldsets.find(item => item.querySelector("input:checked"));
            this._setCurrentVariant(selectedFieldset);
          }
          return true;
        } else {
          return false;
        }
      },
      _setCurrentVariant(fieldset) {
        const optionValueId = fieldset?.querySelector("input:checked")?.dataset.optionValueId;
        const variantObj = fieldset?.querySelector(`script[type="application/json"][data-option-value-id="${optionValueId}"]`);
        this.currentVariant = JSON.parse(variantObj?.textContent ?? null);
      }
    }));

    Alpine.data('xProductList', (
      sectionId,
      productUrl,
      handleSectionId
    ) => ({
      productsList: [],
      loadingProductEls: '',
      init() {
        document.addEventListener(`eurus:product-bundle:productsList-changed-${handleSectionId}`, (e) => {
          this.productsList = e.detail.productsBundle;
          document.dispatchEvent(new CustomEvent(`eurus:card-product-bundle:productsList-changed-${handleSectionId}`, {
            detail: {
              productsList: this.productsList
            }
          }));
        })
        document.addEventListener(`eurus:product-card-variant-select:updated:${sectionId}:${productUrl}`, (e) => {
          this.loadingProductEls = '';
        });
      }
    }))
  });
});
}