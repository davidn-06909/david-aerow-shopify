if (!window.Eurus.loadedScript.has('quantity-selector.js')) {
  window.Eurus.loadedScript.add('quantity-selector.js');

  requestAnimationFrame(() => {
    document.addEventListener('alpine:init', () => {
      Alpine.data('xQuantitySelector', (
        productId,
        sectionId,
        qtyRuleMin,
        qtyRuleMax,
        isQtyRule,
        currencyCodeEnable,
        moneyWithCurrency,
        moneyFormat,
        quantityPriceBreaks = [],
        cartQtyVariant = 0,
        isTrackedInventory = false,
        inventoryQuantity = 0
      ) => ({
        qty: qtyRuleMin,
        min: qtyRuleMin,
        max: qtyRuleMax,
        inventoryQuantity: inventoryQuantity,
        errInventory: false,
        errIncrement: false,
        errMax: false,
        initQtyChangeEvent(selector) {
          this.$nextTick(() => {
            this.qty = document.getElementById(selector)?.value;
            document.addEventListener(`eurus:product:quantity-changed-${sectionId}`, (e) => {
              this.qty = e.detail.quantity;
              this.updatePrice();
            })
          });
        },
        minus(value) {
          if (this.qty - value <= this.min) {
            this.qty = this.min;
          } else {
            this.qty = parseInt(this.qty);
            (this.qty == 1) ? this.qty = 1 : this.qty = Math.ceil((this.qty - value) / value) * value;
          }
          this.errIncrement = false;
          this.errMax = false;
          this.errInventory = false;
          this.updatePrice();
        },
        plus(value) {
          const step = value > 0 ? value : 1;
          if(Number(this.qty) + value >= (this.max - cartQtyVariant) && isQtyRule) {
            this.qty = parseInt(this.max - cartQtyVariant);
          } else if (Number(this.qty) + step >= (this.inventoryQuantity - cartQtyVariant) && isTrackedInventory) {
            this.qty = parseInt(Math.floor((this.inventoryQuantity - cartQtyVariant) / step) * step);
          } else {
            this.qty = parseInt(this.qty);
            this.qty = this.qty - this.qty % value + value;
          }
          this.errIncrement = false;
          this.errMax = false;
          this.errInventory = false;
          this.updatePrice();
        },
        invalid(el, qtyRuleIncrement) {
          const number = parseFloat(el.value);
          this.errIncrement = false;
          this.errMax = false;
          this.errInventory = false;
          if (!Number.isInteger(number) || number < 1) {
            this.qty = this.min;
            this.updatePrice();
          }
          if (this.max != null && number > (this.max - cartQtyVariant)) {
            this.errMax = true;
          } else if (number > (this.inventoryQuantity - cartQtyVariant) && isTrackedInventory) {
            this.errInventory = true;
          } else if (number % qtyRuleIncrement != 0) {
            this.errIncrement = true; 
          } else {
            this.updatePrice();
          }
        },
        updatePrice() {
          const productTemplate = document.getElementById(`x-product-template-${productId}-${sectionId}`);
          if (!productTemplate) return;
          const moneyFormatType = currencyCodeEnable ? moneyWithCurrency : moneyFormat;
          const formatMoney = (amount) => Alpine.store('xHelper').formatMoney(amount, moneyFormatType);
          const update = (selector, value) => {
            productTemplate.querySelectorAll(selector).forEach((el) => el.innerHTML = value);
          };
          const unitPrice = Number(productTemplate.querySelector('.target-price')?.innerHTML) || 0;
          const compareAtPrice = Number(productTemplate.querySelector('.target-compare-at-price')?.innerHTML) || 0;
          let currentPrice = unitPrice;
          for (let i = 0; i < quantityPriceBreaks.length; i++) {
            if ((Number(this.qty) + cartQtyVariant) >= quantityPriceBreaks[i].minimum_quantity) {
              currentPrice = quantityPriceBreaks[i].price;
            }
          }
          update('.add_to_cart_button .main-product-price .price', formatMoney(currentPrice * this.qty));
          update('.add_to_cart_button .main-product-price .price-sale', formatMoney(currentPrice * this.qty));
          update('.add_to_cart_button .main-product-price .price-compare', formatMoney(compareAtPrice * this.qty));
          if (quantityPriceBreaks.length > 0) {
            update('.add_to_cart_button .main-product-price .unit-price', formatMoney(currentPrice));
            update(`#price-${sectionId}-${productId}`, formatMoney(currentPrice));
          }
          document.dispatchEvent(new CustomEvent(`quantity:changed-${sectionId}`, {
            detail: {
              qty: this.qty
            }
          }));
        },
      }));
    })
  });
}    