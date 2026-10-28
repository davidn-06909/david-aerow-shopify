if (!window.Eurus.loadedScript.has('variant-select-card.js')) {
  window.Eurus.loadedScript.add('variant-select-card.js');

  requestAnimationFrame(() => {
    document.addEventListener('alpine:init', () => {
      Alpine.data('xVariantSelectCard', (
        element,
        sectionId,
        productId,
        productUrl,
        customizableChooseOption,
        chooseOption,
        productBundle,
        pageParam,
        chooseOptionLabel,
        addToCartLabel,
        blockId,
        handleSectionId
      ) => ({
        loadingEls: '',
        currentVariant: {},
        cachedResults: [],
        productSelect: null,
        productSelectPending: null,
        productSelectSwap: false,
        init() {
          document.addEventListener(`eurus:product-card:clear:${productId}`, () => { 
            this._reloadCardProduct();
          })
        },
        _beginProductSelect() {
          if (this.productSelect) this._failProductSelect(new Error('Superseded by a newer selection'), this.productSelect);
          const payload = Alpine.store('xVariantHelper').viewPayload(element);
          if (!payload) return null;
          this.productSelect = Alpine.store('xVariantHelper').beginProductSelect(element, payload.product, Alpine.store('xVariantHelper').selectedOptions(element));
          return this.productSelect;
        },
        /**
         * Settles a pending product:select from the card section response. Reads the variant
         * out of the response rather than waiting for the render callback, which defers into
         * requestAnimationFrame -- a render that never finishes must not leave a listener waiting.
         * @param {Document} html The card section response.
         * @param {object|null} handle The handle _renderProductCard began, if any.
         */
        _settleProductSelectFrom(html, handle) {
          const pending = handle || this.productSelect;
          if (!pending) return;
          if (this.productSelect === pending) this.productSelect = null;
          const blob = html && html.querySelector
            ? html.querySelector('.x-variants-data-js script[type="application/json"], #choose-options-content script[type="application/json"]')
            : null;
          if (!blob) {
            pending.reject(new Error('The card section response carried no variant.'));
            return;
          }
          let variant = null;
          try {
            variant = JSON.parse(blob.textContent);
          } catch (error) {
            pending.reject(error);
            return;
          }
          pending.resolve(Alpine.store('xVariantHelper').variantFromLiquid(variant, Alpine.store('xVariantHelper').selectedOptions(element)));
        },
        _failProductSelect(error, handle) {
          const pending = handle || this.productSelect;
          if (!handle || this.productSelect === handle) {
            this.productSelect = null;
            this.productSelectPending = null;
            this.productSelectSwap = false;
          }
          if (pending) pending.reject(error);
        },
        _reportSwapProductSelect(html) {
          if (!html) return;
          const source = chooseOption
            ? html.querySelector('#choose-options-content')
            : html.getElementById(`card-product-clone-${handleSectionId}${blockId ? `-${blockId}` : ''}`);
          if (!source) return;
          Alpine.store('xVariantHelper').reportResolvedSelect(element, source.querySelector('s-view-event[view-event-payload]'));
        },
        _dispatchUpdateVariant(html="") {
          if (this.productSelectSwap) {
            this.productSelectSwap = false;
            this._reportSwapProductSelect(html);
          }
          window.requestAnimationFrame(() => {
            setTimeout(() => { this.loadingEls = ''; }, 100);
          })
          document.dispatchEvent(new CustomEvent(`eurus:product-card-variant-select:updated:${sectionId}:${productUrl}`, {
            detail: {
              currentVariant: this.currentVariant,
              html: html
            }
          }));
        },
        _renderCardProductFormInput(formSrc, formDes) {
          const desInput = formDes.querySelectorAll('input');
          desInput?.forEach((input) => {
            if (input.name !== 'section-id' && input.name) {
              const src = formSrc.querySelector(`input[name=${CSS.escape(input.name)}]`);
              if (src) {
                input.value = src.value;
                input.checked = src.checked;
                input.disabled = src.disabled;
              }
            }
          });
        },
        _renderCardProductFormButton(formSrc, formDes) {
          const srcButton = formSrc.querySelector(`button`);
          if (srcButton) {
            const srcButtonText = srcButton.querySelector('.button-text');
            
            const desButton = formDes.querySelectorAll('button[type="submit"]');
            desButton.forEach((button) => {
              button.disabled = srcButton.disabled;
              button.ariaLabel = srcButton.ariaLabel;

              const desButtonText = button.querySelector('.button-text');
              if (srcButtonText.textContent.trim() == chooseOptionLabel) {
                srcButtonText.textContent = addToCartLabel;
              }
              if (desButtonText && srcButtonText) {
                desButtonText.innerHTML = srcButtonText.innerHTML;
              }
            });
          }
        },
        _renderCardProductForm(html) {
          let target = chooseOption ? '.choose-options' : '.card-product'

          const formSrc = html.querySelector('form[id*="product-form-"]');
          let formDesAll = element.closest(target)?.querySelectorAll('form[id*="product-form-"]');
          if (formSrc && formDesAll) { 
            formDesAll.forEach(formDes => {
              this._renderCardProductFormInput(formSrc, formDes);
              this._renderCardProductFormButton(formSrc, formDes);
            });
          }
        },
        _renderCardProductCurrentVariant(optionSrc, optionDes) {
          const currentVariantSrc = optionSrc.querySelector('.current-variant');
          const currentVariantDes = optionDes.querySelector('.current-variant');

          if (currentVariantSrc && currentVariantDes) {
            currentVariantDes.innerHTML = currentVariantSrc.innerHTML;
          }
        },
        _renderCardProductInputs(optionSrc, optionDes) {
          const inputsSrc = optionSrc.querySelectorAll('input');
          const inputsDes = optionDes.querySelectorAll('input');

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
        _renderCardProductOptions(optionSrc, optionDes) {
          const optionsSrc = optionSrc.querySelectorAll('option');
          const optionsDes = optionDes.querySelectorAll('option');

          optionsDes?.forEach(des => {
            const src = Array.from(optionsSrc).find((optionSrc) => optionSrc.dataset.optionValueId === des.dataset.optionValueId);
            if (src && des) {
              des.selected = src.selected;
              des.innerHTML = src.innerHTML;
            }
          });
        },
        _renderCardProductInputLabels(optionSrc, optionDes) {
          const labelsSrc = optionSrc.querySelectorAll('label');
          const labelsDes = optionDes.querySelectorAll('label');

          labelsDes?.forEach(des => {
            const src = Array.from(labelsSrc).find((labelSrc) => labelSrc.dataset.optionValueId === des.dataset.optionValueId);
            if (src) {
              if (des.style.getPropertyValue('--bg-image').trim() !== '') {
                des.style.setProperty('--bg-image', src.style.getPropertyValue('--bg-image'));
              }
              if (des.style.getPropertyValue('--ratio-image').trim() !== '') {
                des.style.setProperty('--ratio-image', src.style.getPropertyValue('--ratio-image'));
              }
            }
          });
        },
        _renderCardProductValueVariant(optionSrc, optionDes) {
          const scriptsSrc = optionSrc.querySelectorAll('script[type="application/json"][data-option-value-id]');
          const scriptsDes = optionDes.querySelectorAll('script[type="application/json"][data-option-value-id]');

          scriptsDes?.forEach(des => {
            const src = Array.from(scriptsSrc).find((scriptSrc) => scriptSrc.dataset.optionValueId === des.dataset.optionValueId);
            if (src && des) {
              des.textContent = src.textContent;
            }
          })
        },
        _renderCardProductOption(html) {
          const optionSrc = html.querySelector('.x-variants-data-js');
          const optionDes = element.closest('.x-variants-data-js');

          if (optionSrc && optionDes) {
            this._renderCardProductCurrentVariant(optionSrc, optionDes);
            this._renderCardProductInputs(optionSrc, optionDes);
            this._renderCardProductOptions(optionSrc, optionDes);
            this._renderCardProductInputLabels(optionSrc, optionDes);
            this._renderCardProductValueVariant(optionSrc, optionDes);
          }
        },
        _renderCardProductPrice(html) {
          let target = chooseOption ? '.choose-options' : '.card-product'

          const priceSrc = html.querySelector((chooseOption || productBundle) ? '.x-card-price .choose-option-price' : '.x-card-price .product-card-price');
          const priceDes = element.closest(target).querySelector('.x-card-price');
          if (this.currentVariant == null) {
            priceDes.classList.add('hidden');
            return;
          } else {
            priceDes.classList.remove('hidden');
          }

          const priceRange = priceDes.querySelector('.price-range');
          if (priceSrc && priceDes) {
            priceDes.innerHTML = priceSrc.innerHTML;
            if (priceRange) {
              const priceRangeDes = priceDes.querySelector('.price-range')
              if (priceRangeDes) {
                priceRangeDes.innerHTML = priceRange.innerHTML;
                return;
              }
              const priceEl = priceDes.querySelector('.price');
              if (priceEl) {
                priceEl.innerHTML += priceRange.outerHTML;
              }
            }
          }
        },
        _renderCardProductLabels(html, isByob = false) {
          const labelDataSrc = html.querySelector('.x-labels-data');
          const labelDataDes = element.closest('.card-product').querySelector('.x-labels-data');

          if (labelDataSrc && labelDataDes) {
            labelDataDes.setAttribute('x-labels-data', labelDataSrc.getAttribute('x-labels-data'));
            this.$nextTick(() => {
              Alpine.store('xBadges') && Alpine.store('xBadges').load(labelDataDes, () => {}, null, true, isByob);
            });
          }
        },
        _renderCardProductAvailabilityNotice(html) {
          const noticeSrc = html.getElementById('x-availability-notice');
          const noticeDes = element.closest('.card-product').querySelector('div[id*="x-availability-notice"]');

          if (noticeSrc && noticeDes) {
            noticeDes.innerHTML = noticeSrc.innerHTML;
          }
        },
        _renderCardProductImage(html) {
          const variantImageSrc = html.getElementById('x-variant-image').dataset.imageUrl;
          const cardProduct = element.closest('.card-product');
          if (variantImageSrc != '') {
            let media = cardProduct.querySelector(`[media="${variantImageSrc}"]`);
            if (media) {
              let index = media.getAttribute('index');
              let slide = cardProduct.querySelector('.x-splide');
              if (slide) {
                if (slide.splide) {
                  slide.splide.go(Number(index));
                } else {
                  document.addEventListener(`eurus:${sectionId}:splide-ready`, () => {
                    slide.splide.go(Number(index));
                  });
                }
                return;
              } 
            }
            const previewImg = cardProduct.getElementsByClassName("preview-img")[0];
            if (!previewImg) return;
            previewImg.removeAttribute("srcset");
            previewImg.setAttribute("src", variantImageSrc);
            let slide = cardProduct.querySelector('.x-splide');
            if (slide && slide.splide) {
              slide.splide.go(0);
            }
          } else {
            let slide = cardProduct.querySelector('.x-splide');
            if (slide && slide.splide) {
              slide.splide.go(0);
            }
          }
        },
        _renderLinkedProductInput() {
          const container = element.closest('.x-product-data-container');
          let desInput =
            container?.querySelector('input[name="properties[_linked_product_id][]"]') ||
            container?.querySelector('input[name="properties[_linked_product_id_qty][]"]');
          
          if (desInput) {
            if (this.currentVariant?.available) {
              desInput.value = this.currentVariant.id;
              desInput.disabled = false;
            } else {
              desInput.value = "";
              desInput.disabled = true;
            }
            desInput.classList.remove('customization-picker','validate-checkbox', 'required-picker');
          }
        },
        _renderCurrentOptionText(html) {
          const desSelectedValueText = element.closest('.x-product-data-container')?.querySelectorAll('.option-selected-value');
          const srcSelectedValueText = html.querySelectorAll('.option-selected-value');

          desSelectedValueText?.forEach(des => {
            const src = Array.from(srcSelectedValueText).find((srcText) => srcText.dataset.optionName == des.dataset.optionName);
            if (src && des) {
              des.classList.remove('hidden');
              des.innerHTML = src.innerHTML;
            }
          });
        },
        _renderCustomizableOptionSelectedVariant() {
          const desSelectedVariantText = element.closest('fieldset:has(.x-product-data-container)').querySelector('.selected-variant-name');
          if (desSelectedVariantText) {
            desSelectedVariantText.textContent = `: ${this.currentVariant.name}`;
          }
        },
        _renderCustomizableOptionPriceText(html) {
          const desVariantPriceText = element.closest('fieldset:has(.x-product-data-container)').querySelector(`.variant-price-${productId}`);
          const srcVariantPriceText = html.querySelector(`.variant-price-${productId}`);
          if (desVariantPriceText && srcVariantPriceText) {
            desVariantPriceText.innerHTML = `+ ${srcVariantPriceText.innerHTML}`;
          }
        },
        _getCurrentVariant(html) {
          this.currentVariant = JSON.parse(html.querySelector('.x-variants-data-js script[type="application/json"]')?.textContent);
        },
        _getCurrentVariantCbl(html) {
          this.currentVariant = JSON.parse(html.querySelector(`${chooseOption ? '#choose-options-content' : '.product-card-cbl-clone'} script[type="application/json"]`)?.textContent)
        },
        _checkOptionAndCache(optionNum, targetUrl) {
          const selectedOptionValues = this._getSelectedOptionValues();

          if (optionNum !== -1) {
            if (selectedOptionValues.length < Number(optionNum)) {
              return false;
            };
          }

          if (selectedOptionValues.length === 0) return false;

          let params = `option_values=${selectedOptionValues.join(',')}`;
          if (chooseOption || productBundle) {
            params = `option_values=${selectedOptionValues.join(',')}&page=${pageParam}`;
          }

          const link = `${targetUrl.split("?")[0]}?section_id=card-product&${params}`;

          if (this.cachedResults[link] && this.cachedResults[link] !== '') {
            return false;
          }

          return true;
        },
        updateProductCard(optionNum, target, isByob, isProductList = false) {
          let callback = () => {};

          const isCbl = target && target !== element.dataset.url;
          const targetUrl = isCbl ? target : element.dataset.url;

          const canLoad = this._checkOptionAndCache(optionNum, targetUrl);
          this.productSelectPending = isCbl ? 'swap' : 'select';

          if (isCbl) {
            callback = (html) => {
              window.requestAnimationFrame(() => {
                this._getCurrentVariantCbl(html);
                this._replaceProductCardCbl(html);
                requestAnimationFrame(() => {
                  this._dispatchUpdateVariant(html);
                });
                document.dispatchEvent(new CustomEvent("eurus:variant:change", {
                  detail: {
                    variant: this.currentVariant
                  }
                }));
              });
            }
            this._renderProductCardCbl(targetUrl, callback);
            return canLoad;
          }

          if (chooseOption) {
            callback = (html) => {
              window.requestAnimationFrame(() => {
                this._getCurrentVariant(html);
                this._renderCardProductForm(html);
                this._renderCurrentOptionText(html);
                this._renderCardProductOption(html);
                this._renderCardProductPrice(html);
                this._dispatchUpdateVariant(html);
                document.dispatchEvent(new CustomEvent("eurus:variant:change", {
                  detail: {
                    variant: this.currentVariant
                  }
                }));
              });
            }
          } else if (customizableChooseOption) {
            callback = (html) => {
              window.requestAnimationFrame(() => {
                this._getCurrentVariant(html);
                this._renderCardProductOption(html);
                this._renderLinkedProductInput();
                this._renderCurrentOptionText(html);
                this._renderCustomizableOptionSelectedVariant();
                this._renderCustomizableOptionPriceText(html);
                this._dispatchUpdateVariant(html);
                document.dispatchEvent(new CustomEvent("eurus:variant:change", {
                  detail: {
                    variant: this.currentVariant
                  }
                }));
              });
            }
          } else {
            callback = (html) => {
              window.requestAnimationFrame(() => {
                this._getCurrentVariant(html);
                this._renderCardProductForm(html);
                this._renderCardProductOption(html);
                this._renderCardProductPrice(html);
                this._renderCardProductLabels(html, isByob);
                this._renderCurrentOptionText(html);
                this._renderCardProductAvailabilityNotice(html);
                this._renderCardProductImage(html);
                this._dispatchUpdateVariant(html);
                document.dispatchEvent(new CustomEvent("eurus:variant:change", {
                  detail: {
                    variant: this.currentVariant
                  }
                }));
                
                if (isByob || isProductList) {
                  document.dispatchEvent(new CustomEvent('eurus:product-card-update', {
                    detail: {
                      sectionId: handleSectionId
                    }
                  }));
                }
              });
            }
          }

          this._renderProductCard(targetUrl, optionNum, callback);
          return canLoad;
        },
        _reloadCardProduct() {
          let link = "";
          const selectedOptionValues = this._getSelectedOptionValues()
          let params = `option_values=${selectedOptionValues.join(',')}`;
          if (chooseOption || productBundle) {
            params = `option_values=${selectedOptionValues.join(',')}&page=${pageParam}`;
          }
          link = `${productUrl.split("?")[0]}?section_id=card-product&${params}`;
          if (this.cachedResults[link] && this.cachedResults[link] !== '') {
            this.cachedResults[link] = '';
          }

          if (chooseOption) {
            callback = (html) => {
              window.requestAnimationFrame(() => {
                this._getCurrentVariant(html);
                this._renderCardProductForm(html);
                this._renderCurrentOptionText(html);
                this._renderCardProductOption(html);
                this._renderCardProductPrice(html);
                this._dispatchUpdateVariant(html);
              });
            }
          } else if (customizableChooseOption) {
            callback = (html) => {
              window.requestAnimationFrame(() => {
                this._getCurrentVariant(html);
                this._renderCardProductOption(html);
                this._renderLinkedProductInput();
                this._renderCurrentOptionText(html);
                this._renderCustomizableOptionSelectedVariant();
                this._renderCustomizableOptionPriceText(html);
                this._dispatchUpdateVariant(html);
              });
            }
          } else {
            callback = (html) => {
              window.requestAnimationFrame(() => {
                this._getCurrentVariant(html);
                this._renderCardProductForm(html);
                this._renderCardProductOption(html);
                this._renderCardProductPrice(html);
                this._renderCardProductLabels(html);
                this._renderCardProductAvailabilityNotice(html);
                this._renderCardProductImage(html);
                this._dispatchUpdateVariant(html);
              });
            }
          }

          this._renderProductCard(productUrl, -1, callback);
        },
        _renderProductCard(url, optionNum, callback) {
          let link = "";
          const selectedOptionValues = this._getSelectedOptionValues();
          if (optionNum !== -1) {
            if (selectedOptionValues.length < Number(optionNum)) {
              this.productSelectPending = null;
              window.requestAnimationFrame(() => {
                setTimeout(() => { this.loadingEls = ''; }, 100);
              });

              return
            };
          }
          if (selectedOptionValues.length === 0) {
            this.productSelectPending = null;
            return;
          }
          let params = `option_values=${selectedOptionValues.join(',')}`;
          if (chooseOption || productBundle) {
            params = `option_values=${selectedOptionValues.join(',')}&page=${pageParam}`;
          }
          link = `${url.split("?")[0]}?section_id=card-product&${params}`;
          Alpine.store('xHelper').cancelRequest(`eurus:product_card_request:${productId}`);
          const productSelect = this.productSelectPending === 'select' ? this._beginProductSelect() : null;
          this.productSelectPending = null;
          const render = (html) => {
            try {
              callback(html);
            } finally {
              this._settleProductSelectFrom(html, productSelect);
            }
          };
          if (this.cachedResults[link] && this.cachedResults[link] !== '') {
            const html = this.cachedResults[link];
            window.requestAnimationFrame(() => {
              render(html);
            });
          } else {
            const controller = new AbortController();
            Alpine.store('xHelper').requestControllers.set(`eurus:product_card_request:${productId}`, controller);
            fetch(link, { signal: controller.signal })
              .then((response) => response.text())
              .then((responseText) => {
                const html = new DOMParser().parseFromString(responseText, 'text/html');
                window.requestAnimationFrame(() => {
                  render(html);
                });
                this.cachedResults[link] = html;
              }).catch(err => {
                this._failProductSelect(err, productSelect);
                if (err.name !== 'AbortError') {
                  console.error(err);
                }
                window.requestAnimationFrame(() => {
                  setTimeout(() => { this.loadingEls = ''; }, 100);
                })
              })
          }
        },
        _renderProductCardCbl(url, callback) {
          let link = `${url}?section_id=${handleSectionId}&page=${pageParam}`;
          this.productSelectSwap = this.productSelectPending === 'swap';
          this.productSelectPending = null;

          Alpine.store('xHelper').cancelRequest(`eurus:product_card_request:${productId}`);
          if (this.cachedResults[link] && this.cachedResults[link] !== '') {
            const html = this.cachedResults[link];
            window.requestAnimationFrame(() => {
              callback(html);
            });
          } else {
            const controller = new AbortController();
            Alpine.store('xHelper').requestControllers.set(`eurus:product_card_request:${productId}`, controller);
            fetch(link, { signal: controller.signal })
              .then((response) => response.text())
              .then((responseText) => {
                const html = new DOMParser().parseFromString(responseText, 'text/html');
                window.requestAnimationFrame(() => {
                  callback(html);
                });
                this.cachedResults[link] = html;
              }).catch(err => {
                this._failProductSelect(err);
                if (err.name !== 'AbortError') {
                  console.error(err);
                }
              })
          }
        },
        _replaceProductCardCbl(html) {
          let src, des;
          if (chooseOption) {
            src = html.querySelector('#choose-options-content .choose-options');
            des = element.closest(`.choose-options`);
          } else {
            src = html.getElementById(`card-product-clone-${handleSectionId}${blockId ? `-${blockId}` : ''}`);
            des = element.closest('.card-product');
          }

          if (src && des) {
            des.innerHTML = src.innerHTML;
          }
        },
        _getSelectedOptionValues() {
          return Array.from(element.querySelectorAll('select option[selected][value], fieldset input:checked')).map(
            (e) => e.dataset.optionValueId
          );
        }
      }))
    });
  });
}