if (!window.Eurus.loadedScript.has('fast-order.js')) {
  window.Eurus.loadedScript.add('fast-order.js');

  requestAnimationFrame(() => {
    document.addEventListener("alpine:init", () => {
      Alpine.data('xFastOrder', (lowStockThreshold, csvErrorMessages, csvRowErrorLabels, cartItems, moneyFormat, csvButtonLabel, csvUploadLabel, csvSuccessLabel) => ({
        importing: false,
        validating: false,
        searching: false,
        cachedResults: {},
        searchDebounceTimer: null,
        lowStockThreshold,
        query: '',
        suggestions: [],
        showSuggestions: false,
        rows: [],
        collapsedGroups: {},
        csvSummary: null,
        csvError: null,
        csvErrors: [],
        selectedFile: null,
        csvParsedData: null,
        csvErrorsOpen: false,
        csvMerged: [],
        csvMergedOpen: false,
        skuChoicesOpen: false,
        csvRowCount: 0,
        skuChoices: [],
        lastImportSnapshot: null,
        cartQuantities: cartItems.reduce((quantities, item) => {
          quantities[item.variant_id] = (quantities[item.variant_id] || 0) + item.quantity;
          return quantities;
        }, {}),

        init() {
          document.addEventListener('eurus:product:added', (event) => {
            const addedVariantIds = new Set((event.detail.product || []).map((item) => item.variant_id));
            this.rows = this.rows.filter((row) => !addedVariantIds.has(row.variant.id));
            this._syncCsvReview();
          });
        },

        onSearchInput() {
          this.showSuggestions = true;
          this.searching = true;

          clearTimeout(this.searchDebounceTimer);
          this.searchDebounceTimer = setTimeout(() => {
            this._searchProducts(this.query)
              .then((matches) => {
                this.suggestions = matches;
              })
              .catch((error) => console.error(error))
              .finally(() => {
                this.searching = false;
              });
          }, 300);
        },

        _searchProducts(query) {
          const term = query?.trim();
          if (!term) return Promise.resolve([]);

          const searchUrl = `${Shopify.routes.root}search/suggest?q=${encodeURIComponent(term)}&resources[type]=product&resources[limit]=10&resources[options][fields]=title,variants.sku,variants.title&section_id=fast-order-product`;

          if (this.cachedResults[searchUrl]) {
            return Promise.resolve(this.cachedResults[searchUrl]);
          }

          return fetch(searchUrl)
            .then((response) => {
              if (!response.ok) throw new Error(response.status);
              return response.text();
            })
            .then((html) => {
              const products = this._parseProductSection(html);

              const matches = products.map((product) => ({
                ...product,
                selected_variant: this._variantForSku(product, null)
              }));

              this.cachedResults[searchUrl] = matches;
              return matches;
            });
        },

        closeSuggestions() {
          this.query = '';
          this.suggestions = [];
          this.showSuggestions = false;
        },

        _variantForSku(product, sku) {
          if (product.selected_variant) return product.selected_variant;

          const variants = product.variants || [];
          const matched = sku ? variants.find((variant) => variant.sku === sku) : null;

          return matched || (product.has_only_default_variant ? variants[0] : null) || null;
        },

        addVariant(product, variant) {
          if (variant.available === false) return Infinity;
          this._addRow(product, variant, variant.quantity_rule?.min || 1);
          return this._remainingFor(variant);
        },

        addGroup(product) {
          (product.variants || []).forEach((variant) => {
            if (variant.available === false) return;
            if (this._remainingFor(variant) <= 0) return;
            this.addVariant(product, variant);
          });
        },

        _remainingFor(variant) {
          const { max } = this._qtyRule(variant);
          return max != null ? max - this.rowQuantityFor(variant.id) : Infinity;
        },

        rowQuantityFor(variantId) {
          const row = this.rows.find((r) => r.variant.id === variantId);
          return row ? row.quantity : 0;
        },

        get searchedGroups() {
          const byProduct = new Map();

          this.rows.forEach((row) => {
            if (row.source === 'csv') return;
            if (!byProduct.has(row.product.id)) {
              byProduct.set(row.product.id, { product: row.product, items: [] });
            }
            byProduct.get(row.product.id).items.push(row);
          });

          return Array.from(byProduct.values());
        },

        isSingleVariantGroup(group) {
          return group.product.has_only_default_variant === true || group.product.variants_count === 1;
        },

        get importedRows() {
          return this.rows
            .filter((row) => row.source === 'csv')
            .sort((a, b) => this._csvLineOf(a) - this._csvLineOf(b));
        },

        get importedCount() {
          return this.rows.reduce((count, row) => count + (row.source === 'csv' ? 1 : 0), 0);
        },

        _csvLineOf(row) {
          const lines = (row.product.csvMeta?.rows || []).map((csvRow) => csvRow.line);
          return lines.length ? Math.min(...lines) : Infinity;
        },

        _addRow(product, variant, quantity = 1, source = 'search') {
          const { max } = this._qtyRule(variant);
          const clamp = (value) => (max != null ? Math.min(value, max) : value);

          const existing = this.rows.find((row) => row.variant.id === variant.id);
          if (existing) {
            existing.quantity = clamp(existing.quantity + quantity);
            this.evaluateRow(existing);
            return;
          }

          const row = { product, variant, quantity: clamp(quantity), source };
          this.evaluateRow(row);
          this.rows.push(row);
          this._reportProductView(product);
        },

        _reportProductView(product) {
          if (!product || !product.id || !window.StandardEventsReady) return;
          this._reportedProductViews = this._reportedProductViews || new Set();
          if (this._reportedProductViews.has(product.id)) return;
          this._reportedProductViews.add(product.id);

          window.StandardEventsReady.then((library) => {
            if (!library || !library.ProductViewEvent) return;
            try {
              const target = (this.$el && this.$el.isConnected) ? this.$el : document;
              target.dispatchEvent(new library.ProductViewEvent({
                product: {
                  id: product.id,
                  title: product.title,
                  handle: product.handle,
                  selectedVariant: null
                },
                context: 'search',
                selectedOptions: []
              }));
            } catch (error) {
              console.warn('[Eurus] Could not dispatch shopify:product:view for a fast order row.', error);
            }
          });
        },

        removeRow(variantId) {
          this.rows = this.rows.filter((row) => row.variant.id !== variantId);
          this._refreshRemaining(variantId);
          this._syncCsvReview();
        },

        _refreshRemaining(variantId) {
          this.suggestions.forEach((product) => {
            const variants = [product.selected_variant, ...(product.variants || [])];

            variants.forEach((variant) => {
              if (!variant || variant.id !== variantId) return;
              variant.remaining = this._remainingFor(variant);
            });
          });
        },

        formatMoney(amount) {
          return this.$store.xHelper.formatMoney(amount, moneyFormat);
        },

        getSubtotal() {
          const total = this.rows.reduce((sum, row) => (row.valid ? sum + this.rowTotal(row) : sum), 0);
          return this.formatMoney(total);
        },

        effectiveQuantity(row) {
          return row.quantity + (this.cartQuantities[row.variant.id] || 0);
        },

        isTierActive(row, index) {
          const breaks = row.variant.quantity_price_breaks || [];
          const tier = breaks[index];
          const quantity = this.effectiveQuantity(row);
          if (!tier || quantity < tier.minimum_quantity) return false;
          const nextTier = breaks[index + 1];
          return !nextTier || quantity < nextTier.minimum_quantity;
        },

        rowTotal(row) {
          const quantity = this.effectiveQuantity(row);
          let unitPrice = row.variant.price;

          (row.variant.quantity_price_breaks || []).forEach((tier) => {
            if (quantity >= tier.minimum_quantity) unitPrice = tier.price;
          });

          return unitPrice * row.quantity;
        },

        isLowStock(variant) {
          if (variant.available === false) return false;
          if (variant.inventory_management !== 'shopify') return false;
          if (!(variant.inventory_quantity > 0)) return false;
          return variant.inventory_quantity <= this.lowStockThreshold;
        },

        _qtyRule(variant) {
          const rule = variant.quantity_rule || {};
          let max = rule.max != null ? rule.max : null;

          if (variant.inventory_management === 'shopify' && variant.inventory_policy === 'deny') {
            const remaining = variant.inventory_quantity ?? 0;
            max = max != null ? Math.min(max, remaining) : remaining;
          }

          return {
            min: rule.min > 1 ? rule.min : 1,
            max,
            step: rule.increment > 1 ? rule.increment : 1
          };
        },

        evaluateRow(row) {
          const rule = this._qtyRule(row.variant);
          row.rule = rule;

          if (row.quantity === '' || row.quantity == null || Number.isNaN(row.quantity)) {
            row.quantity = rule.min;
            return;
          }

          if (row.quantity <= 0) {
            row.error = null;
          } else if (row.quantity < rule.min) {
            row.error = 'MIN';
          } else if (rule.max != null && row.quantity > rule.max) {
            row.error = 'MAX';
          } else if ((row.quantity - rule.min) % rule.step !== 0) {
            row.error = 'MULTIPLE';
          } else {
            row.error = null;
          }

          row.valid = row.variant.available !== false && row.quantity > 0 && !row.error;
          this._syncCsvReview();
        },

        _syncCsvReview() {
          if (!this.csvSummary) return;

          const qtyRuleErrors = this.rows.filter((row) => row.source === 'csv' && row.error).length;
          const needsReview = this.csvErrors.length + qtyRuleErrors;

          this.csvSummary.needsReview = needsReview;

          if (!this.csvErrors.length) {
            this.csvErrors = [];
            this.csvErrorsOpen = false;
          }

          if (!this.skuChoices.length) {
            this.skuChoices = [];
            this.skuChoicesOpen = false;
          }
        },

        decrementRow(row) {
          if (row.quantity <= 0) return;

          const { min, max, step } = row.rule;

          if (row.error === 'MIN') return;

          if (row.error === 'MAX') {
            row.quantity = max;
            this.evaluateRow(row);
            return;
          }

          if (row.error === 'MULTIPLE') {
            row.quantity = min + step * Math.floor((row.quantity - min) / step);
            this.evaluateRow(row);
            return;
          }

          const next = row.quantity - step;
          row.quantity = next < min ? min : next;
          this.evaluateRow(row);
        },

        incrementRow(row) {
          const { min, max, step } = row.rule;

          if (row.error === 'MAX') return;

          if (row.error === 'MIN') {
            row.quantity = min;
            this.evaluateRow(row);
            return;
          }

          if (row.error === 'MULTIPLE') {
            row.quantity = min + step * Math.ceil((row.quantity - min) / step);
            this.evaluateRow(row);
            return;
          }

          const next = row.quantity <= 0 ? min : row.quantity + step;
          if (max != null && next > max) return;
          row.quantity = next;
          this.evaluateRow(row);
        },

        get csvErrorText() {
          if (!this.csvError) return '';
          return csvErrorMessages[this.csvError] || csvErrorMessages.UNKNOWN;
        },

        generateExample() {
          const rows = [
            ['SKU', 'Quantity'],
            ['TSH-M-BLK-COT-001', 1]
          ];
          const csvContent = rows.map((row) => row.join(',')).join('\n');
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = 'example.csv';
          link.click();
          URL.revokeObjectURL(url);
        },

        _resetCsvReport() {
          this.csvSummary = null;
          this.csvError = null;
          this.csvParsedData = null;
          this.csvErrors = [];
          this.csvErrorsOpen = false;
          this.csvMerged = [];
          this.csvMergedOpen = false;
          this.skuChoicesOpen = false;
          this.csvRowCount = 0;
          this.skuChoices = [];
        },

        get importButtonLabel() {
          return this.csvParsedData ? csvButtonLabel : csvUploadLabel;
        },

        get csvParseSuccessText() {
          return csvSuccessLabel.replace('%%FILE%%', this.selectedFile?.name || '');
        },

        selectCsvFile(file) {
          if (!file) return;
          this.selectedFile = file;
          this._resetCsvReport();
          this.validating = true;

          return this._parseCSV(file)
            .then((data) => {
              this.csvParsedData = data;
            })
            .catch((error) => {
              this.selectedFile = null;
              this.csvParsedData = null;
              this.csvError = error?.code || 'UNKNOWN';
            })
            .finally(() => {
              this.validating = false;
            });
        },

        clearCsvFile() {
          this.selectedFile = null;
          this._resetCsvReport();
        },

        onCsvButtonClick() {
          if (this.importing || this.validating) return;
          if (!this.csvParsedData) {
            this.$refs.csvInput.click();
            return;
          }
          return this.importCSV(this.selectedFile).finally(() => {
            this.selectedFile = null;
          });
        },

        importCSV(file) {
          const parsedData = this.csvParsedData;
          this.importing = true;
          this._resetCsvReport();
          this.lastImportSnapshot = JSON.parse(JSON.stringify(this.rows));
          const streamedVariantIds = new Set();
          const pending = [];
          let skeletonsReplaced = false;

          const addBatch = (batch) => {
            streamedVariantIds.add(batch.variant.id);
            this._addRow(batch, batch.variant, batch.qty ?? 1, 'csv');
          };

          const flushPending = () => {
            pending.forEach(addBatch);
            pending.length = 0;
          };

          return this._processCSV(file, parsedData, (batch) => {
            if (!batch.variant) return;

            if (skeletonsReplaced) {
              addBatch(batch);
              return;
            }

            pending.push(batch);
            if (pending.length >= this.reservedRowCount) {
              flushPending();
              skeletonsReplaced = true;
            }
          }).then((result) => {
            flushPending();

            const resolvedVariantIds = new Set(result.products.map((product) => product.variant.id));
            this.rows = this.rows.filter(
              (row) => !streamedVariantIds.has(row.variant.id) || resolvedVariantIds.has(row.variant.id)
            );

            const qtyRuleErrors = this.rows.filter(
              (row) => resolvedVariantIds.has(row.variant.id) && row.error
            ).length;

            const rowErrors = result.data.flatMap((entry) =>
              entry.errors.map((error) => ({
                type: error.type,
                line: error.line,
                sortLine: error.line,
                sku: entry.sku,
                qty: error.qty
              }))
            );

            const fetchErrors = (result.searchDuplications || []).flatMap((duplication) =>
              (duplication.rows.length ? duplication.rows : [{ line: null, qty: null }]).map((row) => ({
                type: duplication.type,
                line: row.line,
                sortLine: row.line,
                sku: duplication.sku,
                qty: row.qty
              }))
            );

            this.csvErrors = [...rowErrors, ...fetchErrors];

            this.csvMerged = result.data
              .filter((entry) => entry.merged)
              .map((entry) => ({
                sku: entry.sku,
                lines: entry.rows.map((row) => row.line).join(', ')
              }));

            this.csvSummary = {
              added: result.products.length,
              merged: this.csvMerged.length,
              needsReview: this.csvErrors.length + qtyRuleErrors
            };

            this.skuChoices = (result.searchDuplications || [])
              .filter((duplication) => duplication.type === 'DUPLICATE_SKU_ACROSS_PRODUCTS')
              .map((duplication) => ({ sku: duplication.sku, products: duplication.products || [] }))
              .filter((choice) => choice.products.length);

            this._syncCsvReview();

            return result;
          }).catch((error) => {
            this.csvError = error?.code || 'UNKNOWN';
          }).finally(() => {
            this.importing = false;
          });
        },

        undoImport() {
          if (!this.lastImportSnapshot) return;
          this.rows = this.lastImportSnapshot;
          this.lastImportSnapshot = null;
          this._resetCsvReport();
        },

        chooseSkuVariant(sku, product) {
          const variant = this._variantForSku(product, sku);
          if (!variant || variant.available === false) return;
          this.addVariant(product, variant);
          this.skuChoices = this.skuChoices.filter((choice) => choice.sku !== sku);

          this.csvErrors = this.csvErrors.filter(
            (error) => !(error.type === 'DUPLICATE_SKU_ACROSS_PRODUCTS' && error.sku === sku)
          );

          this._syncCsvReview();
        },

        get reservedRowCount() {
          return this.csvRowCount <= 5 ? this.csvRowCount : (this.csvRowCount <= 10 ? 5 : 10);
        },

        get skeletonRowCount() {
          if (!this.importing) return 0;
          return Math.max(0, this.reservedRowCount - this.importedCount);
        },

        get sortedCsvErrors() {
          return [...this.csvErrors]
            .sort((a, b) => (a.sortLine ?? Infinity) - (b.sortLine ?? Infinity))
            .map((error) => ({ ...error, label: csvRowErrorLabels[error.type] || error.type }));
        },

        _processCSV(file, parsedData, onBatch) {
          const parsing = parsedData ? Promise.resolve(parsedData) : this._parseCSV(file);

          return parsing.then((data) => {
            this.csvRowCount = data.length;
            const { data: validated, hasError } = this._validateData(data);

            if (hasError) {
              return { data: validated, products: [] };
            }

            return this._fetchProductsBySku(validated, onBatch).then(({ products, searchDuplications }) => ({
              data: validated,
              products,
              searchDuplications
            }));
          });
        },

        _isCsvFile(file) {
          const name = file?.name || '';
          const type = file?.type || '';
          const csvTypes = ['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel', ''];
          return /\.csv$/i.test(name) && csvTypes.includes(type);
        },

        _parseCSV(file) {
          if (!this._isCsvFile(file)) return Promise.reject({ code: 'INVALID_FILE_TYPE' });

          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject({ code: 'READ_ERROR' });
            reader.onload = () => {
              const lines = reader.result
                .split(/\r\n|\n|\r/)
                .filter((line) => line.split(',').some((col) => col.trim() !== ''));

              if (!lines.length) {
                reject({ code: 'EMPTY_FILE' });
                return;
              }

              if (lines.length - 1 > 150) {
                reject({ code: 'TOO_MANY_LINES' });
                return;
              }

              const header = lines[0].split(',').map((col) => col.trim().toLowerCase());
              while (header.length > 2 && header[header.length - 1] === '') header.pop();

              if (header.length !== 2 || header[0] !== 'sku' || header[1] !== 'quantity') {
                reject({ code: 'INVALID_HEADER' });
                return;
              }

              if (lines.length < 2) {
                reject({ code: 'EMPTY_FILE' });
                return;
              }

              const data = lines.slice(1).map((line, index) => {
                const cols = line.split(',').map((col) => col.trim());
                while (cols.length > 2 && cols[cols.length - 1] === '') cols.pop();

                return {
                  sku: cols[0] || '',
                  qty: cols[1] || '',
                  extraColumns: cols.length > 2,
                  line: index + 2
                };
              });

              resolve(data);
            };
            reader.readAsText(file);
          });
        },

        _classifyRowError(sku, raw, extraColumns) {
          if (extraColumns) return { value: NaN, type: 'TOO_MANY_COLUMNS' };
          if (sku === '') return { value: NaN, type: 'MISSING_SKU' };
          if (raw === '') return { value: NaN, type: 'MISSING_QUANTITY' };
          if (/^-?\d+\.\d+$/.test(raw)) return { value: NaN, type: 'DECIMAL_QUANTITY' };
          if (!/^-?\d+$/.test(raw)) return { value: NaN, type: 'NON_NUMERIC_QUANTITY' };

          const num = Number(raw);
          if (num < 0) return { value: NaN, type: 'NEGATIVE_QUANTITY' };
          if (num === 0) return { value: NaN, type: 'ZERO_QUANTITY' };
          if (num > 2147483647) return { value: NaN, type: 'QUANTITY_OVERFLOW' };

          return { value: num, type: null };
        },

        _validateData(data) {
          const merged = new Map();

          data.forEach(({ sku, qty, line, extraColumns }) => {
            const { value, type } = this._classifyRowError(sku, qty, extraColumns);
            const error = type ? { line, qty, type } : null;
            const key = sku === '' ? `__blank_${line}` : sku;

            if (merged.has(key)) {
              const entry = merged.get(key);
              entry.qty += value;
              entry.merged = true;
              entry.rows.push({ line, qty });
              if (error) entry.errors.push(error);
            } else {
              merged.set(key, {
                sku,
                qty: value,
                merged: false,
                rows: [{ line, qty }],
                errors: error ? [error] : []
              });
            }
          });

          const result = Array.from(merged.values());
          const hasError = result.some((entry) => entry.errors.length > 0);

          return { data: result, hasError };
        },

        _fetchProductsBySku(skuEntries, onBatch) {
          const validSkus = [
            ...new Set(
              skuEntries
                .filter((entry) => entry.errors.length === 0)
                .map((entry) => entry.sku)
            ),
          ];

          if (validSkus.length === 0) return Promise.resolve({ products: [], searchDuplications: [] });

          const products = new Map();
          const excludedProductIds = new Set();
          const searchDuplications = [];
          let nextIndex = 0;

          const runNext = () => {
            if (nextIndex >= validSkus.length) return Promise.resolve();

            const sku = validSkus[nextIndex++];

            return this._fetchProductBySku(sku).then((results) => {
              const skuEntry = skuEntries.find((entry) => entry.sku === sku);

              if (results.length !== 1) {
                const isDuplicate = results.length > 1;
                if (isDuplicate) results.forEach((product) => excludedProductIds.add(product.id));

                const error = {
                  sku,
                  type: isDuplicate ? 'DUPLICATE_SKU_ACROSS_PRODUCTS' : 'SKU_NOT_FOUND',
                  rows: skuEntry?.rows || [],
                  ...(isDuplicate ? { products: results } : {})
                };
                searchDuplications.push(error);
                onBatch?.({ sku, error });
              } else {
                const [product] = results;
                const variant = this._variantForSku(product, sku);

                if (!variant) {
                  // Product matched the search but no variant carries this SKU - report it
                  // instead of dropping the row silently.
                  const error = { sku, type: 'SKU_NOT_FOUND', rows: skuEntry?.rows || [] };
                  searchDuplications.push(error);
                  onBatch?.({ sku, error });
                } else if (!excludedProductIds.has(product.id)) {
                  const { variants, selected_variant, ...productInfo } = product;
                  const entry = { ...productInfo, variant };
                  products.set(variant.id, entry);

                  onBatch?.({
                    ...entry,
                    qty: skuEntry?.qty,
                    csvMeta: {
                      rows: skuEntry?.rows?.map((row) => ({ line: row.line, qty: row.qty })) || []
                    }
                  });
                }
              }

              return runNext();
            });
          };

          return Promise.all(
            Array.from({ length: Math.min(6, validSkus.length) }, runNext)
          ).then(() => {
            excludedProductIds.forEach((productId) => {
              products.forEach((entry, variantId) => {
                if (entry.id === productId) products.delete(variantId);
              });
            });

            return { products: Array.from(products.values()), searchDuplications };
          });
        },

        _fetchProductBySku(sku, attempt = 0) {
          const searchUrl = `${Shopify.routes.root}search/suggest?q=${encodeURIComponent(`"${sku}"`)}&resources[type]=product&resources[limit]=10&resources[options][fields]=variants.sku&section_id=fast-order-product`;

          if (this.cachedResults[searchUrl]) {
            return Promise.resolve(this.cachedResults[searchUrl]);
          }

          return fetch(searchUrl).then((response) => {
            if (response.status === 429 && attempt < 3) {
              const retryAfter = Number(response.headers.get('Retry-After')) || 1;
              return new Promise((resolve) => setTimeout(resolve, retryAfter * 1000)).then(() =>
                this._fetchProductBySku(sku, attempt + 1)
              );
            }

            if (!response.ok) throw new Error(response.status);

            return response.text().then((html) => {
              const products = this._parseProductSection(html);
              this.cachedResults[searchUrl] = products;
              return products;
            });
          });
        },

        _parseProductSection(html) {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const section = doc.getElementById('shopify-section-fast-order-product');
          if (!section) return [];

          const products = [];
          let current = null;
          let variantIndex = 0;
          let currentTarget = null;

          Array.from(section.children).forEach((el) => {
            if (el.matches('script.product')) {
              current = { ...JSON.parse(el.textContent), selected_variant: null };
              products.push(current);
              variantIndex = 0;
              currentTarget = null;
              return;
            }

            if (!current) return;

            if (el.matches('script.selected-variant')) {
              current.selected_variant = JSON.parse(el.textContent);
              return;
            }

            if (el.matches('span.has-only-default-variant')) {
              current.has_only_default_variant = el.textContent.trim() === 'true';
              return;
            }

            if (el.matches('span.variants_count')) {
              current.variants_count = Number(el.textContent.trim());
              return;
            }

            if (el.matches('div.inventory-data')) {
              currentTarget = current.selected_variant || current.variants[variantIndex++];
              if (currentTarget) {
                Object.assign(currentTarget, {
                  inventory_management: el.querySelector('.inventory-management')?.textContent.trim() || null,
                  inventory_policy: el.querySelector('.inventory-policy')?.textContent.trim() || null,
                  inventory_quantity: Number(el.querySelector('.inventory-quantity')?.textContent.trim() || 0)
                });
              }
              return;
            }

            if (el.matches('div.image-data')) {
              const target = currentTarget || current;
              const markup = el.innerHTML.trim();
              if (target && markup) target.imageHtml = markup;
              return;
            }

            if (el.matches('div.quantity-price-data')) {
              if (!currentTarget) return;
              const minimums = Array.from(el.querySelectorAll('.minimum_quantity')).map((node) => Number(node.textContent.trim()));
              const prices = Array.from(el.querySelectorAll('.price')).map((node) => Number(node.textContent.trim()));
              currentTarget.quantity_price_breaks = minimums.map((minimum_quantity, i) => ({ minimum_quantity, price: prices[i] }));
            }
          });

          return products;
        }
      }));
    });
  });
}
