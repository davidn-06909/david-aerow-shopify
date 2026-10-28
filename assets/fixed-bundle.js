if (!window.Eurus.loadedScript.has('fixed-bundle.js')) {
  window.Eurus.loadedScript.add('fixed-bundle.js');

  requestAnimationFrame(() => {
    document.addEventListener("alpine:init", () => {
      Alpine.data('xFixedBundle', (
        sectionId,
        shopCurrency,
        discountValue, 
        discountType,
        applyDiscountOnce,
        oosBehavior,
        atcLabel,
        initialBundleQty,
        soldOutLabel
      ) => ({
        soldOut: false,
        blocked: false,
        countdownEnded: false,
        bundleQty: 0,
        sectionEl: null,
        init() {
          this.sectionEl = this.$el.closest(`.fixed-bundle-${sectionId}`);

          const addAllButton = document.getElementById(`add-all-button-${sectionId}`);
          this.blocked = addAllButton?.dataset.b2bBlocked === 'true';
          this.countdownEnded = addAllButton?.dataset.countdownEnded === 'true';
          this.soldOut = !!addAllButton?.disabled && !this.blocked && !this.countdownEnded;
          this.bundleQty = Number(initialBundleQty) || 0;

          document.addEventListener('eurus:product-card-update', (event) => {
            if (event.detail?.sectionId !== sectionId) return;

            this._updateDiscount();
            this._applySectionBehavior();
          });

          document.addEventListener('eurus:fixed-bundle:countdown-ended', (event) => {
            if (event.detail?.sectionId !== sectionId) return;

            this.countdownEnded = true;
            const endedButton = document.getElementById(`add-all-button-${sectionId}`);
            if (endedButton) endedButton.disabled = true;
          });
        },
        _getSelectedVariant(variantData) {
          const selectedValues = variantData.querySelectorAll("select option[selected][value], fieldset input:checked");

          if (selectedValues.length === 0 || selectedValues.length < variantData.querySelectorAll('select, fieldset').length) return undefined;

          const variantJson = variantData.querySelector(`script[type="application/json"][data-option-value-id='${selectedValues[0].dataset.optionValueId}']`)?.textContent;

          return variantJson ? JSON.parse(variantJson) : null;
        },
        _isCardUnavailable(card) {
          const variantData = card.querySelector('.x-variants-data-js');
          if (!variantData) return card.dataset.variantAvailable === 'false';

          const currentVariant = this._getSelectedVariant(variantData);
          if (currentVariant === undefined) return false;

          return !currentVariant?.available;
        },
        _updateAvailability(card) {
          if (!card.hasAttribute('x-data')) return;

          const cardData = Alpine.$data(card);

          const variantData = card.querySelector('.x-variants-data-js');
          const currentVariant = variantData ? this._getSelectedVariant(variantData) : undefined;

          cardData.variantExists = currentVariant !== null;
          cardData.oos = this._isCardUnavailable(card);
        },
        get atcButtonLabel() {
          if (this.soldOut) return soldOutLabel;

          return this.bundleQty > 0 ? `${atcLabel} (${this.bundleQty})` : atcLabel;
        },
        _updateDiscount() {
          const productsList = this.sectionEl?.querySelectorAll('.card-product') || [];
          let total = 0;
          let sellingSubtotal = 0;
          const lineAmounts = [];

          productsList.forEach(prodEl => {
            this._updateAvailability(prodEl);

            if (Alpine.$data(prodEl).oos === true ) return;
            const priceEl = prodEl.querySelector('.x-card-price .target-price');
            if (!priceEl) return;

            const price = Number(priceEl.textContent) || 0;
            const compareAtPrice = Number(prodEl.querySelector('.x-card-price .target-compare-at-price')?.textContent) || 0;

            const qty = Number(prodEl.querySelector('.x-card-qty')?.textContent || 1);
            const lineSelling = price * qty;

            total += Math.max(compareAtPrice, price) * qty;
            sellingSubtotal += lineSelling;
            lineAmounts.push({ qty: qty, selling: lineSelling });

            this._updateLinePrice(prodEl, price, qty);
          });

          let saving = 0;
          const discount = Math.max(Number(discountValue) || 0, 0);

          if (discountType == 'percentage') {
            const pct = Math.min(discount, 100);

            saving = Math.floor(sellingSubtotal * pct / 100);
          }

          if (discountType == 'fixed_amounts') {
            const unitSaving = Number(discount.toFixed(2)) * Shopify.currency.rate * 100;

            if (applyDiscountOnce) {
              saving = Math.min(unitSaving, sellingSubtotal);
            } else {
              saving = lineAmounts.reduce((sum, line) => sum + Math.min(unitSaving * line.qty, line.selling), 0);
            }
          }

          const discountedTotal = Math.max(sellingSubtotal - saving, 0);

          const currentPrice = this.$el.querySelector('.fb-prices .fb-total');
          if (currentPrice) currentPrice.innerHTML = Alpine.store('xHelper').formatMoney(discountedTotal, shopCurrency);

          const totalPrice = this.$el.querySelector('.fb-prices .fb-was');
          if (totalPrice) totalPrice.innerHTML = Alpine.store('xHelper').formatMoney(total, shopCurrency);

          if (discountType == 'fixed_amounts') {
            const savedAmount = this.$el.querySelector('.fb-prices .fb-save .saved-amount');
            if (savedAmount) savedAmount.innerHTML = Alpine.store('xHelper').formatMoney((total - discountedTotal), shopCurrency);
          }
        },
        _updateLinePrice(prodEl, price, qty) {
          const lineEl = prodEl.querySelector('.fb-line-price');
          if (!lineEl) return;

          const totalEl = lineEl.querySelector('.fb-line-total');
          const qtyEl = lineEl.querySelector('.fb-line-qty');

          if (totalEl) totalEl.innerHTML = Alpine.store('xHelper').formatMoney(price * qty, shopCurrency);
          if (qtyEl) qtyEl.textContent = qty;
        },
        _applySectionBehavior() {
          switch(oosBehavior) {
            case 'lock':
            case 'hide': {
              const addAllBtn = document.getElementById(`add-all-button-${sectionId}`);
              const productsList = this.sectionEl?.querySelectorAll('.card-product');

              if (addAllBtn && productsList?.length) {
                const hasUnavailable = [...productsList].some(el => this._isCardUnavailable(el));

                addAllBtn.disabled = hasUnavailable || this.blocked || this.countdownEnded;
                this.soldOut = hasUnavailable && !this.blocked;
              }
              break;
            }
            case 'partial': {
              const addAllBtn = document.getElementById(`add-all-button-${sectionId}`);
              const productsList = this.sectionEl?.querySelectorAll('.card-product');

              if (addAllBtn && productsList?.length) {
                const forms = [];

                productsList.forEach(el => {
                  const form = el.querySelector('.product-form');
                  if (!form) return;

                  forms.push(form);

                  const priceHidden = el.dataset.b2bPriceHidden === 'true';
                  form.classList.toggle('oos', priceHidden || this._isCardUnavailable(el));
                });

                const hasAvailable = forms.some(form => !form.classList.contains('oos'));

                addAllBtn.disabled = !hasAvailable || this.blocked || this.countdownEnded;
                this.soldOut = !hasAvailable && !this.blocked;

                this.bundleQty = forms.reduce((total, form) => {
                  if (form.classList.contains('oos')) return total;

                  return total + (Number(form.querySelector('.product-qty')?.value) || 0);
                }, 0);
              }
              break;
            }
          }
        } 
      }));
    });
  });
}