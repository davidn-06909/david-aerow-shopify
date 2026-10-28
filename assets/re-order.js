if (!window.Eurus.loadedScript.has('re-order.js')) {
  window.Eurus.loadedScript.add('re-order.js');

  requestAnimationFrame(() => {
    document.addEventListener("alpine:init", () => {
      Alpine.store('xReOrder', {
        show: false,
        orderName: '',
        itemsCart: '',
        itemsCartNew: [],
        properties: '',
        errorMessage: false,
        loading: false,
        clearSuccess: false,
        loadingClearCart: false,
        disableReorder: false,
        load(el, orderName) {
          this.errorMessage = false;
          this.showReorderPopup();
          let data = el.closest('.re-order-action').querySelector('.x-order-data').getAttribute('x-order-data');
          this.orderName = orderName;
          // check value of available
          this.itemsCart = xParseJSON(data).map((product) => (product.variant_available && product.available ) ? { ...product, title: this.unescapeText(product.title) } : { ...product, disable: true, title: this.unescapeText(product.title) });
          this.disableReorder = this.itemsCart.findIndex((element) => !element.disable) == -1 ? true : false;
          this.itemsCartNew = this.itemsCart;
          this.properties = this.itemsCart.map(product => product.properties);
        },
        setItemsCart(product) {
          let newItems = [];
          this.itemsCartNew.forEach((cartItem) => {
            if (cartItem.id == product.id && cartItem.variant_id == product.variant_id) {
              cartItem.quantity = product.quantity;
            }
            newItems.push(cartItem);
          });
          this.itemsCartNew = newItems;
        },
        async handleAddToCart(el) {
          this.loading = true;
          this.clearSuccess = false;
          let items = [];
          let formData = new FormData();

          JSON.parse(JSON.stringify(this.itemsCartNew)).filter(itemCart => {
            if (!itemCart.disable) {
              let item = {
                "id": itemCart.variant_id,
                "quantity": itemCart.quantity
              };
              if (itemCart.properties && Array.isArray(itemCart.properties)) {
                let propertiesObj = {};
                itemCart.properties.forEach(([key, value]) => {
                  propertiesObj[key] = value;
                });
                item.properties = propertiesObj;
              }
              items.push(item);
            }
          });
          formData.append(
            'sections',
            Alpine.store('xCartHelper').getSectionsToRender().map((section) => section.id)
          );
          formData.append('sections_url', window.location.pathname);
          formData.append('items', JSON.stringify(items));

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
              const error_message = el.closest('.reorder-popup').querySelector('.cart-warning');
              this.errorMessage = true;
              if (error_message) {
                error_message.textContent = response.description;
              }
              return Alpine.store('xCartHelper').settleWithCart(standardEvent, Alpine.store('xCartHelper').userErrorsFrom(response));
            } 
            this.closeReorderPopup();
            
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
          }), {
            type: 'shopify:cart:lines-update',
            action: 'add',
            context: 'dialog',
            lines: Alpine.store('xCartHelper').addLines(items)
          });
        },
        clearCart() {
          this.loadingClearCart = true;
          this.errorMessage = false;
          const clearedLines = Alpine.store('xCartHelper').cartLinesFromDom();
          return Alpine.store('xCartHelper').withCartLock((standardEvent) => fetch(window.Shopify.routes.root + 'cart/clear.js', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body:  JSON.stringify({ "sections":  Alpine.store('xCartHelper').getSectionsToRender().map((section) => section.id) })
          })
          .then((response) => Alpine.store('xCartHelper').cartJson(response))
          .then((response) => {
            this.clearSuccess = true;
            Alpine.store('xCartHelper').reRenderSections(response.sections);
            Alpine.store('xCartHelper').currentItemCount = parseInt(document.getElementById('cart-icon-bubble').innerHTML);
            document.dispatchEvent(new CustomEvent("eurus:cart:items-changed"));
            standardEvent.settle(response);
          })
          .catch((error) => {
            standardEvent.fail(error);
            console.error('Error:', error);
          }).finally(() => {
            this.loadingClearCart = false;
          }), {
          type: 'shopify:cart:lines-update',
          action: 'remove',
          context: 'cart',
          lines: clearedLines
          });
        },
        showReorderPopup() {
          this.show = true;
          Alpine.store('xPopup').open = true;
        },
        closeReorderPopup() {
          this.show = false;
          this.clearSuccess = false;
          this.errorMessage = false;
          Alpine.store('xPopup').close();
        },
        unescapeText(str) {
          return str.replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
        }
      });
    });
  });
}