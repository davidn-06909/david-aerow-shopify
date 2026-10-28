if (!window.Eurus.loadedScript.has("quiz.js")) {
  window.Eurus.loadedScript.add("quiz.js");

  requestAnimationFrame(() => {
    document.addEventListener("alpine:init", () => {
      Alpine.data("xQuiz", (sectionId, maxProduct, defaultProductIds) => ({
        loading: false,
        cachedResults: [],
        hasProducts: true,
        totalQuestions: 0,
        curIndex: 0,
        questionIds: [],
        questionTypes: [],
        questionSkipIds: [],
        traversed: [],
        currentQuestionId: null,
        answers: new Map(),
        skips: new Map(),
        selectedOptions: new Map(),
        initHeight: 0,
        productNumQuiz: 0,
        hasVariant: false,
        emailValue: "",
        emailSubmitting: false,
        emailSkipping: false,
        emailBlockId: null,
        showSuccessMessage: false,
        successMessage: "",
        init() {
          const startButton = this.$el.querySelector(
            `.button-quiz-${sectionId} button`
          );
          this.totalQuestions = this.$el.querySelectorAll(".quiz-question").length;
          this.$nextTick(() => {
            const questions = this._arrangeBlocks();
            this.totalQuestions = questions.length;
            this.questionIds = questions.map((q) => q.dataset.blockId);
            this.questionTypes = questions.map((q) => q.dataset.questionType);
            this.questionSkipIds = questions.map((q) => q.dataset.questionId);
            startButton.disabled = false;
            this._restoreCachedAnswers();

            const ro = new ResizeObserver((entries) => {
              requestAnimationFrame(() => {
                this.initHeight = entries[0].borderBoxSize?.[0]?.blockSize ?? this.$el.offsetHeight;
                ro.disconnect();
              });
            });
            ro.observe(this.$el);
          });
        },

        _arrangeBlocks() {
          const blocks = Array.from(this.$el.querySelectorAll(".quiz-question"));
          let emailBlock = null;

          blocks.forEach((block) => {
            if (block.dataset.blockType !== "email-form") return;
            if (emailBlock) {
              block.remove();
              return;
            }
            emailBlock = block;
          });

          const questions = blocks.filter((block) => block !== emailBlock && block.isConnected);

          if (emailBlock) {
            const lastQuestion = questions[questions.length - 1];
            if (!lastQuestion) {
              emailBlock.remove();
              return questions;
            }
            if (lastQuestion.nextElementSibling !== emailBlock) {
              lastQuestion.after(emailBlock);
            }
            questions.push(emailBlock);
            this.emailBlockId = emailBlock.dataset.blockId;
            this.successMessage = emailBlock.dataset.successMessage ?? "";
          }

          return questions;
        },

        start() {
          const container = this.$el.closest('.section-quiz');

          const clipFrom = `inset(0 0 calc(100% - ${this.initHeight}px) 0)`;
            
          const firstId = this._getNextQuestionId(null);
          if (firstId) {
            this.currentQuestionId = firstId;
            this.curIndex = 1;
            this._scrollToTop();
          } else {
            this._fetchRecommendedProduct();
          }

          container.animate(
            [{ clipPath: clipFrom }, { clipPath: 'inset(0 0 0 0)' }],
            { duration: 500, easing: 'ease-in-out' }
          );
        },

        next() {
          const nextId = this._getNextQuestionId(this.currentQuestionId);
          if (nextId) {
            this.traversed.push(this.currentQuestionId);
            this.currentQuestionId = nextId;
            this.curIndex += 1;
            this._scrollToTop();
          } else {
            this._fetchRecommendedProduct();
          }
        },

        prev() {
          if (this.traversed.length === 0) return;
          this.emailSkipping = false;
          this.currentQuestionId = this.traversed.pop();
          this.curIndex -= 1;
          this._scrollToTop();
        },

        reset(animDir) {
          const container = this.$el.closest('.section-quiz');

          const clipTo = `inset(0 0 calc(100% - ${this.initHeight}px) 0)`;

          const anim = container.animate(
            [{ clipPath: 'inset(0 0 0 0)' }, { clipPath: clipTo }],
            { duration: 500, easing: 'ease-in-out' }
          );

          const variantContainer = document.getElementById(`variant-container-${sectionId}`);

          anim.onfinish = () => {
            this.curIndex = 0;
            this.hasProducts = true;
            this.traversed = [];
            this.currentQuestionId = null;
            this.answers = new Map();
            this.skips = new Map();
            this.selectedOptions = new Map();
            container.style.height = '';
            this.hasVariant = false;
            this.productNumQuiz = 0;
            this.emailValue = '';
            this.emailSubmitting = false;
            this.emailSkipping = false;
            this.showSuccessMessage = false;
            if (variantContainer) variantContainer.innerHTML = '';
            anim.cancel();
            this._scrollToTop();
          };
        },

        _showAnswer() {
          this.curIndex = this.totalQuestions + 1;
          this.currentQuestionId = null;
          this._scrollToTop();
        },

        isLastQuestion() {
          return (
            this.currentQuestionId !== null &&
            this._getNextQuestionId(this.currentQuestionId) === null
          );
        },

        _getNextQuestionId(fromBlockId) {
          const skipped = this._getSkippedIds();
          const pos = fromBlockId ? this.questionIds.indexOf(fromBlockId) : -1;
          for (let i = pos + 1; i < this.questionIds.length; i++) {
            if (!skipped.has(this.questionSkipIds[i]))
              return this.questionIds[i];
          }
          return null;
        },

        _getSkippedIds() {
          const skipped = new Set();
          for (const skipMap of this.skips.values()) {
            for (const skipArr of skipMap.values()) {
              for (const id of skipArr) skipped.add(id);
            }
          }
          return skipped;
        },

        _getPaginationWidth() {
          if (this.curIndex === 0) return 0;
          if (!this.currentQuestionId) return 100;
          const skipped = this._getSkippedIds();
          const pos = this.questionIds.indexOf(this.currentQuestionId);
          const remaining = this.questionSkipIds
            .slice(pos + 1)
            .filter((skipId) => !skipped.has(skipId)).length;
          const effectiveTotal = this.traversed.length + 1 + remaining;
          return effectiveTotal > 0
            ? ((this.traversed.length + 1) / (effectiveTotal + 1)) * 100
            : 0;
        },

        _scrollToTop() {
          setTimeout(() => {
            const target = document.getElementById(`shopify-section-${sectionId}`);
            if (!target) return;
            Alpine.store("xHeaderMenu")?.suppressScroll?.();
            target.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 500);
        },

        selectAnswer(questionId, value, skipQuestionsStr, optionBlockId) {
          const questionType =
            this.questionTypes[this.questionIds.indexOf(questionId)];
          const valueKey = JSON.stringify(value);
          const skipArr = skipQuestionsStr
            ? skipQuestionsStr
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : [];

          if (!this.answers.has(questionId))
            this.answers.set(questionId, new Set());
          if (!this.selectedOptions.has(questionId))
            this.selectedOptions.set(questionId, new Set());
          if (!this.skips.has(questionId))
            this.skips.set(questionId, new Map());

          const answerSet = this.answers.get(questionId);
          const selectedSet = this.selectedOptions.get(questionId);
          const skipMap = this.skips.get(questionId);

          if (questionType === "single") {
            answerSet.clear();
            answerSet.add(valueKey);
            selectedSet.clear();
            if (optionBlockId) selectedSet.add(optionBlockId);
            skipMap.clear();
            if (optionBlockId) skipMap.set(optionBlockId, skipArr);
          } else {
            if (answerSet.has(valueKey)) {
              answerSet.delete(valueKey);
              selectedSet.delete(optionBlockId);
              skipMap.delete(optionBlockId);
            } else {
              answerSet.add(valueKey);
              if (optionBlockId) selectedSet.add(optionBlockId);
              if (optionBlockId) skipMap.set(optionBlockId, skipArr);
            }
          }

          const pos = this.questionIds.indexOf(questionId);
          for (let i = pos + 1; i < this.questionIds.length; i++) {
            this.answers.delete(this.questionIds[i]);
            this.skips.delete(this.questionIds[i]);
            this.selectedOptions.delete(this.questionIds[i]);
          }
        },

        hasCurrentAnswer() {
          const s = this.answers.get(this.currentQuestionId);
          return s ? s.size > 0 : false;
        },

        hasAnswer(questionId, value) {
          const s = this.answers.get(questionId);
          return s ? s.has(JSON.stringify(value)) : false;
        },

        getAnswer(questionId) {
          return this.answers.get(questionId);
        },

        _getAllAnswers() {
          return Array.from(this.answers.values()).flatMap((set) =>
            Array.from(set).map((s) => {
              const { "id": _, ...ans } = JSON.parse(s);
              return ans;
            })
          );
        },

        _filterAnswers(answers) {
          const scores = new Map();
          const exclude = new Set();
          for (const answer of answers) {
            for (const [key, ids] of Object.entries(answer)) {
              const numKey = Number(key);
              for (const id of ids) {
                if (numKey === 0) {
                  exclude.add(id);
                } else {
                  scores.set(id, (scores.get(id) ?? 0) + numKey);
                }
              }
            }
          }
          const sorted = Array.from(scores.entries())
            .filter(([id]) => !exclude.has(id))
            .sort(([, a], [, b]) => b - a);
          const cutoff = sorted[maxProduct - 1]?.[1];
          return sorted.filter(
            ([, score], i) => i < maxProduct || score === cutoff
          );
        },

        _collectResultHtml() {
          const allAnswered = [
            ...this.traversed,
            this.currentQuestionId,
          ].filter(Boolean);
          const items = allAnswered.flatMap((qBlockId) => {
            const optBlockIds = this.selectedOptions.get(qBlockId);
            if (!optBlockIds || optBlockIds.size === 0) return [];
            return Array.from(optBlockIds)
              .map((optBlockId) => {
                const descEl = document.getElementById(`option-description-${optBlockId}`);

                const html = descEl?.innerHTML?.trim() ?? "";
                if (html) return /<li[\s>]/i.test(html) ? html : `<li>${html}</li>`;

                const headingEl = document.getElementById(`option-heading-${optBlockId}`);
                const text = headingEl?.textContent?.trim() ?? "";

                return text ? `<li>${text}</li>` : "";
              })
              .filter(Boolean);
          });
          return items.length ? `<ul>${items.join("")}</ul>` : "";
        },

        _getProductIds(productEntries) {
          return [
            ...new Set(
              productEntries.length > 0
                ? productEntries.map(([id]) => id)
                : defaultProductIds
            ),
          ];
        },

        _getSearchUrl(productIds) {
          const query = productIds.map((value) => "id:" + value).join(" OR ");
          return `${Shopify.routes.root}search?section_id=${sectionId}&type=product&q=${query}`;
        },

        async _fetchRecommendedProduct(renderAnswer = true) {
          const productEntries = this._filterAnswers(this._getAllAnswers());
          const productIds = this._getProductIds(productEntries);

          if (productIds.length === 0) {
            if (renderAnswer) {
              this.hasProducts = false;
              this._showAnswer();
            }
            return [];
          }

          const searchUrl = this._getSearchUrl(productIds);
          const resultHtml = renderAnswer ? this._collectResultHtml() : "";
          let productListHtml = this.cachedResults[searchUrl];

          if (!productListHtml) {
            if (renderAnswer) this.loading = true;
            try {
              const response = await fetch(searchUrl);
              const html = response.ok
                ? new DOMParser().parseFromString(
                    await response.text(),
                    "text/html"
                  )
                : null;
              const src = html?.getElementById("quiz-answer-product-list");

              if (src) {
                const idToScore = new Map(
                  productEntries.map(([id, score]) => [String(id), score])
                );
                Array.from(src.children)
                  .sort(
                    (a, b) =>
                      (idToScore.get(b.id) ?? 0) - (idToScore.get(a.id) ?? 0)
                  )
                  .forEach((el) => {
                    el.classList.add(`quiz-score-${idToScore.get(el.id) ?? 0}`);
                    src.appendChild(el);
                  });

                productListHtml = src.innerHTML;
                this.cachedResults[searchUrl] = productListHtml;
              }
            } catch (e) {
              productListHtml = "";
            }
          }

          if (renderAnswer) {
            const des = document.getElementById(
              `quiz-answer-product-list-${sectionId}`
            );
            if (des && productListHtml) {
              des.innerHTML = productListHtml;
              this._renderAddAllButton(des);
            }

            const textContainer = document.getElementById(
              `quiz-answer-text-${sectionId}`
            );
            if (textContainer) textContainer.innerHTML = resultHtml;

            this._showAnswer();
            this.loading = false;
            return [];
          }

          if (!productListHtml) return [];

          const container = document.createElement("div");
          container.innerHTML = productListHtml;

          return Array.from(container.querySelectorAll(".recommended-product"))
            .slice(0, maxProduct)
            .map((el) => el.querySelector("a.x-heading")?.textContent?.trim())
            .filter(Boolean);
        },

        _renderAddAllButton(productListContainer) {
          const addAllBtn = document.getElementById(`add-all-button-${sectionId}`);
          if (!addAllBtn) return;

          const products = Array.from(productListContainer.querySelectorAll('.recommended-product'))
            .filter((el) => 
              getComputedStyle(el).display !== 'none'
            );
          const hasUnavailable = products.some((el) => el.dataset.productAvailable === 'false');
          
          addAllBtn.disabled = hasUnavailable;
          if (!hasUnavailable) {
            this._renderVariantPopup(products);
          }
        },

        _renderVariantPopup(products) {
          const variantContainer = document.getElementById(`variant-container-${sectionId}`);
          if (!variantContainer) return;

          const filtered = products.filter((el) => el.dataset.noVariant === 'false');

          if (filtered.length === 0) return;

          this.hasVariant = true;
          variantContainer.innerHTML = filtered
            .map((el) => el.querySelector('.quiz-card-product')?.innerHTML ?? '')
            .join('');
          filtered.forEach((el) => el.querySelector('.quiz-card-product')?.remove());

          this.productNumQuiz = filtered.length;
          variantContainer.closest('.product-variant-modal')?.style.setProperty('--product-num', this.productNumQuiz);
        },

        skipEmailForm(blockId) {
          this.emailSkipping = true;
          this.selectAnswer(blockId, { 2: [], 1: [], 0: [], id: [blockId] }, "", blockId);
          this.next();
        },

        async submitEmailForm(event, blockId) {
          const form = event.target;
          this.emailSubmitting = true;

          form.querySelectorAll(".quiz-email-form__field").forEach((field) => field.remove());

          const answered = [...this.traversed, this.currentQuestionId].filter(Boolean);
          let index = 0;

          answered.forEach((qBlockId) => {
            const optionBlockIds = this.selectedOptions.get(qBlockId);
            if (!optionBlockIds || optionBlockIds.size === 0) return;

            const question = this._getTextById(`question-heading-${qBlockId}`) || this._getTextById(`question-description-${qBlockId}`);
            if (!question) return;

            const options = Array.from(optionBlockIds).map((optionBlockId) => {
              const heading = this._getTextById(`option-heading-${optionBlockId}`);
              const text = this._getTextById(`option-description-${optionBlockId}`);
              return [heading, text].filter(Boolean).join(": ");
            }).filter(Boolean);
            if (options.length === 0) return;

            index += 1;
            this._appendField(form, `Q${index} — ${question}`, options.join(", "));
          });

          const titles = await this._fetchRecommendedProduct(false);
          if (titles.length) this._appendField(form, "Recommended", titles.join("\n"));

          this.cacheAnswers(blockId);
          form.submit();
        },

        _appendField(form, name, value) {
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = `contact[${name.replace(/[[\]]/g, "")}]`;
          input.value = value;
          input.classList.add("quiz-email-form__field");
          form.appendChild(input);
        },

        _getTextById(id) {
          return document.getElementById(id)?.textContent?.replace(/\s+/g, " ").trim() ?? "";
        },

        cacheAnswers(blockId) {
          const searchUrl = this._getSearchUrl(this._getProductIds(this._filterAnswers(this._getAllAnswers())));

          try {
            localStorage.setItem(`eurus:quiz-email-form:${sectionId}`,
              JSON.stringify({
                blockId,
                searchUrl,
                recommendedHtml: this.cachedResults[searchUrl] ?? "",
                traversed: Array.from(this.traversed),
                currentQuestionId: this.currentQuestionId,
                answers: Array.from(this.answers, ([qId, values]) => [qId, Array.from(values)]),
                selectedOptions: Array.from(this.selectedOptions, ([qId, optionIds]) => [qId, Array.from(optionIds)]),
                skips: Array.from(this.skips, ([qId, skipMap]) => [qId, Array.from(skipMap)]),
              })
            );
          } catch (e) {
            return;
          }
        },

        _restoreCachedAnswers() {
          if (new URLSearchParams(window.location.search).get("contact_posted") !== "true") return;

          const cached = localStorage.getItem(`eurus:quiz-email-form:${sectionId}`);
          if (!cached) return;
          localStorage.removeItem(`eurus:quiz-email-form:${sectionId}`);

          let data;
          try { 
            data = JSON.parse(cached); 
          } catch (e) { 
            return; 
          }
          if (!Array.isArray(data.traversed) || !Array.isArray(data.answers) || !Array.isArray(data.selectedOptions) || !Array.isArray(data.skips)) return;

          const emailBlock = this.$el.querySelector(`.quiz-email-form[data-block-id="${data.blockId}"]`);
          if (!emailBlock) return;

          this.traversed = data.traversed;
          this.currentQuestionId = data.currentQuestionId;
          this.answers = new Map(data.answers.map(([qId, values]) => [qId, new Set(values)]));
          this.selectedOptions = new Map(data.selectedOptions.map(([qId, optionIds]) => [qId, new Set(optionIds)]));
          this.skips = new Map(data.skips.map(([qId, skipMap]) => [qId, new Map(skipMap)]));
          if (data.searchUrl && data.recommendedHtml) {
            this.cachedResults[data.searchUrl] = data.recommendedHtml;
          }

          this.showSuccessMessage = true;
          this._fetchRecommendedProduct();
        },
      }));
    });
  });
}
