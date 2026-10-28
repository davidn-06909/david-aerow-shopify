if (!window.Eurus.loadedScript.has("complete-the-set.js")) {
  window.Eurus.loadedScript.add("complete-the-set.js");

  requestAnimationFrame(() => {
    document.addEventListener("alpine:init", () => {
      Alpine.data("xCompleteTheSet", (mainVariant, sectionId, items, config, currencyCodeEnable, moneyWithCurrency, moneyFormat, quickView) => ({
        mainVariant: mainVariant,
        mainVariantQty: 1,
        items: items,
        config: config,
        loading: false,
        errorMessage: "",
        cachedResults: {},
        cachedQuickViewResults: {},
        currencyCodeEnable: currencyCodeEnable,
        moneyWithCurrency: moneyWithCurrency,
        moneyFormat: moneyFormat,
        loadingProductEls: -1,
        openDescriptionPopup: -1,
        loadQuickView: -1,
        itemsOnQuickView: structuredClone(items),
        init() {
          document.addEventListener(`quantity:changed-${sectionId}`, (e) => {
            this.mainVariantQty = e.detail.qty;
          })
        },
        money(cents) {
          if (cents === '–') {
            return cents;
          }
          return Alpine.store("xHelper").formatMoney(
            Math.round(cents),
            this.config.moneyFormat
          );
        },
        get subtotal() {
          return this.items.reduce((sum, item) => sum + item.variant.price * item.quantity, 0) + this.mainVariant.price * this.mainVariantQty;
        },
        get totalQuantity() {
          return this.items.reduce((sum, item) => sum + item.quantity, 0) + this.mainVariantQty;
        },
        get discountAmount() {
          const value = parseFloat(this.config.discountValue);
          if (Number.isNaN(value) || value <= 0) {
            return 0;
          }
          let amount = 0;
          if (this.config.discountType === "percentage") {
            amount = (this.subtotal * value) / 100;
          } else {
            const unit = value * 100;
            if (this.config.applyOnce) {
              amount = unit;
            }
            else {
              amount = this.items.reduce((sum, item) => sum + Math.min(unit, item.variant.price) * item.quantity, 0) + Math.min(unit, this.mainVariant.price) * this.mainVariantQty
            }
          }
          return Math.min(Math.round(amount), this.subtotal);
        },
        get setTotal() {
          return this.items.some((item) => !item.variant.id) ? '–' : (this.subtotal - this.discountAmount);
        },
        get setAvailable() {
          return this.items.every((item) => item.variant.available) && this.mainVariant.available;
        },
        onVariantChange(el, index, isQuickView) {
          const row = el.closest(".complete-the-set-item");
          const inputsDes = el.closest(".cts-options").querySelectorAll('input');
          const url = row.dataset.url;
          const items = isQuickView ? this.itemsOnQuickView : this.items;
          const cachedResults = isQuickView ? this.cachedQuickViewResults : this.cachedResults

          const optionValueIds = Array.from(
            row.querySelectorAll('.cts-option-select input[type="radio"]:checked')
          ).map((option) => option.dataset.optionValueId);

          if (!optionValueIds.length) {
            return;
          }

          const link = `${
            url.split("?")[0]
          }?section_id=card-product&option_values=${optionValueIds.join(",")}`;

          const setLoading = (on) => {
            this.loadingProductEls = on ? index : -1;
          };

          const apply = (doc) => {
            const variantScript = doc.querySelector(
              ".x-variants-data-js script[type='application/json']"
            );
            if (!variantScript) {
              return;
            }
            const imageEl = doc.getElementById("x-variant-image");
            const imageUrl = imageEl ? imageEl.dataset.imageUrl : "";
            const imageQvUrl = imageEl ? imageEl.dataset.imageqvUrl : "";
            const inputsSrc = doc.getElementById('variant-update').querySelectorAll('input');
            let variant;
            try {
              variant = JSON.parse(variantScript.textContent);
            } catch (e) {
              return;
            }
            if (!variant) {
              items[index].variant = {
                id: '',
                title: Array.from(row.querySelectorAll('.cts-option-select input[type="radio"]:checked')).map(option => option.value).join(" / "),
                price: 0,
                compareAtPrice: 0,
                available: false,
                image: imageUrl || items[index].variant.image,
                imageqv: imageQvUrl || items[index].variant.imageqv,
              };
              this._renderDisabledInputs(inputsDes, inputsSrc);
              return;
            }
            items[index].variant = {
              id: variant.id,
              title: variant.title,
              price: variant.price,
              compareAtPrice: variant.compare_at_price || 0,
              available: variant.available,
              image: imageUrl || items[index].variant.image,
              imageqv: imageQvUrl || items[index].variant.imageqv,
            };
            this._renderDisabledInputs(inputsDes, inputsSrc);
          };

          if (cachedResults[link]) {
            apply(cachedResults[link]);
            return;
          }

          setLoading(true);

          fetch(link)
            .then((response) => response.text())
            .then((responseText) => {
              const doc = new DOMParser().parseFromString(
                responseText,
                "text/html"
              );
              cachedResults[link] = doc;
              apply(doc);
            })
            .catch((error) => {
              console.error("Error:", error);
            })
            .finally(() => {
              setLoading(false);
            });
        },
        _renderDisabledInputs(inputsDes, inputsSrc) {
          inputsDes?.forEach(des => {
            const src = Array.from(inputsSrc).find((inputSrc) => inputSrc.dataset.optionValueId === des.dataset.optionValueId);
            if (src && des) {
              if (src.classList.contains('disabled')) {
                des.classList.add('disabled');
              } else {
                des.classList.remove('disabled');
              }
              des.checked = src.checked;
              des.dataset.available = src.dataset.available;
            }
          });
        },
        async handleAddToCart(el) {
          this.loading = true;
          this.errorMessage = "";
          const cartItems = this.items.map((item) => ({
            id: item.variant.id,
            quantity: item.quantity,
          }));
          cartItems.push({ id: this.mainVariant.id, quantity: this.mainVariantQty});

          return Alpine.store("xCartHelper").withCartLock((standardEvent) => fetch(window.Shopify.routes.root + "cart/add.js", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: cartItems,
              sections: Alpine.store("xCartHelper")
                .getSectionsToRender()
                .map((section) => section.id),
            }),
          })
            .then((response) => Alpine.store("xCartHelper").cartJson(response))
            .then((response) => {
              if (response.status == "422") {
                this.errorMessage = response.description;
                document.dispatchEvent(
                  new CustomEvent("eurus:product:add-failed", {
                    detail: { errorMessage: response.description },
                  })
                );
                return Alpine.store("xCartHelper").settleWithCart(standardEvent, Alpine.store("xCartHelper").userErrorsFrom(response));
              }
              this.errorMessage = "";
              Alpine.store("xCartHelper").reRenderSections(response.sections);
              document.dispatchEvent(
                new CustomEvent("eurus:product:added", {
                  detail: { product: response.items },
                })
              );
              if (
                Alpine.store("xQuickView") &&
                Alpine.store("xQuickView").show
              ) {
                Alpine.store("xQuickView").show = false;
              }
              if (
                Alpine.store("xCartNoti") &&
                Alpine.store("xCartNoti").enable
              ) {
                Alpine.store("xCartNoti").setItem(response);
              } else {
                Alpine.store("xMiniCart").openCart();
                document.dispatchEvent(new CustomEvent("eurus:cart:redirect"));
              }
              Alpine.store("xCartHelper").currentItemCount = parseInt(
                document.getElementById("cart-icon-bubble").innerHTML
              );
              document.dispatchEvent(
                new CustomEvent("eurus:cart:items-changed")
              );
              return Alpine.store("xCartHelper").settleWithCart(standardEvent);
            })
            .catch((error) => {
              standardEvent.fail(error);
              document.dispatchEvent(
                new CustomEvent("eurus:product:add-failed", {
                  detail: { errorMessage: error },
                })
              );
              console.error("Error:", error);
            })
            .finally(() => {
              this.loading = false;
            }), {
              type: "shopify:cart:lines-update",
              action: "add",
              context: quickView ? "dialog" : "product",
              lines: Alpine.store("xCartHelper").addLines(cartItems),
            });
        },
        removeFocus(elementId) {
          const element = document.getElementById(elementId);
          if (element) {Alpine.store('xFocusElement').removeTrapFocus(element);}
        }
      }));
    });
  });
}
