document.addEventListener('alpine:init', () => {
  Alpine.data('xHighlightAnimation', () => ({
    initElements: null,
    animationFrameId: null,
    window_height: window.xViewport.innerHeight,

    load(el, rtl_check, equalLines, fullScreen = false, range) {
      this.initElements = this.separateWords(el);
      this.partitionIntoLines(el, rtl_check, equalLines, fullScreen, range);

      let lastWidth = window.xViewport.innerWidth;
      window.addEventListener("resize", this.debounce(() => {
        if (window.xViewport.innerWidth !== lastWidth) {
          lastWidth = window.xViewport.innerWidth;
          this.partitionIntoLines(el, rtl_check, equalLines, fullScreen, range);
        }
      }));
    },

    debounce(func, timeout = 300){
      let timer;
      return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => { func.apply(this, args); }, timeout);
      };
    },

    calRelativePos(el) {
      const elRect = el.getBoundingClientRect();
      const parentRect = el.parentElement.getBoundingClientRect();
      
      return Math.round((elRect.left - parentRect.left) / parentRect.width * 100);
    },

    separateWords(container) {
      let elements = [];
    
      container.childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '') {
          let words = node.textContent.match(/(\s+|[^\s-]+|[-])/g);
          words.forEach(word => {
            if (word) {
              let span = document.createElement("span");
              span.textContent = word;
              elements.push(span);  
            }
          });
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          elements.push(node);
        }
      });

      return elements;
    },

    partitionIntoLines(container, rtl_check, equalLines, fullScreen = false, range) {
      container.innerHTML = "";
      this.initElements.forEach(el => container.appendChild(el));
      let maxHeight = 0;
    
      requestAnimationFrame(() => {
        let lines = [];
        let currentLine = [];
        let prevMid = null;
    
        this.initElements.forEach((el) => {
          let rect = el.getBoundingClientRect();
          if (rect.width === 0) return;

          if (maxHeight < rect.height) {
            maxHeight = rect.height;
          }
          let midpoint = rect.bottom + (rect.top - rect.bottom) / 2;

          if (prevMid !== null && Math.abs(midpoint - prevMid) > 10) {
            lines.push(currentLine);
            currentLine = [];
          } 
          currentLine.push(el);
          prevMid = midpoint;
        });

        if (currentLine.length) {
          lines.push(currentLine);
        }

        let newInnerHTML = lines.map((lineElements) => {
          let div = document.createElement("div");
          if (equalLines) {
            div.className = "text-highlight content-center relative inline-block text-[rgba(var(--colors-heading),0.3)]";
            div.style.height = `${maxHeight + 8}px`;
          } else {
            div.className = "text-highlight content-center relative inline-block text-[rgba(var(--colors-heading),0.3)] mb-0.5";
          }
          lineElements.forEach(el => div.appendChild(el.cloneNode(true)));
          return div.outerHTML;
        }).join("");
      
        container.innerHTML = newInnerHTML;  
        container.setAttribute("x-intersect.once.margin.300px", "startAnim($el, " + rtl_check + ", " + fullScreen + ", " + range + ")");
      });
    },

    startAnim(el, rtl_check, fullScreen = false, range) {
      let starts = [];
      let ends = [];

      if (fullScreen) {
        let offsetStart = el.offsetParent.parentElement.getBoundingClientRect().top + window.scrollY;

        const offsets = { 3000: -200, 2000: 200 };
        let offset = offsets[range] ?? 600;
        
        el.childNodes.forEach((element, index) => {
          if (index != 0) {
            starts.push(ends[index - 1]);
            ends.push(starts[index] + range);
          } else {
            starts.push(offsetStart);
            ends.push(offsetStart + range)
          }
        });
        el.offsetParent.parentElement.style.height = `calc(${ends[ends.length - 1] - starts[0] + range / 2 + offset}px)`
      } else {
        starts = [0.7];
        ends = [0.5];
        
        el.childNodes.forEach((element, index) => {
          if (index != el.childNodes.length - 1) {
            const element_rect = element.getBoundingClientRect();
            const element_height = Math.abs(element_rect.bottom - element_rect.top) / this.window_height;
            let start = ends[index] + element_height;
            starts.push(start);
            ends.push(Math.max(start - 0.2, 0.2));
          }
        });
      }
      this.createObserver(el, rtl_check, starts, ends, fullScreen);
    },

    createObserver(el, rtl_check, starts, ends, fullScreen = false) {
      const option = {
        root: null,
        rootMargin: '300px',
        threshold: 0
      };

      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            this.updateHighlight(el, rtl_check, starts, ends, fullScreen);
          } else {
            if (this.animationFrameId) {
              cancelAnimationFrame(this.animationFrameId);
              this.animationFrameId = null;
            }
          }
        });
      }, option);

      observer.observe(el);
    },
    
    updateHighlight(el, rtl_check = false, starts, ends, fullScreen = false) {
      const update = () => {
        el.childNodes.forEach((element, index) => {
          let value;
          const element_rect = element.getBoundingClientRect();
          let position = fullScreen ? window.scrollY : Math.max(Math.min((element_rect.top / this.window_height), 1), 0);

          if (fullScreen) {
            if (position < starts[index]) {
              value = 0;
            } else if (position > ends[index]) {
              value = 120;
            } else {
              value = 120 * (position - starts[index]) / (ends[index] - starts[index]);
            }
          } else {
            if (position > starts[index]) {
              value = 0;
            } else if (position < ends[index]) {
              value = 120;
            } else {
              value = 120 * (position - starts[index]) / (ends[index] - starts[index]);
            }
          }

          element.style.backgroundSize = `${value}%`;
          Array.from(element.getElementsByClassName('highlight')).forEach(el => {
            if (Math.round(value) > this.calRelativePos(el)) {
              el.classList.add('highlight-anm-start');
              el.classList.remove('highlight-anm-end');
            } else {
              el.classList.remove('highlight-anm-start');
              el.classList.add('highlight-anm-end');
            }
          });
          element.style.setProperty('--highlight-fill-stop', `${element.offsetWidth * value / 100 - element.offsetWidth * 0.2}px`);
          element.style.setProperty('--highlight-unfill-stop', `${element.offsetWidth * value / 100}px`)
        });
        
        this.animationFrameId = window.requestAnimationFrame(update);
      }

      if (!this.animationFrameId) {
        update();
      }
    }
  }));
  Alpine.data("xMap", (data) => ({
    load() {
      this.$el.querySelector(
        "iframe"
      ).src = `https://maps.google.com/maps?q=${data}&t=m&z=17&ie=UTF8&output=embed&iwloc=near`;
    },
    loadMap(location) {
      this.$el.querySelector(
        "iframe"
      ).src = `https://maps.google.com/maps?q=${location}&t=m&z=17&ie=UTF8&output=embed&iwloc=near`;
    },
    removeMap() {
      this.$el.querySelector(
        "iframe"
      ).src = ``;
    } 
  }));

  Alpine.data("xMultipleStores", () => ({
    active: 1,
    open: false,
    canScroll: false,
    atTop: true,
    atBottom: false,
    showStore: false,
    load() {
      const canScrollVertically = this.$refs.list_stores.scrollHeight > this.$refs.list_stores.closest(".multi_stores_content").clientHeight;
      if (canScrollVertically) {
        this.canScroll = true;
      }
      window.addEventListener('resize', ()=> {
        this.heightNatural();
      })
      this.heightNatural();
    },
    heightNatural() {
      if (window.matchMedia("(min-width: 768px)").matches) {
        if(this.$refs.natural_height) {
           this.$refs.natural_height.style.height = this.$refs.h_img_location.offsetHeight +'px';
        }
      } else {
        if(this.$refs.natural_height) {
          this.$refs.natural_height.style.removeProperty('height');
        }
      }
    },
    openLocation(el) {
      this.open = true;
      var popupContent = document.getElementById(el.getAttribute("data-id"));
      
      this.$refs.content_location_detail.innerHTML = popupContent.innerHTML;
      const title = this.$refs.content_location_detail.querySelector('h5.location-title');
      if (title) {
        const h4 = document.createElement('h4');

        h4.innerHTML = title.innerHTML;
        h4.className = title.className;

        title.replaceWith(h4);
      }
    },
    hideLocation() {
      requestAnimationFrame(() => {
        this.open = false;
        Alpine.store('xPopup').open = false;
      });
    },
    scrollUp() {
      this.$refs.list_stores.scrollBy({
        top: -200, 
        behavior: 'auto'
      });
      this.checkCanScrollVertical()
    },
    scrollDown() {
      this.$refs.list_stores.scrollBy({
        top: 200,
        behavior: 'auto'
      });
      this.checkCanScrollVertical()
    },
    checkCanScrollVertical() {
      if (window.xViewport.innerWidth < 768) {
        this.atTop = this.$refs.list_stores.scrollTop === 0;
        this.atBottom = (this.$refs.list_stores.scrollTop + this.$refs.list_stores.closest(".multi_stores_content").clientHeight) >= (this.$refs.list_stores.scrollHeight - 2);
      }
    },
    toggleStore(noScroll = false) {
      this.showStore = !this.showStore;
      if (!this.showStore) {
        this.$refs.first_store.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      if (!noScroll) {
        this.canScroll = !this.canScroll;
        this.$refs.list_stores.addEventListener("animationend", this.checkCanScrollVertical());
        setTimeout(() => {
          this.$refs.list_stores.removeEventListener("animationend", this.checkCanScrollVertical());
        }, 300);
      }
    }
  }));
  
  Alpine.data('xFeaturedCollection', (sectionId, pageParam, container) => ({
    sectionId: sectionId,
    pageParam: pageParam,
    currentTab: 1,
    loading: true,
    loaded: [],
    select(index) {
      this.currentTab = index;
      if (Shopify.designMode) {
        this.currentTab = index - 1;
        const content = document.createElement('div');
        const template = container.querySelector(`#x-fc-${sectionId}-${index}`);
        if (template) {
          content.appendChild(template.content.firstElementChild.cloneNode(true));
          container.appendChild(content.querySelector('.x-fc-content'));
          template.remove();
        }
        
        this.loading = false;
      }
    },
    loadData(index) {
      const selectedPage = index - 1;
      if (!this.loaded.includes(selectedPage)) {
        this.loading = true;
        
        let url = `${window.location.pathname}?section_id=${this.sectionId}&${this.pageParam}=${index}`;
        fetch(url, {
          method: 'GET'
        }).then(
          response => response.text()
        ).then(responseText => {
          const html = (new DOMParser()).parseFromString(responseText, 'text/html');
          const contentId = `x-fc-${this.sectionId}-${index}`;
          if (Shopify.designMode && document.getElementById(contentId)) {
            document.getElementById(contentId).remove();
          }
          const newContent = html.getElementById(contentId);
          if (newContent && !document.getElementById(contentId)) {
            container.appendChild(newContent);
            this.loaded.push(selectedPage);
          }
          this.loading = false;
        })
      }
    },
    scrollIntoView(element) {
      const scrollableContainer = element.closest('.overflow-x-auto'); 
      const elementPosition = element.offsetLeft;

      scrollableContainer.scroll({
        left: elementPosition,
        behavior: 'smooth'
      });
    }
  }));

  Alpine.data('xLocalizationForm', () => ({ 
    openCountry: false,
    loading: false,
    cachedResults: false,
    submit(value, input) {
      this.$el.closest("#localization_form").querySelector('#'+input).value = value;
      this.$el.closest("#localization_form").submit();
    },
    loadCountry(el) {
      if (this.cachedResults) {
        this.openCountry = true;
        return true
      }
      let countrySelector = el.closest(".country-selector");
      let optionEL = countrySelector.querySelector(".country-options");

      this.loading = true;
      fetch(window.Shopify.routes.root + '?section_id=country-selector')
      .then(reponse => {
        return reponse.text();
      })
      .then((response) => {
        const parser = new DOMParser();
        const content = parser.parseFromString(response,'text/html').getElementById("list-country").innerHTML;
        optionEL.innerHTML = content;
        this.cachedResults = true;
        this.openCountry = true;
      })
      .finally(() => {
        this.loading = false;
      })
    },
  }));
  Alpine.store('xCartShare', {
    openShareCart: false,
    cartShareUrl: "",
    shared: false,
    copySuccess: false,
    generateUrl() {
      fetch(Shopify.routes.root + 'cart.js', {
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' }
      })
      .then(response => response.json())
      .then(response => {
        const items = response.items.slice().reverse();
        const cartParams = items.map(item => `id:${item.variant_id},q:${item.quantity}`).join('&') + '&share_cart:true';
        this.cartShareUrl = `${window.location.origin}?${cartParams}`;
      });
    },
    copyURL() {
      const cartShareInput = document.getElementById(`x-share-cart-field`);
      if (cartShareInput) {
        navigator.clipboard.writeText(cartShareInput.value).then(
          () => {
            this.copySuccess = true;
            setTimeout(() => {
              this.copySuccess = false;
            }, 2000);
          },
          () => {
          }
        );
      }
    },
    handleShareCart() {
      const queryString = window.location.search;
      if (queryString.includes("share_cart:true")) {
        const items = queryString
          .substring(1)
          .split('&')
          .reduce((listItem, param) => {
              if (param.startsWith('id:')) {
                const [idPart, quantityPart] = param.split(',');
                const id = parseInt(idPart.slice(3)); 
                const quantity = parseInt(quantityPart.slice(2));
                listItem.push({ id, quantity });
              }
              return listItem;
          }, []);
        if (items.length > 0) {
          this.addCartItems(items);
        }
      }
    },
    addCartItems(items) {
      const formData = {
        'items': items,
        'sections': Alpine.store('xCartHelper').getSectionsToRender().map((s) => s.id)
      }
          
      return Alpine.store('xCartHelper').withCartLock((standardEvent) => fetch(Shopify.routes.root + "cart/add.js", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(formData)
      }).then(response => Alpine.store('xCartHelper').cartJson(response))
        .then(response => {
          if (response.status == '422') {
            document.dispatchEvent(new CustomEvent("eurus:product:add-failed", {
              detail: {
                errorMessage: response.description
              }
            }));
            return Alpine.store('xCartHelper').settleWithCart(standardEvent, Alpine.store('xCartHelper').userErrorsFrom(response));
          }
          Alpine.store('xCartHelper').reRenderSections(response.sections);
          Alpine.store('xMiniCart').openCart();
          Alpine.store('xCartHelper').currentItemCount = parseInt(document.getElementById('cart-icon-bubble').innerHTML);
          document.dispatchEvent(new CustomEvent("eurus:cart:items-changed"));
          document.dispatchEvent(new CustomEvent("eurus:product:added", {
            detail: {
              product: response.items
            }
          }));
          this.shared = true;
          return Alpine.store('xCartHelper').settleWithCart(standardEvent);
        })
        .catch(error => {
          standardEvent.fail(error);
          document.dispatchEvent(new CustomEvent("eurus:product:add-failed", {
            detail: {
              errorMessage: error
            }
          }));
          console.error(error);
        }), {
        type: 'shopify:cart:lines-update',
        action: 'add',
        context: 'cart',
        lines: Alpine.store('xCartHelper').addLines(items)
      });
    }
  });
  
  Alpine.store('xShopifyPaymentBtn', {
    load(e) {
      if (Shopify && Shopify.PaymentButton) {
        Shopify.PaymentButton.init();
      }
    },
  });

  Alpine.data('xPopups', (data) => ({
    enable: false,
    showMinimal: false,
    show: Shopify.designMode ? ( localStorage.getItem(data.name + '-' + data.sectionId)? xParseJSON(localStorage.getItem(data.name + '-' + data.sectionId)) : true ) : false,
    delayDays: data.delayDays ? data.delayDays : 0,
    t: '',
    copySuccess: false,
    init() {
      if (Shopify.designMode) {
        var _this = this;
        const handlePopupSelect = (event, isResize = null) => {
          if (event.detail && event.detail.sectionId.includes(data.sectionId) || isResize) {
            if (window.Alpine) {
              _this.open();
              localStorage.setItem(data.name + '-' + data.sectionId, JSON.stringify(true));
            } else {
              document.addEventListener('alpine:initialized', () => {
                _this.open();
                localStorage.setItem(data.name + '-' + data.sectionId, JSON.stringify(true));
              });
            }
          } else {
            if (window.Alpine) {
              _this.closeSection();
              localStorage.setItem(data.name + '-' + data.sectionId, JSON.stringify(false));
            } else {
              document.addEventListener('alpine:initialized', () => {
                _this.closeSection();
                localStorage.setItem(data.name + '-' + data.sectionId, JSON.stringify(false));
              });
            }
          }
        }

        document.addEventListener('shopify:section:select', (event) => {
          handlePopupSelect(event);
        });

        document.addEventListener('shopify:block:select', (event) => {
          handlePopupSelect(event);
        });

        // Reload the popup and display the overlay when change screen in Shopify admin
        if (data.name != 'popup-age-verification') {
          window.addEventListener('resize', (event)=> {
            handlePopupSelect(event, xParseJSON(localStorage.getItem(data.name + '-' + data.sectionId)));
          })
        }
      }

      localStorage.setItem('promotion-popup', '[]');

      if (this.$el.querySelector('.newsletter-message')) {
        this.open();
        return;
      }

      this.$watch('show', (value) => {
        if (!value) {
          this.close();
        }
      });
    },
    load(sectionId) {
      // Optimize the JavaScript for popup loading.
      if (window.location.pathname === '/challenge') return;

      const _this= this;
      if (Shopify.designMode) {
        _this.open();
      } else {
        if (data.name == 'popup-promotion' && !this.handleSchedule() && data.showCountdown) return;

        if (data.name == 'popup-promotion' && document.querySelector(`#x-age-popup-${sectionId}`) && xParseJSON(localStorage.getItem('popup-age-verification')) == null) {
          document.addEventListener("close-age-verification", () => {
            this.triggerIntent();
            if (data.trigger_intent == 'delay') {
              setTimeout(() => {
                _this.open();
              }, data.delays * 1000);
            }
          })
          return;
        }
        
        this.triggerIntent();
      }
    },
    open() {
      if (!Shopify.designMode && this.isExpireSave() && !this.show) return;

      var _this = this;
      if (data.name == 'popup-age-verification') {
        if (this.isExpireSave() && !Shopify.designMode && !data.show_popup) return;

        requestAnimationFrame(() => {
          document.body.classList.add("overflow-hidden");
          Alpine.store('xPopup').open = true;
        });
      }

      // Show minimal popup when
      // 1. "Show minimal" is enabled for desktop, default style is set to "minimal", and the window width is >= 768
      // 2. "Show minimal" is enabled for mobile, default mobile style is set to "minimal", and the window width is < 768
      if ((data.showMinimal && data.default_style == "minimal" && window.xViewport.innerWidth >= 768) 
        || (data.showMinimalMobile && data.default_style_mobile == "minimal" && window.xViewport.innerWidth < 768)) {
        _this.showMinimal = true;
        _this.show = false;
        if (Shopify.designMode) {
          localStorage.setItem(data.name + '-' + data.sectionId, JSON.stringify(false));
          _this.removeOverlay();
        }
      } else {
        // Show full popup
        if (data.showOnMobile && window.xViewport.innerWidth < 768 || window.xViewport.innerWidth >= 768) {
          // Show a full popup the first time a customer accesses the site. If the customer closes the full popup, display a minimal popup for the rest of the session.
          if (localStorage.getItem('current-' + data.sectionId) == 'minimal') {
            _this.showMinimal = true;
            _this.show = false;
            _this.removeOverlay();
          } else {
            _this.show = true;
            _this.showMinimal = false;
            _this.setOverlay();
            if (!Shopify.designMode) {
              _this.saveDisplayedPopup();
            }
          }
        } else {
          // Show nothing when screen width is < 768 and "Show popup on mobile" is disabled.
          _this.removeOverlay();
        }
      }
    },
    close() {
      if (data.name == 'popup-age-verification') {
        this.show = false;
        requestAnimationFrame(() => {
          document.body.classList.remove("overflow-hidden");
          Alpine.store('xPopup').close();
        });
        document.dispatchEvent(new Event('close-age-verification'));
        if (!this.isExpireSave()) {
          this.setExpire()
        }
        this.removeDisplayedPopup();
        return;
      }
      var _this = this;
      if (Shopify.designMode) {
        requestAnimationFrame(() => {
          setTimeout(() => {
            _this.showMinimal = true;
          }, 300);
        });
      } else {
        this.removeDisplayedPopup();
        if ((data.showMinimal && window.xViewport.innerWidth >= 768) || (data.showMinimalMobile && window.xViewport.innerWidth < 768)) {
          requestAnimationFrame(() => {
            setTimeout(() => {
              _this.showMinimal = true;
            }, 300);
            // Save data to storage when the full popup is closed (the full popup only shows on the first access to the site)
            localStorage.setItem('current-' + data.sectionId, 'minimal');
          });
        } else {
          if (!this.isExpireSave()) {
            this.setExpire()
          }
        }
      }
      requestAnimationFrame(() => {
        setTimeout(() => {
          _this.show = false;
          _this.removeOverlay();
        }, 300);
      });
    },
    triggerIntent() {     
      var _this = this;
      switch (data.trigger_intent) {
        case "exit":
          document.addEventListener('mouseleave', (event) => {
            if (event.clientY <= 0 || event.clientX <= 0 || event.clientY >= window.xViewport.innerHeight || event.clientX >= window.xViewport.innerWidth) {
              _this.open();
            }
          });
          break;
        case "copy_to_clipboard":
          document.addEventListener('copy', () => {
            _this.open();
          });
          break;
        case "scroll":
          window.addEventListener('scroll', () => {
            const scrollPosition = window.scrollY + window.xViewport.innerHeight;
            const documentHeight = document.documentElement.scrollHeight;
            if (scrollPosition >= documentHeight * data.scroll_height) { // Enable when scroll to scroll_height percent page
              _this.open();
            }
          });
          break;
        default:
          setTimeout(() => {
            _this.open();
          }, data.delays * 1000);
      }
    },
    closeSection() {
      this.show = false;
      this.showMinimal = false;
      this.removeOverlay();
    },
    setExpire() {
      const item = {
        section: data.sectionId,
        expires: Date.now() + this.delayDays * 24 * 60 * 60 * 1000
      }
      
      localStorage.setItem(data.sectionId, JSON.stringify(item))
      // Remove storage data so that the full popup will be displayed again when the reappear rule is applied on the site.
      localStorage.removeItem('current-' + data.sectionId);
      setTimeout(()=>{
        this.saveDisplayedPopup();
        this.show = true;
      }, item.expires - Date.now())
    },

    isExpireSave() {
      const item = xParseJSON(localStorage.getItem(data.sectionId));
      if (item == null) return false;

      if (Date.now() > item.expires) {
        localStorage.removeItem(data.sectionId);
        return false;
      }

      return true;
    },
    handleSchedule() {
      if (data.showCountdown) {
        let el = document.getElementById('x-promotion-' + data.sectionId);
        let settings = xParseJSON(el.getAttribute('x-countdown-data'));
        if (!Alpine.store('xHelper').canShow(settings)) {
          if (!Shopify.designMode && data.schedule_enabled) {
            requestAnimationFrame(() => {
              this.show = false;
            });

            return false;
          }
        }
      }

      this.enable = true;
      return true;
    },
    clickMinimal() {
      requestAnimationFrame(() => {
        this.show = true;
        this.showMinimal = false;
        if (!Shopify.designMode) {
          this.saveDisplayedPopup()
        }
        this.setOverlay();
      })
    },
    setOverlay() {
      let popupsDiv = document.getElementById("eurus-popup");
      if (popupsDiv.classList.contains('bg-[#acacac]')) return
      if (data.overlay) {
        popupsDiv.className += ' bg-[#acacac] bg-opacity-30';
      }
    },
    removeOverlay() {
      let popupsDiv = document.getElementById("eurus-popup")
        displayedPopups = xParseJSON(localStorage.getItem("promotion-popup")) || [];
      if (popupsDiv.classList.contains('bg-[#acacac]') && displayedPopups.length == 0) {
        popupsDiv.classList.remove('bg-[#acacac]', 'bg-opacity-30');
      }
    },
    // Closing the minimal popup will set it as expired.
    closeMinimal() {
      this.showMinimal = false;
      if (Shopify.designMode) return

      if (!this.isExpireSave()) this.setExpire();
    },
    saveDisplayedPopup() {
      let localStorageArray = xParseJSON(localStorage.getItem('promotion-popup')) || [];
      if (!localStorageArray.some(item => item == data.name + '-' + data.sectionId)) {
        localStorageArray.push(data.name + '-' + data.sectionId);
        localStorage.setItem('promotion-popup', JSON.stringify(localStorageArray));
      }
    },
    removeDisplayedPopup() {
      let localStorageArray = xParseJSON(localStorage.getItem('promotion-popup')),
        updatedArray = localStorageArray.filter(item => item != data.name + '-' + data.sectionId);
      localStorage.setItem('promotion-popup', JSON.stringify(updatedArray));
    },
  }));

  Alpine.data('xProductCart', (
    wrappringVariantId,
    engravingVariantId,
  ) => ({
    loading: false,
    errorMessage: false,
    mainHasError: false,
    buttonSubmit: "",
    error_message_wrapper: {},
    stopAction: false,
    insuranceVariantId: '',
    loadInsurance(id) {
      if (this.insuranceVariantId == '') {
        this.insuranceVariantId = id;
      }
    },
    scrollToAtcBtn(btnId) {
      const originalAtcBtn = document.querySelector(`#${btnId}`);
      Alpine.store("xHeaderMenu")?.suppressScroll?.();
      originalAtcBtn.scrollIntoView({
        behavior: "smooth",
        block: 'center',
        inline: 'center'
      })
    },
    async addToCart(e, required, quickView, sticky) {
      const addToBundle = quickView && Alpine.store('xQuickView') && Alpine.store('xQuickView').bundleTarget;
      if (!addToBundle) this.loading = true;
      e.preventDefault();

      setTimeout(async () => {
        if (required && !addToBundle) {
          var productInfo = this.$el.closest('.product-info');
          if(sticky){
            productInfo = document.querySelector('.main-product .product-info') || document.querySelector('.product-info');
          }
          if (productInfo) {
            var propertiesInput = productInfo.querySelectorAll(`.customization-picker`);
            this.stopAction = false;
            let scrollStatus = false;
                
            propertiesInput.length && propertiesInput.forEach((input) => {
              if (input.required && input.value.trim() == '' || input.classList.contains("validate-checkbox")) {
                input.classList.add("required-picker");
                this.stopAction = true;
                if(!scrollStatus){
                  Alpine.store("xHeaderMenu")?.suppressScroll?.();
                  input.parentElement.querySelector('.text-required').scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                  });
                  scrollStatus = true;
                }    
              } else {
                input.classList.remove("required-picker");
              }                
            });              

            if (!this.stopAction) {
              productInfo.querySelectorAll('.recipient_input').forEach(giftCardInput => {
                if (!this.stopAction && giftCardInput.required) {
                  this.stopAction = Alpine.$data(giftCardInput.closest('[x-data]')).onChangeInput(giftCardInput);
                  if (this.stopAction) {
                    Alpine.store("xHeaderMenu")?.suppressScroll?.();
                    giftCardInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }
              });
            }
          }
          if (this.stopAction) {
            setTimeout (() => {
              this.loading = false;
            }, 500);
            return true;
          }
        }
        if (addToBundle) {
          const bundleTarget = Alpine.store('xQuickView').bundleTarget;
          const selectedVariantEl = document.getElementById('quickview-product-content')?.querySelector('script[type="application/json"][data-selected-variant]');
          const quickViewFormData = new FormData(this.$refs.product_form);

          document.dispatchEvent(new CustomEvent(`eurus:quickview:add-to-bundle:${bundleTarget}`, {
            detail: {
              variant: selectedVariantEl ? JSON.parse(selectedVariantEl.textContent) : null,
              quantity: Number(quickViewFormData.get('quantity')) || 1
            }
          }));
          Alpine.store('xQuickView').close();
          return true;
        }

        if (this.$refs.engraving_text && engravingVariantId) {
          if (this.$refs.engraving_text.value.trim()) {
            if (!this.$refs.engraving_text.hasAttribute('name')) this.$refs.engraving_text.setAttribute('name', this.$refs.text_area_name.value);
          } else {
            if (this.$refs.engraving_text.hasAttribute('name')) this.$refs.engraving_text.removeAttribute('name');
          }
        }

        var productForm = this.$el.closest('.product-info') || this.$el.closest('form');
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
          (this.$refs.gift_wrapping_checkbox && this.$refs.gift_wrapping_checkbox.checked && wrappringVariantId) || 
          (this.$refs.engraving_text && engravingVariantId && this.$refs.engraving_text.value.trim()) || 
          (this.insuranceVariantId && !localStorage.getItem('insuranceRemoved') && (!match || match[1].trim() === '')) || 
          (linkedProductList.length > 0) ||
          (linkedProductListQty.length > 0)
        ) {
          const variantId = formData.get('id');
          const productTitle = productForm ? productForm.querySelector(`.product-variant-title-${formData.get('product-id')}-${variantId}`)?.textContent : null
          let additionalOptionData = [];
          if (this.$refs.gift_wrapping_checkbox && this.$refs.gift_wrapping_checkbox.checked && wrappringVariantId) {
            additionalOptionData.push(
              {
                id: wrappringVariantId,
                quantity: 1,
                parent_id: variantId,
                properties: {
                  "For": productTitle
                }
              }
            );
          }
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
              
          if (this.$refs.engraving_text && engravingVariantId && this.$refs.engraving_text.value.trim()) {
            additionalOptionData.push(
              {
                id: engravingVariantId,
                quantity: 1,
                parent_id: variantId,
                properties: {
                  "For": productTitle
                }
              }
            );
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
            if (typeof response.errors == 'object') {
              this.error_message_wrapper = response.errors;
              document.querySelector('.recipient-error-message').classList.remove('hidden');
            } else {
              this.errorMessage = true;
              setTimeout(() => {
                this.errorMessage = false;
              }, 3000);
              if(this.$refs.error_message){
                this.$refs.error_message.textContent = response.description;
              }
              if(this.$refs.error_message_mobile){
                this.$refs.error_message_mobile.textContent = response.description;
              }
            }
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
            document.querySelector('.recipient-error-message') ? document.querySelector('.recipient-error-message').classList.add('hidden') : '';
            this.error_message_wrapper = {};
      
            if (Alpine.store('xQuickView') && Alpine.store('xQuickView').show) {
              Alpine.store('xQuickView').show = false;
            }
            Alpine.store('xPopup').close();
            document.dispatchEvent(new CustomEvent("eurus:video-popup:close-popup"));
            if((quickView && Alpine.store('xQuickView').buttonQuickView && Alpine.store('xQuickView').buttonQuickView.dataset.addAsBundle) || (!quickView && this.$refs.product_form && this.$refs.product_form.querySelector('[data-add-as-bundle="true"]'))) {
              document.dispatchEvent(new CustomEvent("eurus:cart:add-as-bundle"));
            } else {
              Alpine.store('xCartHelper').reRenderSections(response.sections);
              if (!Alpine.store('xCartNoti') || !Alpine.store('xCartNoti').enable) {
                Alpine.store('xMiniCart').openCart();
              }               
              Alpine.store('xCartHelper').currentItemCount = parseInt(document.getElementById('cart-icon-bubble').innerHTML);
              if (Alpine.store('xQuickView')) {
                Alpine.store('xQuickView').openPopupMobile = false;
              }
              this.$el.closest('.choose-options')?.getElementsByClassName('js-close-button')[0].click();
              this.$el.closest('.js-product-container')?.getElementsByClassName('js-close-button')[0].click();
              document.dispatchEvent(new CustomEvent("eurus:cart:items-changed"));
              document.dispatchEvent(new CustomEvent("eurus:cart:redirect"));
              document.dispatchEvent(new CustomEvent("eurus:product:added", {
                detail: {
                  product: response
                }
              }));
            }
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
          if ((quickView && Alpine.store('xQuickView').buttonQuickView && !Alpine.store('xQuickView').buttonQuickView.dataset.addAsBundle) || (!quickView && this.$refs.product_form && !this.$refs.product_form.querySelector('[data-add-as-bundle="true"]'))) {
            if(this.$refs.gift_wrapping_checkbox) this.$refs.gift_wrapping_checkbox.checked = false;
          }
          document.cookie = `eurus_insurance=${this.insuranceVariantId}; path=/`;
        }), {
          type: 'shopify:cart:lines-update',
          action: 'add',
          context: quickView ? 'dialog' : 'product',
          lines: Alpine.store('xCartHelper').addLines(newFormData)
        });
      }, 0)
    }
  }));

  Alpine.data('xProductMedia', (settings) => ({
    thumbnailOnMouseDown: false,
    thumbnailOfset: 0,
    thumbnailScrollOfset: 0,
    thumbnailGrabbingClass: '',
    zoomIsOpen: false,
    productMediaIsOpen: '',
    videoExternalListened: false,
    xPosition: 0,
    yPosition: 0,
    imageWidth: 0,
    imageHeight: 0,
    startZoom(event) {
      const elem = event.currentTarget;
      const size = elem.getBoundingClientRect();
      this.xOffset = size.left;
      this.yOffset = size.top;
      this.imageWidth = size.width;
      this.imageHeight = size.height;
    },
    updatePosition(event) {
      if (this.imageWidth && this.imageHeight) {
        this.xPosition = ((event.clientX - this.xOffset) / this.imageWidth) * 100;
        this.yPosition = ((event.clientY - this.yOffset)  / this.imageHeight) * 100;
      }
    },
    thumbnailHandleMouseDown(e) {
      this.thumbnailOnMouseDown = true;
      this.thumbnailGrabbingClass = 'cursor-grabbing';
      if (settings.thumbnail_direction == 'horizontal') {
        this.thumbnailOfset = e.pageX - this.$refs.thumbnail.offsetLeft;
        this.thumbnailScrollOfset = this.$refs.thumbnail.scrollLeft;
      } else {
        this.thumbnailOfset = e.pageY - this.$refs.thumbnail.offsetTop;
        this.thumbnailScrollOfset = this.$refs.thumbnail.scrollTop;
      }
    },
    thumbnailHandleMouseMove(e) {
      if(!this.thumbnailOnMouseDown) return;
      e.preventDefault();
      if (settings.thumbnail_direction == 'horizontal') {
        const x = e.pageX - this.$refs.thumbnail.offsetLeft;
        const walk = (x - this.thumbnailOfset) * 2; 
        this.$refs.thumbnail.scrollLeft = this.thumbnailScrollOfset - walk;
      }
      else {
        const y = e.pageY - this.$refs.thumbnail.offsetTop;
        const walk = (y - this.thumbnailOfset) * 2; 
        this.$refs.thumbnail.scrollTop = this.thumbnailScrollOfset - walk;
      }
    },
    thumbnailHandleMouseLeave() {
      this._thumbnailRemoveGrabing();
    },
    thumbnailHandleMouseUp() {
      this._thumbnailRemoveGrabing();
    },
    _thumbnailRemoveGrabing() {
      this.thumbnailOnMouseDown = false;
      this.thumbnailGrabbingClass = 'md:cursor-grab';
    },
    zoomOpen(position, isSplide) {
      this.zoomIsOpen = true;
      Alpine.store('xPopup').open = true;
      setTimeout(() => {
        if (isSplide) {
          const splideEl = document.getElementById(`media-gallery-${settings.section_id}`)
          if (splideEl && splideEl.splide) {
            let nextSlideIndex = 0;
            const childrenArray = Array.from(splideEl.querySelector('.splide__list').children)
            childrenArray.map((item, index) => {
              if (item.getAttribute('x-slide-index') == position) {
                nextSlideIndex = index
              }
            })
            splideEl.splide.go(nextSlideIndex);
          }
          document.addEventListener(`eurus:zoom-image-ready:${settings.section_id}`, () => {
            if (splideEl && splideEl.splide) {
              let nextSlideIndex = 0;
              const childrenArray = Array.from(splideEl.querySelector('.splide__list').children)
              childrenArray.map((item, index) => {
                if (item.getAttribute('x-slide-index') == position) {
                  nextSlideIndex = index
                }
              })
              splideEl.splide.go(nextSlideIndex);
            }
          });
        }
        else {
          document.getElementById(position + '-image-zoom-' + settings.section_id).scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, 200);
      Alpine.store('xModal').activeElement = 'product-image-' + settings.section_id + '-' + position;
    },
    zoomClose() {
      this.zoomIsOpen = false;
      Alpine.store('xPopup').close();
    },
    
    videoHandleIntersect() {
      if (settings.video_autoplay) {
        Alpine.store('xVideo').play(this.$el);
      }
    },
    productModelInit() {
      window.Shopify.loadFeatures([
        {
          name: 'shopify-xr',
          version: '1.0',
          onLoad: this._productModelSetupShopifyXR,
        },
      ]);
    },
    _productModelSetupShopifyXR() {
      const setup = () => {
        document.querySelectorAll('[id^="ProductJSON-"]').forEach((modelJSON) => {
          window.ShopifyXR.addModels(JSON.parse(modelJSON.textContent));
          modelJSON.remove();
        });
        window.ShopifyXR.setupXRElements();
      }

      if (!window.ShopifyXR) {
        document.addEventListener('shopify_xr_initialized', () => {
          setup();
        });
        return;
      }
  
      setup();
    },
    productModelLoadMedia() {
      let container = this.$el.parentNode;
      const content = document.createElement('div');
      content.appendChild(container.querySelector('template').content.firstElementChild.cloneNode(true));

      this.$el.classList.add('hidden');
      container.appendChild(content.querySelector('model-viewer'));

      this._productModelLoadViewerUI();
    },
    productModelPauseViewer() {
      if (this.$el.modelViewerUI) this.$el.modelViewerUI.pause();
    },
    _productModelLoadViewerUI() {
      window.Shopify.loadFeatures([
        {
          name: 'model-viewer-ui',
          version: '1.0',
          onLoad: this._productModelSetupViewerUI.bind(this),
        },
      ]);
    },
    _productModelSetupViewerUI(errors) {
      if (errors) return;

      this.$el.parentNode.modelViewerUI
        = new Shopify.ModelViewerUI(this.$el.parentNode.querySelector('model-viewer')); 
    }
  }));

  Alpine.store('xProductRecommendations', {
    loading: false,
    listOfUpsellProducts: [],
    el: '',
    listUpsellId: [],
    productCount: 0,
    async loadUpsell(el, url, listId, limit, maxItems) {
      this.el = el;
      this.loading = true;
      this.listOfUpsellProducts = [];
      this.productCount = 0;
      this.listUpsellId = [];         
      for (let i = 0; i < listId.length; i++) {
        if (this.productCount >= maxItems) {
          break;
        }    
        try {
          const response = await fetch(`${url}&product_id=${listId[i]}&limit=${limit}&intent=related`);
          const text = await response.text();
          const html = document.createElement('div');
          html.innerHTML = text;
          const des = document.querySelector('.cart-upsell-carousel');
          const src = html.querySelector('.cart-upsell-carousel')
          if(src && des) des.innerHTML = src.innerHTML
          const recommendations = html.querySelector('.product-recommendations');
  
          if (recommendations && recommendations.innerHTML.trim().length) {
            const newUpsellProducts = recommendations.querySelectorAll('template[x-teleport="#cart-upsell-drawer"], template[x-teleport="#cart-upsell"]');
            this.listOfUpsellProducts = [...newUpsellProducts, ...this.listOfUpsellProducts];
  
            for (let index = 0; index < this.listOfUpsellProducts.length; index++) {
              if (this.productCount >= maxItems) {
                break;
              }
              
              const element = this.listOfUpsellProducts[index];
              const elementId = new DOMParser().parseFromString(element.innerHTML, 'text/html').querySelector('.hover-text-link, .link-product-variant').id;
              
              if (!this.listUpsellId.includes(elementId)) {
                this.listUpsellId.push(elementId);
                el.appendChild(element);
                this.productCount++;
              }
            }
  
            if (recommendations.classList.contains('main-product')) {
              el.className += ' mb-5 border-y border-solid accordion empty:border-b-0';
            }
          } else if (recommendations && recommendations.classList.contains('main-product')) {
            recommendations.classList.add("hidden");
            el.innerHTML = recommendations.innerHTML;
          }
        } catch (e) {
          console.error(e);
        } finally {
          this.loading = false;
        }
      }
    },
    load(el, url) {
      this.loading = true;
      fetch(url)
        .then(response => response.text())
        .then(text => {
          const html = document.createElement('div');
          html.innerHTML = text;
          const recommendations = html.querySelector('.product-recommendations');
          const hasProductCard = recommendations && recommendations.getElementsByClassName('x-splide-slide').length > 0;
          if (recommendations && recommendations.innerHTML.trim().length) {
            requestAnimationFrame(() => {
              el.innerHTML = recommendations.innerHTML;
            });
            if (recommendations.classList.contains('main-product')) {
              el.className += ' mb-5 border-y border-solid accordion empty:border-b-0';
            }
          } else if (recommendations.classList.contains('main-product')) {
            requestAnimationFrame(() => {
              setTimeout(() => {
                recommendations.classList.add("hidden");
                el.innerHTML = recommendations.innerHTML;
              }, 0)
            });
          }
          
          if (!hasProductCard) {
            this.loading = false;
            el.style.display = 'none';
          }
        })
        .catch(e => {
          console.error(e);
          this.loading = false;
        })
        .finally(() => {
          requestAnimationFrame(() => {
            window.yotpoWidgetsContainer?.initWidgets?.();
          });
        });
    }
  });

  Alpine.store('xProductRecentlyTab', {
    show: false,
    productsToShow: 0,
    productsToShowMax: 10,
    init() {
      if (document.getElementById('recently-viewed-tab')) {
        this.productsToShow = document.getElementById('recently-viewed-tab').getAttribute("x-products-to-show");
      }
    },
    showProductRecently() {
      if (localStorage.getItem("recently-viewed")?.length) {
        this.show = true;
      } else {
        this.show = false;
      }
    },
    setProduct(productViewed) {
      let productList = [];
      if (localStorage.getItem("recently-viewed")?.length) {
        productList = JSON.parse(localStorage.getItem("recently-viewed")); 
        productList = [...productList.filter(p => p !== productViewed)].filter((p, i) => i<this.productsToShowMax);
        this.show = true;
        let newData = [productViewed, ...productList];
        localStorage.setItem('recently-viewed', JSON.stringify(newData))
      } else {
        this.show = false;
        localStorage.setItem('recently-viewed', JSON.stringify([productViewed]));
      }
    },
    getProductRecently(sectionId, productId) {
      let products = [];
      if (localStorage.getItem("recently-viewed")?.length) {
        products = JSON.parse(localStorage.getItem("recently-viewed"));
        products = productId ? [...products.filter(p => p !== productId)] : products;
        products = products.slice(0,this.productsToShow);
      } else {
        return;
      }
      const el = document.getElementById("recently-viewed-tab");
      let query = products.map(value => "id:" + value).join(' OR ');
      var search_url = `${Shopify.routes.root}search?section_id=${ sectionId }&type=product&q=${query}`;
      fetch(search_url).then((response) => {
        if (!response.ok) {
          var error = new Error(response.status);
          console.log(error)
          throw error;
        }

        return response.text();
      })
      .then((text) => {
        const resultsMarkup = new DOMParser().parseFromString(text, 'text/html').getElementById('recently-viewed-tab').innerHTML;
        el.innerHTML = resultsMarkup;
      })
      .catch((error) => {
        throw error;
      });
    },
    clearStory() {
      var result = confirm('Are you sure you want to clear your recently viewed products?');
      if (result === true) {
        localStorage.removeItem("recently-viewed");
        this.show = false;
      }
    }
  });  

  Alpine.store('xProductRecently', {
    show: false,
    productsToShow: 0,
    productsToShowMax: 10,
    init() {
      if (document.getElementById('shopify-section-recently-viewed')) {
        this.productsToShow = document.getElementById('shopify-section-recently-viewed').getAttribute("x-products-to-show");
      }
    },
    showProductRecently() {
      if (localStorage.getItem("recently-viewed")?.length) {
        this.show = true;
      } else {
        this.show = false;
      }
    },
    setProduct(productViewed) {
      let productList = [];
      if (localStorage.getItem("recently-viewed")?.length) {
        productList = JSON.parse(localStorage.getItem("recently-viewed")); 
        productList = [...productList.filter(p => p !== productViewed)].filter((p, i) => i<this.productsToShowMax);
        this.show = true;
        let newData = [productViewed, ...productList];
        localStorage.setItem('recently-viewed', JSON.stringify(newData))
      } else {
        this.show = false;
        localStorage.setItem('recently-viewed', JSON.stringify([productViewed]));
      }
    },
    getProductRecently(sectionId, productId) {
      let products = [];
      if (localStorage.getItem("recently-viewed")?.length) {
        products = JSON.parse(localStorage.getItem("recently-viewed"));
        products = productId ? [...products.filter(p => p !== productId)] : products;
        products = products.slice(0,this.productsToShow);
      } else {
        return;
      }
      const el = document.getElementById("shopify-section-recently-viewed");
      let query = products.map(value => "id:" + value).join(' OR ');
      var search_url = `${Shopify.routes.root}search?section_id=${ sectionId }&type=product&q=${query}`;
      fetch(search_url).then((response) => {
        if (!response.ok) {
          var error = new Error(response.status);
          console.log(error)
          throw error;
        }

        return response.text();
      })
      .then((text) => {
        const resultsMarkup = new DOMParser().parseFromString(text, 'text/html').getElementById('shopify-section-recently-viewed').innerHTML;
        el.innerHTML = resultsMarkup;
      })
      .catch((error) => {
        throw error;
      })
      .finally(() => {
        requestAnimationFrame(() => {
          window.yotpoWidgetsContainer?.initWidgets?.();
        });
      });
    },
    clearStory() {
      var result = confirm('Are you sure you want to clear your recently viewed products?');
      if (result === true) {
        localStorage.removeItem("recently-viewed");
        this.show = false;
      }
    }
  });

  
  Alpine.data('xVariantSelect', (
        element,
        sectionId,
        isProductPage,
        unavailableText,
        productUrl,
        optionNum,
        cloneSectionId = element.closest('.data-id-section-card') ? element.closest('.data-id-section-card').id : ''
      ) => ({
        loadingEls: '',
        currentVariant: {},
        cachedResults: [],
        handleSectionId: sectionId,
        mediaGallerySource: [],
        optionConnects: [],
        mediaOption: "",
        handleSticky: '',
        initfirstMedia: false,
        init() {
          Array.from(element.querySelectorAll('input')).forEach(input => {
            input.addEventListener('change', (e) => {
              setTimeout(() => { 
                this.updateVariantSelector(e.target.id, e.target.dataset.productUrl);
              }, 0);
            })
          });
          Array.from(element.querySelectorAll('select')).forEach(select => {
            select.addEventListener('change', (e) => {
              setTimeout(() => {
                Array.from(e.target.options).forEach(option => { option.removeAttribute('selected') });
                e.target.options[e.target.selectedIndex].setAttribute('selected', 'selected');
                this.updateVariantSelector(e.target.id, e.target.options[e.target.selectedIndex].dataset.productUrl);
              }, 0)
            })
          });
        },
        _dispatchVariantSelected(html) {
          document.dispatchEvent(new CustomEvent(`eurus:product-page-variant-select:updated:${sectionId}`, {
            detail: { html: html }
          }));
        },
        _dispatchUpdateVariant(html="") {
          document.dispatchEvent(new CustomEvent(`eurus:product-card-variant-select:updated:${sectionId}`, {
            detail: {
              currentVariant: this.currentVariant,
              html: html
            }
          }));
          document.dispatchEvent(new CustomEvent("eurus:variant:change", {
            detail: {
              variant: this.currentVariant
            }
          }));
        },
        _renderDestination(html, selector) {
          const destination = document.getElementById(selector + sectionId);
          const source = html.getElementById(selector + sectionId);
          if (source && destination) destination.innerHTML = source.innerHTML;
        },
        _goToSelectedVariantMedia() {
          let splideEl = document.getElementById("x-product-" + sectionId);
          let slideVariant = ""
          let index = ""
          let activeEL = ""
          if (this.currentVariant !== undefined && this.currentVariant?.featured_media !== undefined) {
            slideVariant = document.getElementsByClassName(this.currentVariant.featured_media.id + '-' + sectionId);
            index = parseInt(slideVariant[0]?.getAttribute('index'));
            activeEL = document.getElementById('postion-image-' + sectionId + '-' + this.currentVariant.featured_media.id);
          } else {
            slideVariant = splideEl.querySelector(".featured-image");
            index = parseInt(slideVariant?.getAttribute('index'));
            activeEL = document.querySelector(`#stacked-${sectionId} .featured-image`);
          }
          
          if (splideEl) {
            if (splideEl.splide && slideVariant) {
              splideEl.splide.go(index)
            } else {
              document.addEventListener(`eurus:media-gallery-ready:${sectionId}`, () => {
                if (splideEl.splide)
                  splideEl.splide.go(index);
              });
            }
          }

          return activeEL;
        },
        _updateMedia(html) {
          let mediaWithVariantSelected = document.getElementById("product-media-" + sectionId) && document.getElementById("product-media-" + sectionId).dataset.mediaWithVariantSelected;
          
          if (!mediaWithVariantSelected) {
            let activeEL = this._goToSelectedVariantMedia();
            if (!activeEL) return;

            if (html && !mediaWithVariantSelected) {
              let mediaGalleryDestination = html.getElementById(`stacked-${ sectionId }`);
              let mediaGallerySource = document.getElementById(`stacked-${ sectionId }`);

              if (mediaGallerySource && mediaGalleryDestination) {
                let firstChildSource = mediaGallerySource.querySelectorAll('div[data-media-id]')[0];
                let firstChildDestination = mediaGalleryDestination.querySelectorAll('div[data-media-id]')[0];
                if (firstChildDestination.dataset.mediaId != firstChildSource.dataset.mediaId && firstChildSource.dataset.index != 1) {
                  let sourceIndex = parseInt(firstChildSource.dataset.index);  
                  let positionOld = mediaGallerySource.querySelector(`div[data-media-id]:nth-of-type(${sourceIndex + 1})`);
                  mediaGallerySource.insertBefore(firstChildSource, positionOld);
                }

                mediaGallerySource.prepend(activeEL);
              }
            }
          }
          if (mediaWithVariantSelected) {
            this.updateMultiMediaWithVariant();
          }
        },
        _validateOption() {
          const mediaWithOption = document.querySelector(`#shopify-section-${sectionId} [data-media-option]`);
          if (mediaWithOption)
            this.mediaOption = mediaWithOption.dataset.mediaOption.split('_');
        },
        updateMultiMediaWithVariant() {
          this._validateOption();
          if (!this.currentVariant) {
            if (this.initfirstMedia) {
              let productMedia = document.querySelectorAll( `#ProductModal-${ sectionId } [data-media-option], #shopify-section-${ sectionId } [data-media-option]`);
              Array.from(productMedia).reverse().forEach(function(newMedia, position) {
                newMedia.classList.add('media_active');
                if (newMedia.classList.contains('media-slide')) {
                  newMedia.classList.add('splide__slide');
                }
              });
            }
            return;
          }
          const variantInputs = this.mediaOption.map(option =>
            document.querySelector(`#shopify-section-${sectionId} [data-option-name="${option}"]`)
          ).filter(el => el !== null);
          if (variantInputs.length === 0) {
            let variantMedias = ""
            if (!this.currentVariant?.featured_media?.id) {
              variantMedias = document.querySelectorAll(`#ProductModal-${ sectionId } [data-media-option].featured-image, #shopify-section-${ sectionId } [data-media-option].featured-image`); 
            } else {
              variantMedias = document.querySelectorAll(`#ProductModal-${ sectionId } [data-media-option="${sectionId}-${this.currentVariant?.featured_media?.id}"], #shopify-section-${ sectionId } [data-media-option="${sectionId}-${this.currentVariant?.featured_media?.id}"]`);
            }
            let mediaActive = document.querySelectorAll(`#ProductModal-${ sectionId } [data-media-option=""], #shopify-section-${ sectionId } [data-media-option=""]`);
            let productMedias = document.querySelectorAll( `#ProductModal-${ sectionId } [data-media-option], #shopify-section-${ sectionId } [data-media-option]`);
            const newMedias = Array.prototype.concat.call( ...mediaActive, ...variantMedias)
            this._setActiveMedia(productMedias, newMedias, variantMedias);

            let splideEl = document.getElementById(`x-product-${ sectionId }`);
            if (splideEl?.splide) {
              splideEl.splide.refresh();
              splideEl.splide.go(0);
            }
            let splideZoomEl = document.getElementById(`media-gallery-${ sectionId }`);
            if (splideZoomEl?.splide) {
              splideZoomEl.splide.refresh();
            }
          } else {
            let optionConnects = [];
            variantInputs.forEach((variantInput) => {
              const variantOptionIndex = variantInput && variantInput.dataset.optionIndex;
              const optionValue = this._handleText(this.currentVariant?.options[variantOptionIndex]);
              if (this.mediaOption.includes(variantInput.dataset.optionName)) {
                optionConnects.push(variantInput.dataset.optionName + '-' + optionValue);
              }
              this.optionIndex = variantOptionIndex;
            });
            const mediaActive = document.querySelectorAll(`#ProductModal-${ sectionId } [data-media-type=""], #shopify-section-${ sectionId } [data-media-type=""]`);
            
            let variantMedias = [];
            let allVariantMedias = document.querySelectorAll(`#ProductModal-${ sectionId } [data-media-type]:not([data-media-type=""]), #shopify-section-${ sectionId } [data-media-type]:not([data-media-type=""])`);
            allVariantMedias.forEach((variantMedia) => {
              let data = variantMedia.getAttribute('data-media-type');
              let dataSet = new Set(data.split('_'));
              if (optionConnects.filter(option => dataSet.has(option)).length === dataSet.size) variantMedias.push(variantMedia);
            });

            let showFeatured = false;
            if (!variantMedias.length) {
              if (!this.currentVariant?.featured_media?.id) {
                variantMedias = document.querySelectorAll(`#ProductModal-${ sectionId } [data-media-option].featured-image, #shopify-section-${ sectionId } [data-media-option].featured-image`); 
                showFeatured = true;
              } else {
                variantMedias = document.querySelectorAll(`#ProductModal-${ sectionId } [data-media-id="${sectionId}-${this.currentVariant?.featured_media?.id}"], #shopify-section-${ sectionId } [data-media-id="${sectionId}-${this.currentVariant?.featured_media?.id}"]`);
              }
            }
            if (!variantMedias.length) {
              document.querySelectorAll( `#ProductModal-${ sectionId } [data-media-type], #shopify-section-${ sectionId } [data-media-type]`).forEach(function(media){
                media.classList.add('media_active');
                media.classList.add('splide__slide');
              });
              let splideEl = document.getElementById(`x-product-${ sectionId }`);
              if (splideEl?.splide) {
                splideEl.splide.refresh();
                splideEl.splide.go(0);
              }
              let splideZoomEl = document.getElementById(`media-gallery-${ sectionId }`);
              if (splideZoomEl?.splide) {
                splideZoomEl.splide.refresh();
              }
              return;
            }
            
            const newMedias = Array.prototype.concat.call(...variantMedias , ...mediaActive);
            let productMedias = document.querySelectorAll( `#shopify-section-${ sectionId } [data-media-type], #ProductModal-${ sectionId } [data-media-type]`);
            
            this._setActiveMedia(productMedias, newMedias);
            
            if (this.optionConnect != optionConnects) {
              this.optionConnect = optionConnects;
            }
            
            let splideEl = document.getElementById(`x-product-${ sectionId }`);
            if (splideEl.splide) {
              splideEl.splide.refresh();
              splideEl.splide.go(0);
            }
            let splideZoomEl = document.getElementById(`media-gallery-${ sectionId }`);
            if(splideZoomEl && splideZoomEl.splide){
              splideZoomEl.splide.refresh();
            }
            
            if (showFeatured) {
              this._goToFirstSlide();
            }  
          }
        },
        _setActiveMedia(productMedias, newMedias, activeMedia) {
          productMedias.forEach(function(media){
            media.classList.remove('media_active');
            media.classList.remove('splide__slide');
            media.classList.remove('x-thumbnail');
          });
          Array.from(newMedias).reverse().forEach(function(newMedia, position) {
            newMedia.classList.add('media_active');
            if (newMedia.classList.contains('media-thumbnail')) {
              newMedia.classList.add('x-thumbnail');
            }
            if (newMedia.classList.contains('media-slide')) {
              newMedia.classList.add('splide__slide');
            }
            let parent = newMedia.parentElement;
            if (activeMedia) {
              if (parent.firstChild != newMedia && Array.from(activeMedia).includes(newMedia)) {
                parent.prepend(newMedia);
              }
            } else {
              if (parent.firstChild != newMedia) {
                parent.prepend(newMedia);
              }
            }
          });

          if (activeMedia) {
            let parent = activeMedia.parentElement;
            parent && parent.prepend(activeMedia);
          }
        },
        _handleText(someString) {
          if (someString) {
            return someString.toString().replace('ı', 'i').replace('ß', 'ss').normalize('NFC').replace('-', ' ').toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, '-').replace(/\s+/g, "-").replace(/-+/g, '-');
          }
        },
        _goToFirstSlide() {
          if (this.currentVariant && !this.currentVariant.featured_image) {
            let splideEl = document.getElementById("x-product-" + sectionId);
            if (splideEl) {
              if (splideEl.splide && this.currentVariant && this.currentVariant.featured_image != null) {
                splideEl.splide.go(0);
              }
            }

            let activeEL = document.querySelector(`#stacked-${sectionId} .featured-image`);
            let stackedEL = document.getElementById('stacked-' + sectionId);
            if(stackedEL && activeEL) stackedEL.prepend(activeEL);
          }
        },
        _updateProductForms() {
          const productForms = document.querySelectorAll(`#product-form-${sectionId}, #product-form-installment-${sectionId}, #product-form-sticky-${sectionId}`);
          productForms.forEach((productForm) => {
            const input = productForm.querySelector('input[name="id"]');
            if (input) {
              input.value = this.currentVariant?.id;
              input.dispatchEvent(new Event('change', { bubbles: true }));
            }
          });
        },
        _renderPriceProduct(html) {
          const destination = document.getElementById('price-' + sectionId);
          let source = html.getElementById('price-' + sectionId);
          if (source && destination) destination.innerHTML = source.innerHTML;
        },
        _renderBuyButtons(html) {
          const productForms = document.querySelectorAll(`#product-form-${sectionId}, #product-form-installment-${sectionId}, #product-form-sticky-${sectionId}`);
          
          productForms.forEach((productForm) => {
            const atcSource = html.querySelector(`#${productForm.getAttribute("id")} .add_to_cart_button`);
            const atcDestination = productForm.querySelector('.add_to_cart_button');
            if (!atcDestination) return;

            if (atcSource && atcDestination) atcDestination.innerHTML = atcSource.innerHTML;
    
            if (this.currentVariant?.available) {
              /// Enable add to cart button
              atcDestination.dataset.available = "true";
              if (html.getElementById('form-gift-card-' + sectionId)) {
                if (document.getElementById('Recipient-checkbox-' + sectionId).checked && document.getElementById('recipient-form-' + sectionId).dataset.disabled == "true") {
                  atcDestination.setAttribute('disabled', 'disabled') 
                } else {
                  atcDestination.removeAttribute('disabled');
                }
              } else {
                atcDestination.removeAttribute('disabled');
              }
            } else {
              atcDestination.dataset.available = "false";
              atcDestination.setAttribute('disabled', 'disabled');
            }

            const cloneProductForms = document.querySelectorAll(`#product-form-${cloneSectionId}, #product-form-installment-${cloneSectionId}, #product-form-sticky-${cloneSectionId}`);
            cloneProductForms.forEach((cloneProductForm) => {
              if (cloneProductForm.getAttribute("id").includes(productForm.getAttribute("id"))){
                const atcCloneDestination = cloneProductForm.querySelector('.add_to_cart_button');
                if (!atcCloneDestination) return;

                if (atcSource && atcCloneDestination) atcCloneDestination.innerHTML = atcSource.innerHTML;
        
                if (this.currentVariant?.available) {
                  /// Enable add to cart button
                  atcCloneDestination.dataset.available = "true";
                  if (html.getElementById('form-gift-card-' + sectionId)) {
                    if (document.getElementById('Recipient-checkbox-' + sectionId).checked && document.getElementById('recipient-form-' + sectionId).dataset.disabled == "true") {
                      atcCloneDestination.setAttribute('disabled', 'disabled') 
                    } else {
                      atcCloneDestination.removeAttribute('disabled');
                    }
                  } else {
                    atcCloneDestination.removeAttribute('disabled');
                  }
                } else {
                  atcCloneDestination.dataset.available = "false";
                  atcCloneDestination.setAttribute('disabled', 'disabled');
                }
              }
            })

          });
          const paymentButtonDestination = document.getElementById('x-payment-button-' + sectionId);
          const paymentButtonSource = html.getElementById('x-payment-button-' + sectionId);
          if (paymentButtonSource && paymentButtonDestination) {
            if (paymentButtonSource.classList.contains('hidden')) {
              paymentButtonDestination.classList.add('hidden');
            } else {
              paymentButtonDestination.classList.remove('hidden');
            }
          }
        },
        _setMessagePreOrder(html) {
          const msg = document.querySelector(`.pre-order-${sectionId}`);
          if (!msg) return;
          msg.classList.add('hidden');
          const msg_pre = html.getElementById(`pre-order-${sectionId}`);
          if (msg_pre) {
            msg.classList.remove('hidden');
            msg.innerHTML = msg_pre.innerHTML;
          }
        },
        _setEstimateDelivery(html) {
          const est = document.getElementById(`x-estimate-delivery-container-${sectionId}`);
          if (!est) return;
          const est_res = html.getElementById(`x-estimate-delivery-container-${sectionId}`);
          if (est_res.classList.contains('disable-estimate')) {
            est.classList.add('hidden');
          } else {
            est.classList.remove('hidden');
            est.innerHTML = est_res.innerHTML;
          }

          const estimateDeliveryCart = document.querySelectorAll(`.cart-edt-${sectionId}`);
          const estimateDeliveryCartUpdate = html.querySelectorAll(`.cart-edt-${sectionId}`);
          if (estimateDeliveryCart.length > 0 && estimateDeliveryCartUpdate.length > 0) {
            estimateDeliveryCart.forEach((item, index) => {
              if(estimateDeliveryCartUpdate[index] != undefined && estimateDeliveryCartUpdate[index].innerHTML != undefined ){
                item.innerHTML = estimateDeliveryCartUpdate[index].innerHTML;
              }
            })
          }
        },
        _setMetafieldInfo(html, query) {
          const content_arr = document.querySelectorAll(`${query}-${sectionId}`);
          const content_res_arr = html.querySelectorAll(`${query}-${sectionId}`);
          if (content_arr.length > 0 && content_res_arr.length > 0) {
            content_arr.forEach((toc, index) => {
              toc.innerHTML = content_res_arr[index].innerHTML;
            })
          }
        },
        _setBackInStockAlert(html) {
          const destination = document.getElementById(`back_in_stock_alert-${sectionId}`);
          const source = html.getElementById(`back_in_stock_alert-${sectionId}`);
          if (source && destination) destination.innerHTML = source.innerHTML;
        },
        _setPickupPreOrder(html) {
          const pickup = document.getElementById(`pickup-pre-order-${sectionId}`);
          if (!pickup) return;
          const pickup_res = html.getElementById(`pickup-pre-order-${sectionId}`);
          if (pickup_res.classList.contains('disable-pickup')) {
            pickup.classList.add('hidden');
          } else {
            pickup.classList.remove('hidden');
          }
        },
        _setUnavailable() {
          const selectors = ['price-sticky-', 'block-inventory-', 'x-badges-', 'pickup-', 'sku-', 'back_in_stock_alert-'];
          for (let selector of selectors) {
            const element = document.getElementById(selector + sectionId);
            if (element) element.classList.add('hidden');
          }
          
          const msg_pre = document.querySelector(`.pre-order-${sectionId}`);
          if (msg_pre) msg_pre.classList.add('hidden');
          const quantity = document.getElementById('x-quantity-' + sectionId);
          if (quantity) quantity.classList.add('unavailable');

          this._setBuyButtonUnavailable();
        },
        _setAvailable() {
          const selectors = ['block-inventory-', 'x-badges-', 'pickup-', 'sku-', 'back_in_stock_alert-'];
          for (let selector of selectors) {
            const element = document.getElementById(selector + sectionId);
            if (element) element.classList.remove('hidden');
          }
          const quantity = document.getElementById('x-quantity-' + sectionId);
          if (quantity) quantity.classList.remove('unavailable');
        },
        _setBuyButtonUnavailable() {
          const productForms = document.querySelectorAll(`#product-form-${sectionId},  #product-form-sticky-${sectionId}`);
          productForms.forEach((productForm) => {
            const addButton = productForm.querySelector('.add_to_cart_button');
            if (!addButton) return;
            addButton.setAttribute('disabled', 'disabled');
            const addButtonText = addButton.querySelector('.x-atc-text');
            if (addButtonText) addButtonText.textContent = unavailableText;
          });
        },
        initEventSticky() {
          document.addEventListener(`eurus:product-page-variant-select-sticky:updated:${sectionId}`, (e) => {
            this.handleSticky = e.detail.variantElSticky;
            this.updateVariantSelector(-1, e.detail.targetUrl);
          });
        },
        _getCurrentVariant(html) {
          this.currentVariant = JSON.parse(html.querySelector(`.variant-selects-main script[type="application/json"][data-selected-variant]`).textContent);
        },
        updateVariantSelector(inputId, target) {
          let updateFullpage = false;
          let callback = () => {};
          
          const targetUrl = target || element.dataset.url;
          if (element.dataset.url !== targetUrl) {
            if (isProductPage) {
              updateFullpage = true;
            }
            callback = (html) => {
              this._getCurrentVariant(html);
              this._setAvailable();
              this._updateURL(targetUrl);
              this._handleSwapProduct(sectionId, html, updateFullpage);
              this._handleSwapQuickAdd(html);
              this._renderCardBundle(html);
              this._renderCardFBT(html);
              this._dispatchUpdateVariant(html);
              this._dispatchVariantSelected(html);
            };
          } else {
            callback = (html) => {
              this._getCurrentVariant(html);
              this._setAvailable();
              this._updateURL(targetUrl);
              this._updateProductForms();
              this._handleUpdateProductInfo(html);
              this._updateOptionValues(html);
              this._updateMedia(html);
              this._handleAvailable(html);
              this._dispatchUpdateVariant(html);
              this._dispatchVariantSelected(html);
            }
          }
          this._renderProductInfo(targetUrl, callback, updateFullpage, inputId);
        },
        _renderProductInfo(url, callback, updateFullpage, inputId) {
          let link = "";
          const selectedOptionValues = this._getSelectedOptionValues();
          if (selectedOptionValues.length < optionNum) {
            return;
          }
          let params = `option_values=${selectedOptionValues.join(',')}`;
          link = updateFullpage?`${url}?${params}`:`${url}?section_id=${this.handleSectionId}&${params}`;
          Alpine.store('xHelper').cancelRequest('eurus:product_info_request');
          if (this.cachedResults[link]) {
            const html = this.cachedResults[link];
            callback(html);
          } else {
            window.requestAnimationFrame(() => {
              this.loadingEls = inputId;
            });
            const controller = new AbortController();
            Alpine.store('xHelper').requestControllers.set('eurus:product_info_request', controller);
            fetch(link, { signal: controller.signal })
              .then((response) => response.text())
              .then((responseText) => {
                const html = new DOMParser().parseFromString(responseText, 'text/html');
                callback(html);
                this.cachedResults[link] = html;
              })
              .catch(err => {
                if (err.name !== 'AbortError') {
                  console.error(err);
                }
              })
              .finally(() => {
                this.loadingEls = '';
              });
          }
          this.handleSticky = '';
        },
        _renderLabel(html) {
          const destination = document.getElementById('x-badges-' + sectionId);
          const source = html.getElementById('x-badges-' + sectionId);
          if (source && destination) {
            const container = source.querySelector('.x-badges-container');
            if (container) {
              const attribute = container.getAttribute('x-intersect.once.margin.1200px') || container.getAttribute('x-init');
            
              container.setAttribute('x-init', attribute?.replace('x-intersect.once.margin.1200px', 'x-init'));
              container.removeAttribute('x-intersect.once.margin.1200px')
              source.innerHTML = container.outerHTML;
            }
            destination.innerHTML += source.innerHTML;
          };
        },
        _handleUpdateProductInfo(html) {
          this._renderCardBundle(html);
          this._renderCardFBT(html);
          this._renderPriceProduct(html);
          const selectors = ['product-variant-title-', 'x-block-product-score-', 'block-button-', 'product-description-block-', 'block-inventory-', 'block-available-quantity-', 'quantity-selector-', 'volume-', 'sku-', 'preorder-', 'cart-edt-', 'subscription-'];
          for (let selector of selectors) {
            this._renderDestination(html, selector);
          }
          this._renderLabel(html);
          this._renderBuyButtons(html);
          this._setMessagePreOrder(html);
          this._setEstimateDelivery(html);
          
          const mtfSelectors = ['.properties_re_render', '.table_info_details', '.block-text', '.text-icon', '.collapsible-content', '.nutrition-bar-content', '.horizontab', '.featured-icon'];
          for (let selector of mtfSelectors) {
            this._setMetafieldInfo(html, selector);
          }
          this._setPickupPreOrder(html);
          this._setBackInStockAlert(html);
          Alpine.store('xUpdateVariantQuanity').render(html, this.handleSectionId);
          this._dispatchUpdateVariant(html);
          this._dispatchVariantSelected(html);
          this._updateOptionValues(html);
          Alpine.store('xPickupAvailable').updatePickUp(sectionId, this.currentVariant?.id);
        },
        initFirstAvailableVariant(el) {
          this.currentVariant = JSON.parse(el.querySelector(`script[type="application/json"][data-selected-variant]`).textContent);
          document.addEventListener('eurus:cart:items-changed', () => {
            this.cachedResults = [];
            Alpine.store('xUpdateVariantQuanity').cachedResults = [];
            Alpine.store('xUpdateVariantQuanity').updateQuantity(sectionId, productUrl, this.currentVariant?.id);
          });
        },
        _handleAvailable(html) {
          const selectedVariant = html.querySelector('.variant-selects-main [data-selected-variant]')?.innerHTML;
          if (selectedVariant == 'null') {
            this._setUnavailable();
          }
        },
        _updateOptionValues(html) {
          const variantSelects = html.querySelector('.variant-selects-main');
          if (variantSelects) {
            element.innerHTML = variantSelects.innerHTML;
            const inputs = element.querySelectorAll('input');
            Array.from(inputs).forEach(input => {
              if (input.dataset.valueSelected === 'true') input.checked = true;
              input.addEventListener('change', (e) => {
                setTimeout(() => { 
                  this.updateVariantSelector(e.target.id, e.target.dataset.productUrl);
                }, 0);
              });
            });
            Array.from(element.querySelectorAll('select')).forEach(select => {
              select.addEventListener('change', (e) => {
                setTimeout(() => {
                  Array.from(e.target.options).forEach(option => { option.removeAttribute('selected') });
                  e.target.options[e.target.selectedIndex].setAttribute('selected', 'selected');
                  this.updateVariantSelector(e.target.id, e.target.options[e.target.selectedIndex].dataset.productUrl);
                }, 0)
              });
            });
          }
        },
        _getVariantData(inputId) {
          return JSON.parse(this._getVariantDataElement(inputId).textContent);
        },
        _getVariantDataElement(inputId) {
          return element.querySelector(`script[type="application/json"][data-resource="${inputId}"]`);
        },
        _updateURL(url) {
          if (!isProductPage) return;
          window.history.replaceState({}, '', `${url}${this.currentVariant?.id ? `?variant=${this.currentVariant?.id}` : ''}`);
        },
        _getSelectedOptionValues() {
          if (this.handleSticky == '') {
            return Array.from(element.querySelectorAll('select option[selected], fieldset input:checked')).map(
              (e) => e.dataset.optionValueId
            ).filter(id => id !== undefined);
          } else {
            return Array.from(this.handleSticky.querySelectorAll('select option[selected]')).map(
              (e) => e.dataset.optionValueId
            ).filter(id => id !== undefined);
          }
        },
        _renderCardBundle(html) {
          const destination = element.closest(".x-product-bundle-data");
          const card = html.getElementById('card-product-bundle-'+ this.handleSectionId);
          if (card) {
            const source = card.querySelector(".x-product-bundle-data");
            if (source && destination) destination.innerHTML = source.innerHTML;
          }
        },
        _renderCardFBT(html) {
          const destination = element.closest(".card-product-fbt");
          const source = html.querySelector('.card-product-fbt-clone .card-product-fbt');
          
          if (source && destination) destination.innerHTML = source.innerHTML;
        },
        _handleSwapProduct(sectionId, html, updateFullpage) {
          if (updateFullpage) {
            document.querySelector('head title').innerHTML = html.querySelector('head title').innerHTML;
            const destination = document.querySelector('main');
            const source = html.querySelector('main');
            if (source && destination) destination.innerHTML = source.innerHTML;
          } else {
            const destination = document.querySelector('.x-product-' + sectionId);
            const source = html.querySelector('.x-product-' + sectionId);
            if (source && destination) destination.innerHTML = source.innerHTML;
          }
        },
        _handleSwapQuickAdd(html) {
          const destination = element.closest(".choose-options-content");
          const source = html.querySelector('.choose-options-content');
          if (source && destination) destination.innerHTML = source.innerHTML;
        }
      }))

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
    init() {
      document.addEventListener(`eurus:product-card:clear:${productId}`, () => { 
        this._reloadCardProduct();
      })
    },
    _dispatchUpdateVariant(html="") {
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
    _renderCardProductLabels(html) {
      const labelDataSrc = html.querySelector('.x-labels-data');
      const labelDataDes = element.closest('.card-product').querySelector('.x-labels-data');

      if (labelDataSrc && labelDataDes) {
        labelDataDes.setAttribute('x-labels-data', labelDataSrc.getAttribute('x-labels-data'));
        this.$nextTick(() => {
          Alpine.store('xBadges') && Alpine.store('xBadges').load(labelDataDes, () => {}, null, true);
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
            this._renderCardProductLabels(html);
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
          window.requestAnimationFrame(() => {
            setTimeout(() => { this.loadingEls = ''; }, 100);
          });

          return
        };
      }
      if (selectedOptionValues.length === 0) return;
      let params = `option_values=${selectedOptionValues.join(',')}`;
      if (chooseOption || productBundle) {
        params = `option_values=${selectedOptionValues.join(',')}&page=${pageParam}`;
      }
      link = `${url.split("?")[0]}?section_id=card-product&${params}`;
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
  }));

  Alpine.data('xVariantColorDropdown', (selectId) => ({
    open: false,
    dropUp: false,
    placed: false,
    selectedIndex: 0,
    activeIndex: 0,
    selectEl: null,
    init() {
      this.selectEl = document.getElementById(selectId);
      if (!this.selectEl) return;
      const sync = () => {
        this.selectedIndex = this.selectEl.selectedIndex;
        this.activeIndex = this.selectedIndex;
      };
      sync();
      this.selectEl.addEventListener('change', sync);
    },
    toggle() {
      this.open ? this.close() : this.show();
    },
    show() {
      this.open = true;
      this.placed = false;
      this.activeIndex = this.selectedIndex;
      this.$nextTick(() => {
        this._updatePlacement();
        this._scrollToActive();
        this.placed = true;
      });
    },
    _updatePlacement() {
      const trigger = this.$refs.trigger;
      const list = this.$refs.list;
      if (!trigger || !list) return;
      const rect = trigger.getBoundingClientRect();
      const listHeight = list.offsetHeight + 4;
      const spaceBelow = window.innerHeight - rect.bottom;
      this.dropUp = spaceBelow < listHeight && rect.top > spaceBelow;
    },
    close(refocus = true) {
      if (!this.open) return;
      this.open = false;
      this.placed = false;
      if (refocus) this.$refs.trigger?.focus();
    },
    move(step) {
      const total = this.selectEl?.options.length || 0;
      if (!total) return;
      this.activeIndex = (this.activeIndex + step + total) % total;
      this._scrollToActive();
    },
    _scrollToActive() {
      const list = this.$refs.list;
      const item = list?.children[this.activeIndex];
      if (!item) return;
      const itemTop = item.offsetTop;
      const itemBottom = itemTop + item.offsetHeight;
      if (itemTop < list.scrollTop) {
        list.scrollTop = itemTop;
      } else if (itemBottom > list.scrollTop + list.clientHeight) {
        list.scrollTop = itemBottom - list.clientHeight;
      }
    },
    select(index) {
      if (!this.selectEl || this.selectEl.selectedIndex === index) {
        this.close();
        return;
      }
      this.selectEl.selectedIndex = index;
      this.selectedIndex = index;
      this.selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      this.close();
    }
  }));
  
  Alpine.data('xStickyATC', (sectionId, is_combined, showAssociatedOnly) => ({
    openDetailOnMobile: false,
    currentAvailableOptions: [],
    options: [],
    init() {
      if (showAssociatedOnly) {
        document.addEventListener(`eurus:media-gallery-ready:${sectionId}`, () => {
          this.renderMedia();
        }, { once: true });
      }
      document.addEventListener(`eurus:product-page-variant-select:updated:${sectionId}`, (e) => {
        this.renderVariant(e.detail.html);
        this.renderProductPrice(e.detail.html);
        this.renderMedia(e.detail.html);
      });
    },
    renderProductPrice(html) {
      const destinations = Array.from(document.getElementsByClassName(`price-sticky-${sectionId}`));
      destinations.forEach((destination) => {
        const source = html.getElementById('price-sticky-' + sectionId);
        if (source && destination) destination.innerHTML = source.innerHTML;
      })
    },
    renderMedia(html) {
      if (showAssociatedOnly) {
        this.$nextTick(() => {
          const destination = document.getElementById('product-image-sticky-' + sectionId)?.querySelector('img');
          const source = document.querySelector('.product-media-container')?.querySelector('.media_active img')?.getAttribute('src');

          if (source && destination) destination.setAttribute('src', source);
        })
      } else {
        const destination = document.getElementById('product-image-sticky-' + sectionId);
        const source = html.getElementById('product-image-sticky-' + sectionId);

        if (source && destination) destination.innerHTML = source.innerHTML;
      }
    },
    renderVariant(html) {
      const destination = document.getElementById('variant-update-sticky-' + sectionId);
      const source = html.getElementById('variant-update-sticky-' + sectionId);

      if (source && destination) destination.innerHTML = source.innerHTML;
    },
    changeOptionSticky(event) {
      Array.from(event.target.options).forEach((option) => {
        option.removeAttribute('selected');
        if (option.selected) option.setAttribute('selected', '');
      });
      const input = event.target.selectedOptions[0];
      const targetUrl = input.dataset.productUrl;
      const variantEl = document.getElementById('variant-update-sticky-' + sectionId);
      document.dispatchEvent(new CustomEvent(`eurus:product-page-variant-select-sticky:updated:${sectionId}`, {
        detail: {
          targetUrl: targetUrl,
          variantElSticky: variantEl
        }
      }));
    }
  }));

  Alpine.store('xPickupAvailable', {
    cachedResults: [],
    updatePickUp(id, variantId) {
      const container = document.getElementsByClassName('pick-up-'+ id)[0];
      if (!container) return;

      const link = window.Shopify.routes.root + `variants/${variantId}/?section_id=pickup-availability`;
      Alpine.store('xHelper').cancelRequest('eurus:pickup_availability_request');
      if (this.cachedResults[link]) {
        container.innerHTML = this.cachedResults[link].innerHTML;
      } else {
        const controller = new AbortController();
        Alpine.store('xHelper').requestControllers.set('eurus:pickup_availability_request', controller);
        fetch(link, { signal: controller.signal })
        .then(response => response.text())
        .then(text => {
          const pickupAvailabilityHTML = new DOMParser()
            .parseFromString(text, 'text/html')
            .querySelector('.shopify-section');  
          this.cachedResults[link] = pickupAvailabilityHTML;
          container.innerHTML = pickupAvailabilityHTML.innerHTML;
        })
        .catch(e => {
          console.error(e);
        }); 
      }
    }
  });

  Alpine.store('xUpdateVariantQuanity', {
    cachedResults: [],
    updateQuantity(sectionId, productUrl, currentVariant) {
      const quantity = document.getElementById('x-quantity-' + sectionId);
      const pricingPB = document.getElementById('x-pricing-progress-bar-' + sectionId);
      if (!quantity && !pricingPB) return;
      const url = currentVariant ? `${productUrl}?variant=${currentVariant}&section_id=${sectionId}` : `${productUrl}?section_id=${sectionId}`;
      Alpine.store('xHelper').cancelRequest('eurus:variant_quantity_request');
      if (this.cachedResults[url]) {
        this.render(this.cachedResults[url], sectionId);
      } else {
        const controller = new AbortController();
        Alpine.store('xHelper').requestControllers.set('eurus:variant_quantity_request', controller);
        fetch(url, { signal: controller.signal })
          .then((response) => response.text())
          .then((responseText) => {
            let html = new DOMParser().parseFromString(responseText, 'text/html');
            this.cachedResults[url] = html;
            this.render(html, sectionId);
          });
      }
    },
    render(html, sectionId) {
      const destination = document.getElementById('x-quantity-' + sectionId);
      const source = html.getElementById('x-quantity-'+ sectionId);
      if (source && destination) destination.innerHTML = source.innerHTML;

      const destinationPricingPB = document.getElementById('x-pricing-progress-bar-' + sectionId);
      const sourcePricingPB = html.getElementById('x-pricing-progress-bar-' + sectionId);
      if (sourcePricingPB && destinationPricingPB) destinationPricingPB.innerHTML = sourcePricingPB.innerHTML;     
    }
  });

  Alpine.store('xVideo', {
    ytIframeId: 0,
    vimeoIframeId: 0,
    externalListened: false,

    nativeControlsHandled(video, event) {
      return !!(event && video && video.tagName == 'VIDEO' && video.controls && video.contains(event.target));
    },
    togglePlay(el, event) {
      const videoContainer = el.closest('.external-video');
      let video = el.getElementsByClassName('video')[0];
      if (!video && el.closest('.contain-video')) {
        video = el.closest('.contain-video').getElementsByClassName('video')[0];
      }
      if (this.nativeControlsHandled(video, event)) return;
      if (video) {
        if (videoContainer) {
          video.paused ? videoContainer.classList.remove('function-paused') : videoContainer.classList.add('function-paused');
          const buttonPlay = videoContainer.getElementsByClassName('button-play')[0];
          if (buttonPlay) {
            video.paused ? buttonPlay.classList.remove('hidden') : buttonPlay.classList.add('hidden');
          }  
        }
        video.paused ? this.play(el) : this.pause(el);
      }
    },
    play(el, retry = 0) {
      const videoContainer = el.closest('.external-video');
      let video = el.getElementsByClassName('video')[0];
      if (!video && el.closest('.contain-video')) {
        video = el.closest('.contain-video').getElementsByClassName('video')[0];
      }
      if (video) {
        if (videoContainer) {
          const buttonPlay = videoContainer.getElementsByClassName('button-play')[0];
          if (video.tagName == 'IFRAME') {
            if (videoContainer.classList.contains('function-paused')) this.externalPostCommand(video, 'play');
            videoContainer.classList.remove('function-paused');
          } else if (video.tagName == 'VIDEO') {
            if (!videoContainer.classList.contains('function-paused')) {
              if (buttonPlay) buttonPlay.classList.add('hidden');
              video.play().catch((error) => {
                if (buttonPlay) buttonPlay.classList.remove('hidden');
              });
            }
          }
        }
      } else if (retry < 5) {
        setTimeout(() => {
          this.play(el, ++retry);
        }, 50)
      }
    },
    pause(el) {
      const videoContainer = el.closest('.external-video');
      let video = el.getElementsByClassName('video')[0];
      if (!video && el.closest('.contain-video')) {
        video = el.closest('.contain-video').getElementsByClassName('video')[0];
      }
      if (video) {
        if (videoContainer) {
          const buttonPlay = videoContainer.getElementsByClassName('button-play')[0];
          if (video.tagName == 'IFRAME') {
            if (!videoContainer.classList.contains('paused')) {
              videoContainer.classList.add('function-paused');
            }
            this.externalPostCommand(video, 'pause');
          } else if (video.tagName == 'VIDEO') {
            if (buttonPlay && (!video.controls || videoContainer.querySelector('.img-thumbnail:not(.hidden)'))) {
              buttonPlay.classList.remove('hidden');
            }
            video.pause();
          }
        }
      }
    },
    load(el) {
      el?.classList.add('active');
      el?.closest('.animate_transition_card__image')?.classList.remove('animate-Xpulse', 'skeleton-image');
      setTimeout(() => { el.closest('.animate_transition_card__image')?.classList.add('lazy_active'); }, 250);  
    },
    mp4Thumbnail(el, event) {
      let video = el.getElementsByClassName('video')[0];
      if (!video && el.closest('.contain-video')) {
        video = el.closest('.contain-video').getElementsByClassName('video')[0];
      }
      if (this.nativeControlsHandled(video, event)) return;
      if (video && video.tagName == 'VIDEO' && video.paused) {
        video.addEventListener('playing', () => this.removeThumbnail(el), { once: true });
      } else {
        this.removeThumbnail(el);
      }
      this.togglePlay(el);
    },
    removeThumbnail(el){
      const videoContainer = el.closest('.external-video');
      const imgThumbnail = videoContainer.getElementsByClassName('img-thumbnail')[0];
      const imgThumbnailMobile = videoContainer.getElementsByClassName('img-thumbnail')[1];
      if (imgThumbnail) {
        imgThumbnail.classList.add('hidden');
        imgThumbnail.classList.add('md:hidden');
      }
      if (imgThumbnailMobile) {
        imgThumbnailMobile.classList.add('hidden');
      }
    },
    externalLoad(el, host, id, loop, title, controls = 1) {
      let src = '';
      let pointerEvent = '';
      if (host == 'youtube') {
        src = `https://www.youtube.com/embed/${id}?mute=1&playlist=${id}&autoplay=1&playsinline=1&enablejsapi=1&modestbranding=1&rel=0&controls=${controls}&showinfo=${controls}`;
      } else {
        src = `https://player.vimeo.com/video/${id}?muted=1&autoplay=1&playsinline=1&api=1&controls=${controls}`;
      }

      if (controls == 0) {
        pointerEvent = " pointer-events-none";
      }
      requestAnimationFrame(() => {
        const videoContainer = el.closest('.external-video');
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);
        const borderRadiusClass = (isIOS && videoContainer.classList.contains('rounded-[10px]')) ? 'rounded-[10px]' : '';
        videoContainer.innerHTML = `<iframe data-video-loop="${loop}" class="iframe-video absolute w-full h-full video top-1/2 -translate-y-1/2 ${borderRadiusClass} ${pointerEvent}"
          frameborder="0" host="${host}" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen playsinline
          src="${src}" title="${title}"></iframe>`;

        videoContainer.querySelector('.iframe-video').addEventListener("load", () => {
          setTimeout(() => {
            this.play(videoContainer);

            if (host == 'youtube') {
              this.ytIframeId++;
              videoContainer.querySelector('.iframe-video').contentWindow.postMessage(JSON.stringify({
                event: 'listening',
                id: this.ytIframeId,
                channel: 'widget'
              }), '*');
              videoContainer.querySelector('.iframe-video').contentWindow.postMessage(JSON.stringify({
                event: 'command',
                func: 'addEventListener',
                args: ['onStateChange'],
                id: this.ytIframeId,
                channel: 'widget'
              }), '*');
            } else {
              this.vimeoIframeId++;
              videoContainer.querySelector('.iframe-video').contentWindow.postMessage(JSON.stringify({
                method: 'addEventListener',
                value: 'finish'
              }), '*');
              videoContainer.querySelector('.iframe-video').contentWindow.postMessage(JSON.stringify({
                method: 'addEventListener',
                value: 'play'
              }), '*');
              videoContainer.querySelector('.iframe-video').contentWindow.postMessage(JSON.stringify({
                method: 'addEventListener',
                value: 'pause'
              }), '*');
              videoContainer.querySelector('.iframe-video').contentWindow.postMessage(JSON.stringify({
                method: 'addEventListener',
                value: 'playProgress'
              }), '*')
            }
          }, 100);
        });
      });

      this.externalListen();
    },
    renderVimeoFacade(el, id, options) {
      fetch(`https://vimeo.com/api/oembed.json?url=https://vimeo.com/${id}&width=${options.width}`)
        .then(reponse => {
          return reponse.json();
        }).then((response) => {
          const html = `
            <picture>
              <img src="${response.thumbnail_url}" loading="lazy" class="w-full h-full object-cover" alt="${options.alt}" width="${response.width}" height="${response.height}"/>
            </picture>
          `;
          
          requestAnimationFrame(() => {
            el.innerHTML = html;
          });
        });
    },
    externalListen() {
      if (!this.externalListened) {
        window.addEventListener('message', (event) => {
          var iframes = document.getElementsByTagName('IFRAME');

          for (let i = 0, iframe, win, message; i < iframes.length; i++) {
            iframe = iframes[i];

            // Cross-browser way to get iframe's window object
            win = iframe.contentWindow || iframe.contentDocument.defaultView;

            if (win === event.source) {
              if (event.origin == 'https://www.youtube.com') {
                message = JSON.parse(event.data);
                if (iframe.getAttribute('data-video-loop') === 'true') {
                  if (message.info && message.info.playerState == 0) {
                    this.externalPostCommand(iframe, 'play');
                  }  
                }
                if (message.info && message.info.playerState == 1) {
                  iframe.parentNode.classList.remove('paused');
                  iframe.parentNode.classList.remove('function-paused');
                }
                if (message.info && message.info.playerState == 2) {
                  iframe.parentNode.classList.add('paused');
                }
              }

              if (event.origin == 'https://player.vimeo.com') {
                message = JSON.parse(event.data);
                if (iframe.getAttribute('data-video-loop') !== 'true') {
                  if (message.event == "finish") {
                    this.externalPostCommand(iframe, 'play');
                  }
                }
                if (message.event === 'play') {
                  iframe.parentNode.classList.remove('paused');
                  iframe.parentNode.classList.remove('function-paused');
                }
                if (message.event === 'pause') {
                  iframe.parentNode.classList.add('paused');
                }
              }
            }
          }
        });

        this.externalListened = true;
      }
    },
    externalPostCommand(iframe, cmd) {
      const host = iframe.getAttribute('host');
      const command = host == 'youtube' ? {
        "event": "command",
        "func": cmd + "Video"
      } : {
        "method": cmd,
        "value": "true"
      };

      iframe.contentWindow.postMessage(JSON.stringify(command), '*');
    },
    toggleMute(el) {
      let video = el.closest('.video-hero') && el.closest('.video-hero').getElementsByClassName('video')[0];
      if (!video && el.closest('.contain-video')) {
        video = el.closest('.contain-video').getElementsByClassName('video')[0];
      }
      if (video) {
          if (video.tagName != 'IFRAME') {
            video.muted = !video.muted;
          }
      }
    }
  });

  Alpine.data('xShippingPolicy', (url) => ({
    show: false,
    htmlInner: '',
    loadShipping() {
      this.show = true;
      Alpine.store('xPopup').open = true;
      fetch(url)
        .then(response => response.text())
        .then(data => {
          const parser = new DOMParser();
          const text = parser.parseFromString(data, 'text/html');
          this.htmlInner = text.querySelector('.shopify-policy__container').innerHTML;
        })
    },
    shippingFocus() {
      Alpine.store('xFocusElement').trapFocus('ShippingPolicyPopup','CloseShopping');
    },
    shippingRemoveFocus() {
      const activeElement = document.getElementById('LoadShoppingPolicy');
      Alpine.store('xFocusElement').removeTrapFocus(activeElement);
    }
  }));
  
  Alpine.data('xScrollPromotion', () => ({
    animationFrameId: null,
    window_height: 0,
    load(el) {
      this.window_height = window.xViewport.innerHeight;
      
      const container = el.getElementsByClassName('scrolling-container')[0];
      const item = container.getElementsByClassName('el_animate')[0];
      const frag = document.createDocumentFragment();
      for (let i = 0; i < 8; i++) {
        const clone = item.cloneNode(true);
        frag.appendChild(clone);
      }
      container.appendChild(frag);
      let scroll = el.getElementsByClassName('el_animate');
      for (let i = 0; i < scroll.length; i++) {
        scroll[i].classList.add('animate-scroll-banner');
      }
    },
    createObserver(el, rtlCheck = false) {
      const option = {
        root: null,
        rootMargin: '300px',
        threshold: 0
      };
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            this.updateRotation(el, rtlCheck)
          } else {
            if (this.animationFrameId) {
              cancelAnimationFrame(this.animationFrameId);
              this.animationFrameId = null;
            }
          }
        });
      }, option);
      observer.observe(el);
    },
    updateRotation(el, rtlCheck = false) {
      const update = () => {
        const element = el.firstElementChild;
        if (!element) return;
        const element_rect = element.getBoundingClientRect();
        const element_height = element_rect.top + element_rect.height / 2;
        let value;
          
        if (element_height > -200 && element_height < this.window_height + 200) {
          value = Math.max(Math.min((((element_height / this.window_height) * 10) - 5), 5), -5);
          if (rtlCheck) value *= -1;
          element.style.transform = `rotate(${value}deg) translateX(-20px)`;
        }
        this.animationFrameId = window.requestAnimationFrame(update);
      }
      if (!this.animationFrameId) {
        update();
      }
    },
  }));    

  Alpine.data('xCartFields', (isCartDrawer, currentLanguage, excludeDay, holidayList, dateFormat) => ({
    customField: '',
    customFieldLabel: '',
    customFieldRequired: false,
    customFieldError: false,          
    openField: false,
    t: '',
    cartDeliveryDateField: '',
    deliveryDateFieldError: false,
    deliveryDateString: 'Select date',   
    tDeliveryDate: '',
    deliveryDateValidationError: false,
    loadData() {
      const data = xParseJSON(this.$el.getAttribute('x-cart-fields-data'));

      this.customField = localStorage.cart_custom_field ? localStorage.cart_custom_field : '';
      this.customFieldLabel = data.custom_field_label;
      this.customFieldRequired = data.custom_field_required;
      this.custom_field_pattern = new RegExp(data.custom_field_pattern);
      this.save();

      if (!isCartDrawer) {
        document.getElementById("x-cart-custom-field").addEventListener("focusout", (event) => {
          this.save();
        });
      }

      document.addEventListener('eurus:cart:validate', (e) => {
        this.customField = localStorage.cart_custom_field ? localStorage.cart_custom_field : '';
        if (this.customFieldRequired && (!this.customField || this.customField.length == 0)
          || (this.customField && !this.customField.match(this.custom_field_pattern))) {
          this.customFieldError = true;              
          Alpine.store('xCartHelper').validated = false;
          if (e.detail.isCheckOut) {
            Alpine.store('xCartHelper').openField = 'custom_field'
          }
        } else {
          this.customFieldError = false;
        }
      });
    },
    save(custom_field_value) {
      clearTimeout(this.t);

      if (custom_field_value) {
        this.customField = custom_field_value
      }
      const func = () => {
        var attributes = { attributes: {} }
        attributes.attributes[this.customFieldLabel] = this.customField;
        Alpine.store('xCartHelper').updateCart(attributes, true);
        localStorage.cart_custom_field = this.customField;
      }
      
      this.t = setTimeout(() => {
        func();
      }, 200);
    },
    loadDeliveryFieldData(required) {
      this.cartDeliveryDateField = localStorage.cart_delivery_date_field ? localStorage.cart_delivery_date_field : '';
      const deliveryDateInputEl = document.getElementById('x-cart-delivery-date-field');
      if (deliveryDateInputEl) {
        this.deliveryDateValidate(this.cartDeliveryDateField, deliveryDateInputEl);
        this.saveDeliveryDateField();
      }
      
      document.addEventListener('eurus:cart:validate', (e) => {           
        this.cartDeliveryDateField = localStorage.cart_delivery_date_field ? localStorage.cart_delivery_date_field : '';
        if (this.cartDeliveryDateField && isCartDrawer) {
          const date = new Date(this.cartDeliveryDateField);
          const dayOfTheMonth = date.getDate();
          const fullMonth = new Intl.DateTimeFormat(`${currentLanguage}`, { month: "long" }).format(date);
          if (dateFormat == 'mm-dd') {
            this.deliveryDateString = `${fullMonth} ${dayOfTheMonth < 10 ? `0${dayOfTheMonth}` : dayOfTheMonth}`;
          } else {
            this.deliveryDateString = `${dayOfTheMonth < 10 ? `0${dayOfTheMonth}` : dayOfTheMonth} ${fullMonth}`;
          }
        }
        if (required && (!this.cartDeliveryDateField || this.cartDeliveryDateField.length == 0)) {
          this.deliveryDateFieldError = true;      
          this.deliveryDateValidationError = false;       
          Alpine.store('xCartHelper').validated = false;
          if (e.detail.isCheckOut) {
            Alpine.store('xCartHelper').openField = 'delivery_date_field'
          }
        } else {
          this.deliveryDateFieldError = false;
        }
      });
    },
    _getNextValidDate(date, minDate, maxDate) {
      const holidayArray = holidayList ? holidayList.split(',').map(holiday => holiday.trim()) : [];
      let isInvalid = true;

      while (isInvalid) {
        isInvalid = false;
        // Weekend check
        if (excludeDay === 'saturday_sunday' && (date.getDay() === 6 || date.getDay() === 0)) {
          if (date.getDay() === 6) {
            date.setDate(date.getDate() + 2);
          } else {
            date.setDate(date.getDate() + 1);
          }
          this.deliveryDateValidationError = true;
          this.deliveryDateFieldError = false;
          isInvalid = true;
          continue;
        }

        if (excludeDay === 'saturday' && date.getDay() === 6) {
          date.setDate(date.getDate() + 1);
          this.deliveryDateValidationError = true;
          this.deliveryDateFieldError = false;
          isInvalid = true;
          continue;
        }

        if (excludeDay === 'sunday' && date.getDay() === 0) {
          date.setDate(date.getDate() + 1);
          this.deliveryDateValidationError = true;
          this.deliveryDateFieldError = false;
          isInvalid = true;
          continue;
        }
        // Holiday check
        if (holidayArray.length > 0) {
          const dayOfMonth = date.getDate();
          const monthName = new Intl.DateTimeFormat(currentLanguage, { month: "long" }).format(date);
          const dateString = `${monthName} ${dayOfMonth < 10 ? `0${dayOfMonth}` : dayOfMonth}`;

          if (holidayArray.includes(dateString)) {
            date.setDate(date.getDate() + 1);
            this.deliveryDateValidationError = true;
            this.deliveryDateFieldError = false;
            isInvalid = true;
            continue;
          }
        }

        // Out of range check
        if ((minDate && date < minDate) || (maxDate && date > maxDate)) {
          if (date < minDate) {
            date = new Date(minDate.getTime());
          }
          if (date > maxDate) {
            date = new Date(maxDate.getTime());
          }
          this.deliveryDateValidationError = true;
          this.deliveryDateFieldError = false;
          isInvalid = true;
          break;
        }
      }
      return date;
    },
    deliveryDateValidate(value, el) {
      if (value) {
        let date = new Date(value);
        const maxDate = new Date(el.max);
        const minDate = new Date(el.min);
        date = this._getNextValidDate(date, minDate, maxDate);
        this.cartDeliveryDateField = date.toISOString().split("T")[0];
      }
    },
    saveDeliveryDateField(delivery_date_field_value, isCartPage) {
      clearTimeout(this.tDeliveryDate);

      if (delivery_date_field_value) {
        this.cartDeliveryDateField = delivery_date_field_value
      }
      const func = () => {
        const deliveryDateInputEl = document.getElementById('x-cart-delivery-date-field');
        if (deliveryDateInputEl) {
          this.deliveryDateValidate(this.cartDeliveryDateField, deliveryDateInputEl);
        }
        if (isCartDrawer && this.cartDeliveryDateField) {
          const date = new Date(this.cartDeliveryDateField);
          const dayOfTheMonth = date.getDate();
          const fullMonth = new Intl.DateTimeFormat(`${currentLanguage}`, { month: "long" }).format(date);
          if (dateFormat == 'mm-dd') {
            this.deliveryDateString = `${fullMonth} ${dayOfTheMonth < 10 ? `0${dayOfTheMonth}` : dayOfTheMonth}`;
          } else {
            this.deliveryDateString = `${dayOfTheMonth < 10 ? `0${dayOfTheMonth}` : dayOfTheMonth} ${fullMonth}`;
          }
        }
        var attributes = { attributes: {} }
        attributes.attributes['Delivery date'] = this.cartDeliveryDateField;
        Alpine.store('xCartHelper').updateCart(attributes, true);
        localStorage.cart_delivery_date_field = this.cartDeliveryDateField;
        if (!isCartPage) {
          this.deliveryDateValidationError = false;
        }
      }
      
      this.tDeliveryDate = setTimeout(() => {
        func();
      }, 200);
    },
  }));
  
  Alpine.data('xCartTerm', (message) => ({
    message: message,
    checked: false,
    init() {
      this.checked = localStorage.cart_term_checked == 'agreed' ? true : false;

      this.$watch('checked', () => {
        this.save();
      });

      document.addEventListener('eurus:cart:validate', () => {
        this.checked = localStorage.cart_term_checked == 'agreed' ? true : false;
        if (!this.checked) Alpine.store('xCartHelper').validated = false;
      });
    },
    save() {
      clearTimeout(this.t);

      const func = () => {
        var status = this.checked ? 'agreed' : 'not agreed';
        Alpine.store('xCartHelper').updateCart({
          attributes: {
            'Terms and conditions': status
          }
        });
        localStorage.cart_term_checked = status;
      }
      
      this.t = setTimeout(() => {
        func();
      }, 200);
    }
  }));

  Alpine.data("xCouponCodeList", (sectionId) => ({
    loading: true,
    load() {
      this.loading = true;
      let url = `${window.location.pathname}?section_id=${sectionId}`;
      fetch(url, {
        method: 'GET'
      }).then(
        response => response.text()
      ).then(responseText => {
        const html = (new DOMParser()).parseFromString(responseText, 'text/html');
        const contentId = `x-promo-code-list-${sectionId}`;
        const newContent = html.getElementById(contentId);
        if (newContent && !document.getElementById(contentId)) {
          container.appendChild(newContent);
        }
        this.loading = false;
      })
    }
  }));

  Alpine.data("xCouponCode", (freeShippingCodes) => ({
    copySuccess: false,
    loading: false,
    disableCoupon: false,
    disableComing: false,
    discountCode: "",
    errorMessage: false,
    appliedDiscountCode: false,
    onDiscountCodeChange: null,
    emptyCartErrorTimer: null,
    load(discountCode) {
      this.setAppliedButton(discountCode)
      if (this.onDiscountCodeChange) {
        document.removeEventListener(`eurus:cart:discount-code:change`, this.onDiscountCodeChange)
      }
      this.onDiscountCodeChange = () => { this.setAppliedButton(discountCode) };
      document.addEventListener(`eurus:cart:discount-code:change`, this.onDiscountCodeChange)
    },
    destroy() {
      if (this.onDiscountCodeChange) {
        document.removeEventListener(`eurus:cart:discount-code:change`, this.onDiscountCodeChange)
        this.onDiscountCodeChange = null;
      }
      clearTimeout(this.emptyCartErrorTimer);
    },
    copyCode() {
      if (this.copySuccess) return;

      const discountCode = this.$refs.code_value.textContent.trim();
      navigator.clipboard.writeText(discountCode).then(
        () => {
          this.copySuccess = true;
          const copyEvent = new Event('copy');
          document.dispatchEvent(copyEvent);
          
          setTimeout(() => {
            this.copySuccess = false;
          }, 5000);
        },
        () => {
          this.showTooltip(this.$el);
        }
      );
    },
    showTooltip(el) {
      const tooltip = document.createElement("div");
      el.classList.add("relative", "pointer-events-none");
      if (el.classList.contains('overflow-hidden')) {
        el.classList.remove('overflow-hidden');
        var classOverflow = true;
      }
      tooltip.className = "tooltip-copy";
      let text = el.getAttribute("data-message");
      tooltip.innerHTML = `<span class="line-clamp-2">${text}</span>`;
      el.appendChild(tooltip);
      setTimeout(() => {
        tooltip.remove();
        el.classList.remove("relative", "pointer-events-none");
        classOverflow && el.classList.add("overflow-hidden");
      }, 3000);
    },
    showEmptyCartError() {
      const elementError = this.$el.closest('.promo-code-item')?.querySelector('.error-message');
      this.errorMessage = true;
      clearTimeout(this.emptyCartErrorTimer);
      if (!elementError) {
        Alpine.store('xCouponCodeDetail').discountFaild = true;
        this.emptyCartErrorTimer = setTimeout(() => {
          this.errorMessage = false;
          Alpine.store('xCouponCodeDetail').discountFaild = false;
        }, 5000);
        return;
      }
      elementError.classList.remove('hidden', 'opacity-0');
      elementError.classList.add('block', 'opacity-100');
      this.emptyCartErrorTimer = setTimeout(() => {
        this.errorMessage = false;
        elementError.classList.remove('block', 'opacity-100');
        elementError.classList.add('hidden', 'opacity-0');
      }, 3000);
    },
    applyCouponCode(discountCode, isCart=false) {
      Alpine.store('xCouponCodeDetail').discountFaild = false;
      Alpine.store('xCouponCodeDetail').discountApplied = false;
      Alpine.store('xCouponCodeDetail').discountCorrect = false;
      Alpine.store('xCouponCodeDetail').getDiscountCode();
      let appliedDiscountCodes = JSON.parse(JSON.stringify(Alpine.store('xCouponCodeDetail').appliedDiscountCodes));
      const appliedDiscount = document.querySelectorAll(".discount-title:not(.hidden)");
      let checkedDiscount = false;
      if (appliedDiscount.length > 0) {
        appliedDiscount.forEach((discount) => {
          if (discount.innerText.toLowerCase() == discountCode.toLowerCase()) checkedDiscount = true;
        });
      }
      if (freeShippingCodes) {
        if (freeShippingCodes.includes(discountCode)) {
          Alpine.store('xCouponCodeDetail').freeShippingApplied = true;
          setTimeout(() => {
            Alpine.store('xCouponCodeDetail').freeShippingApplied = false;
          }, 5000);
          return;
        }
      }

      if (checkedDiscount) {
        Alpine.store('xCouponCodeDetail').discountApplied = true;
        const discountField = document.getElementById("x-cart-discount-field");
        if (discountField) discountField.value = '';
        this.discountCode = '';
        setTimeout(() => {
          Alpine.store('xCouponCodeDetail').discountApplied = false;
        }, 3000);
        return true;
      }

      if (Alpine.store('xCouponCodeDetail').cartEmpty) {
        this.showEmptyCartError();
        return;
      }

      if (discountCode) {
        let discountCodes = appliedDiscountCodes.length > 0 ? [...new Set([...appliedDiscountCodes, discountCode])].join(",") : discountCode;
        this.loading = true;
        return Alpine.store('xCartHelper').withCartLock((standardEvent) => fetch(`${Shopify.routes.root}cart/update.js`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            "discount": discountCodes,
            "sections":  Alpine.store('xCartHelper').getSectionsToRender().map((section) => section.id)
          }),
        }).then(response=>{
          return Alpine.store('xCartHelper').cartJson(response);
        }).then((response) => {
          standardEvent.settle(response, Alpine.store('xCartHelper').userErrorsFrom(response));
          if (response.status != '422') {
            Alpine.store('xCartHelper').reRenderSections(response.sections);
            Alpine.store('xCouponCodeDetail').appliedDiscountCodes = []
            response.discount_codes.forEach(code => {
              if (code.applicable) {
                Alpine.store('xCouponCodeDetail').appliedDiscountCodes.push(code.code);
                if (code.code === discountCode) {
                  checkedDiscount = true;
                }
              }
            })
            document.cookie = `eurus_discount_code=${Alpine.store('xCouponCodeDetail').appliedDiscountCodes}; path=/`;
            if (checkedDiscount) {
              Alpine.store('xCouponCodeDetail').discountCorrect = true;
            } else {
              Alpine.store('xCouponCodeDetail').discountFaild = true;
            }
            if (checkedDiscount && !Alpine.store('xCouponCodeDetail').appliedDiscountCodes.includes(discountCode)) {
              Alpine.store('xCouponCodeDetail').appliedDiscountCodes.push(discountCode);
            }
            Alpine.store('xCartHelper').currentItemCount = response.item_count;
            Alpine.store('xCouponCodeDetail').cartEmpty = response.item_count === 0;
            document.dispatchEvent(new CustomEvent(`eurus:cart:discount-code:change`));
            if (isCart == false) {
              this.setAppliedButton(discountCode)
              if (!checkedDiscount && response.item_count === 0) {
                this.showEmptyCartError();
              } else {
                this.errorMessage = false;
                if (response.item_count > 0) Alpine.store('xMiniCart').openCart();
              }
            }
          }
        }).finally(() => {
          this.loading = false;
          Alpine.store('xCouponCodeDetail').removedDiscountCode = '';
          setTimeout(() => {
            Alpine.store('xCouponCodeDetail').discountFaild = false;
          }, 5000);
          setTimeout(() => {
            Alpine.store('xCouponCodeDetail').discountCorrect = false;
          }, 3000);
        }), {
          type: 'shopify:cart:discount-update',
          context: 'cart',
          discountCodes: discountCodes.split(',').filter(Boolean).map((code) => ({ code: code }))
        });
      }
    },
    handleScheduleCoupon(el) {
      let settings = xParseJSON(el.getAttribute('x-countdown-data'));
      let timeSettings = Alpine.store('xHelper').handleTime(settings);
      if (timeSettings.distance < 0 && settings.set_end_date) {
        this.disableCoupon = true;
      } else if ( timeSettings.startTime > timeSettings.now) {
        this.disableCoupon = true;
        this.disableComing = true;
      }
    },
    onChange() {
      this.discountCode = this.$el.value;
    },
    applyDiscountToCart() {
      this.applyCouponCode(this.discountCode, true);
    },
    undoRemoveDiscount() {
      this.applyCouponCode(Alpine.store('xCouponCodeDetail').removedDiscountCode, true);
    },
    setAppliedButton(discountCode) {
      let appliedDiscountCodes = JSON.parse(JSON.stringify(Alpine.store('xCouponCodeDetail').appliedDiscountCodes))
      const currentCode = discountCode ? discountCode.toLowerCase() : '';
      if (currentCode && appliedDiscountCodes.some(code => String(code).toLowerCase() === currentCode)) {
        this.appliedDiscountCode = true;
      } else {
        this.appliedDiscountCode = false;
      }
    }
  }));

  Alpine.store('xCouponCodeDetail', {
    show: false,
    promoCodeDetail: {},
    sectionID: "",
    discountCodeApplied: "",
    appliedDiscountCodes: [],
    removedDiscountCode: '',
    cachedResults: [],
    loading: false,
    cartEmpty: null,
    discountFaild: false,
    discountApplied: false,
    freeShippingApplied: false,
    discountCorrect: false,
    init() {
      const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1000));
      idle(() => {
        fetch(`${Shopify.routes.root}cart.js`)
          .then((response) => (response.ok ? response.json() : null))
          .then((cart) => {
            if (cart) this.cartEmpty = cart.item_count === 0;
          })
          .catch(() => {});
      });
      document.addEventListener('shopify:cart:lines-update', (event) => {
        event.promise
          .then(({ cart }) => {
            if (cart) this.cartEmpty = cart.totalQuantity === 0;
          })
          .catch(() => {});
      }, true);
    },
    handleCouponSelect(shopUrl) {
      var _this = this;
      const promoCodeDetail = JSON.parse(JSON.stringify(this.promoCodeDetail));

      document.addEventListener('shopify:section:select', function(event) {
        if (event.target.classList.contains('section-promo-code') == false) {
          if (window.Alpine) {
            _this.close();
          } else {
            document.addEventListener('alpine:initialized', () => {
              _this.close();
            });
          }
        }
      })

      if(promoCodeDetail && promoCodeDetail.blockID && promoCodeDetail.sectionID) {
        this.promoCodeDetail = xParseJSON(document.getElementById('x-data-promocode-' + promoCodeDetail.blockID).getAttribute('x-data-promocode'));
        let contentContainer = document.getElementById('PromoCodeContent-' + this.promoCodeDetail.sectionID);
        if (this.cachedResults[this.promoCodeDetail.blockID]) {
          contentContainer.innerHTML = this.cachedResults[this.promoCodeDetail.blockID];
          return true;
        }
        if (this.promoCodeDetail.page != '') {
          let url = `${shopUrl}/pages/${this.promoCodeDetail.page}`;
          fetch(url, {
            method: 'GET'
          }).then(
            response => response.text()
          ).then(responseText => {
            const html = (new DOMParser()).parseFromString(responseText, 'text/html');
            contentContainer.innerHTML = html.querySelector(".page__container .page__body")?.innerHTML;
          })
        } else if (this.promoCodeDetail.details != '') {
          contentContainer.innerHTML = this.promoCodeDetail.details;
          contentContainer.innerHTML = contentContainer.textContent;
        }
      }
    },
    load(el, blockID, shopUrl) {
      this.promoCodeDetail = xParseJSON(el.closest('#x-data-promocode-' + blockID).getAttribute('x-data-promocode'));
      let contentContainer = document.getElementById('PromoCodeContent-' + this.promoCodeDetail.sectionID);
      this.sectionID = this.promoCodeDetail.sectionID;
      if (this.cachedResults[blockID]) {
        contentContainer.innerHTML = this.cachedResults[blockID];
        return true;
      }
      if (this.promoCodeDetail.page != '') {
        this.loading = true;
        let url = `${shopUrl}/pages/${this.promoCodeDetail.page}`;
        fetch(url, {
          method: 'GET'
        }).then(
          response => response.text()
        ).then(responseText => {
          const html = (new DOMParser()).parseFromString(responseText, 'text/html');
          const content = html.querySelector(".page__container .page__body")?.innerHTML;
          contentContainer.innerHTML = content;
          this.cachedResults[blockID] = content;
        }).finally(() => {
          this.loading = false;
        })
      } else if (this.promoCodeDetail.details != '') {
        contentContainer.innerHTML = this.promoCodeDetail.details;
        contentContainer.innerHTML = contentContainer.textContent;
      }
    },
    showPromoCodeDetail() {
      this.show = true;
      Alpine.store('xPopup').open = true;
    },
    close() {
      this.show = false;
      Alpine.store('xPopup').close();
    },
    removeDiscountCode(el, isCart=false) {
      Alpine.store('xCouponCodeDetail').discountFaild = false;
      Alpine.store('xCouponCodeDetail').discountApplied = false;
      Alpine.store('xCouponCodeDetail').discountCorrect = false;
      
      this.getDiscountCode();

      const discountCode = el.closest('li.x-discount').querySelector('.discount-title:not(.hidden)').textContent.toLowerCase();

      let discountIndex = this.appliedDiscountCodes.findIndex(code => code.toLowerCase() === discountCode);
      if (discountIndex !== -1) {
        this.appliedDiscountCodes.splice(discountIndex, 1);
      } 

      this.loading = true;
      const remainingCodes = this.appliedDiscountCodes.slice();
      return Alpine.store('xCartHelper').withCartLock((standardEvent) => fetch(`${Shopify.routes.root}cart/update.js`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          "discount": this.appliedDiscountCodes.join(','),
          "sections":  Alpine.store('xCartHelper').getSectionsToRender().map((section) => section.id)
        }),
      }).then(response=>{
        return Alpine.store('xCartHelper').cartJson(response);
      }).then((response) => {
        standardEvent.settle(response, Alpine.store('xCartHelper').userErrorsFrom(response));
        if (response.status != '422') {
          Alpine.store('xCartHelper').reRenderSections(response.sections);
          this.appliedDiscountCodes = []
          response.discount_codes.forEach(code => {
            if (code.applicable) this.appliedDiscountCodes.push(code.code);
          })
          document.cookie = `eurus_discount_code=${this.appliedDiscountCodes}; path=/`;
          Alpine.store('xCartHelper').currentItemCount = response.item_count;
          this.cartEmpty = response.item_count === 0;
          document.dispatchEvent(new CustomEvent(`eurus:cart:discount-code:change`));
          if (isCart == false) {
            if (Alpine.store('xCartHelper').currentItemCount == 0) {
              const elementError = el.closest('.promo-code-item')?.querySelector('.error-message');
              if (elementError) {
                elementError.classList.remove('hidden', 'opacity-0');
                elementError.classList.add('block', 'opacity-100');

                setTimeout(function() {
                  elementError.classList.remove('block', 'opacity-100');
                  elementError.classList.add('hidden', 'opacity-0');
                }, 3000);
              }
            } else {
              Alpine.store('xMiniCart').openCart();
            }
          }
        }
      }).finally(() => {
        this.loading = false;
        this.removedDiscountCode = discountCode;
        setTimeout(() => {
          Alpine.store('xCouponCodeDetail').discountFaild = false;
        }, 5000);
        setTimeout(() => {
          Alpine.store('xCouponCodeDetail').discountCorrect = false;
        }, 3000);
      }), {
        type: 'shopify:cart:discount-update',
        context: 'cart',
        discountCodes: remainingCodes.map((code) => ({ code: code }))
      });
    },
    clearRemovedDiscount() {
      this.removedDiscountCode = '';
    },
    getDiscountCode() {
      let cookieValue = document.cookie.match('(^|;)\\s*' + 'eurus_discount_code' + '\\s*=\\s*([^;]+)');
      let appliedDiscountCodes = cookieValue ? cookieValue.pop() : '';
      if (appliedDiscountCodes) {
        this.appliedDiscountCodes = appliedDiscountCodes.split(",");
      }
    }
  });

  Alpine.data('xImageComparison', (sectionId, layout) => ({
    load(e) {
      if (layout == "horizontal") {
        this.$refs.image.style.setProperty('--compare_' + sectionId, e.target.value + '%');
      } else {
        this.$refs.image.style.setProperty('--compare_vertical_' + sectionId, 100 - e.target.value + '%');
      }
    },
    resizeWindow(el) {
      addEventListener("resize", () => {
        this.setMinMaxInput(el, layout);
      });
    },
    disableScroll(el) {
      let isfocus = true;
      window.addEventListener('wheel', () => {
        if (isfocus) {
          el.blur();
          isfocus = false;
        }
      });
    },
    setMinMaxInput(el) {
      el.min = 0;
      el.max = 100;
    },
    animateValue(el) {
      const targetValue = parseFloat(el.value);
      let currentHorizontalValue = 100;
      let currentVerticalValue = 0; 
      const totalDuration = 1000;
      let startTime = null; 
    
      const easeInOutSlowEnd = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    
      const step = (timestamp) => {
        if (!startTime) startTime = timestamp;
        const elapsedTime = timestamp - startTime;
        const progress = Math.min(elapsedTime / totalDuration, 1);
    
        const easedProgress = easeInOutSlowEnd(progress);
    
        if (layout === "horizontal") {
          currentHorizontalValue = 100 + (targetValue - 100) * easedProgress; 
          el.value = currentHorizontalValue.toFixed(2);
          this.$refs.image.style.setProperty('--compare_' + sectionId, currentHorizontalValue + '%');
    
          if (progress < 1) {
            requestAnimationFrame(step);
          } else {
            el.value = targetValue; 
            this.$refs.image.style.setProperty('--compare_' + sectionId, targetValue + '%');
          }
        } else {
          currentVerticalValue = 0 + (targetValue - 0) * easedProgress; 
          el.value = currentVerticalValue.toFixed(2);
          this.$refs.image.style.setProperty('--compare_vertical_' + sectionId, currentVerticalValue + '%');
    
          if (progress < 1) {
            requestAnimationFrame(step);
          } else {
            el.value = targetValue;
            this.$refs.image.style.setProperty('--compare_vertical_' + sectionId, targetValue + '%');
          }
        }
      };
    
      requestAnimationFrame(step);
    }
  }));

  Alpine.data('xFlexibleAreaImageComparison', (blockId, layout) => ({
    isVertical: layout === 'vertical',
    setOffset(offset) {
      const property = this.isVertical ? '--compare_vertical_' : '--compare_';
      this.$refs.image.style.setProperty(property + blockId, offset + '%');
    },
    offsetFromValue(value) {
      return this.isVertical ? 100 - value : value;
    },
    valueFromOffset(offset) {
      return this.isVertical ? 100 - offset : offset;
    },
    load(e) {
      this.setOffset(this.offsetFromValue(parseFloat(e.target.value)));
    },
    disableScroll(el) {
      const blurOnWheel = () => el.blur();

      window.addEventListener('wheel', blurOnWheel, { once: true });
      el.addEventListener('blur', () => window.removeEventListener('wheel', blurOnWheel), { once: true });
    },
    animateValue(el) {
      const targetOffset = this.offsetFromValue(parseFloat(el.value));
      const startOffset = 100;
      const totalDuration = 1000;
      let startTime = null;

      const easeInOutSlowEnd = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

      const step = timestamp => {
        if (!startTime) startTime = timestamp;
        const progress = Math.min((timestamp - startTime) / totalDuration, 1);

        if (progress < 1) {
          const offset = startOffset + (targetOffset - startOffset) * easeInOutSlowEnd(progress);
          el.value = this.valueFromOffset(offset).toFixed(2);
          this.setOffset(offset);
          requestAnimationFrame(step);
        } else {
          el.value = this.valueFromOffset(targetOffset);
          this.setOffset(targetOffset);
        }
      };

      requestAnimationFrame(step);
    }
  }));

  Alpine.store('xProductComparisonPopup', {
    loadTablet(el, url) {
      if(url) {
        fetch(url)
          .then(response => response.text())
          .then(text => {
            const html = document.createElement('div');
            html.innerHTML = text;
            const recommendations = html.querySelector('.product-comparison-table');
            if (recommendations && recommendations.innerHTML.trim().length) {
              requestAnimationFrame(() => {
                el.innerHTML = recommendations.innerHTML;
                el.getElementsByClassName('content-tablet').forEach((item) => {
                  if (el.querySelector('.'+item.dataset.selectHtml)) {
                    el.querySelector('.'+item.dataset.selectHtml).innerHTML += item.innerHTML;
                  }
                });
              });
            }
          }).catch(e => {console.error(e);});
      }else {
        el.getElementsByClassName('content-tablet').forEach((item) => {
          if (el.querySelector('.'+item.dataset.selectHtml)) {
            el.querySelector('.'+item.dataset.selectHtml).innerHTML += item.innerHTML;
          }
        });
      }
    }
  });
  Alpine.data('xProductCard', (
    sectionId,
    productUrl,
    productId,
    enableB2B
  ) => ({
    enableB2B: enableB2B,
    isSelect: false,
    productId: productId,
    showOptions: false,
    loadingProductEls: '',
    init() {          
      document.addEventListener(`eurus:product-card-variant-select:updated:${sectionId}:${productUrl}`, (e) => {
        this.checkVariantSelected();
        this.loadingProductEls = '';
      });
    },
    checkVariantSelected() {
      const fieldset = [...document.querySelectorAll(`#variant-update-${sectionId} fieldset`)];
      if(fieldset.findIndex(item => !item.querySelector("input:checked")) == "-1") {
        this.isSelect = true;
      }
    }
  }));

  Alpine.data('xFlexibleArea', () => ({
    initArea(el) {
      this.adjustFlexWidths(el);

      let resizeTimer;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          this.adjustFlexWidths(el);
        }, 50);
      });
    },

    adjustFlexWidths(container) {
      const isMobile = window.xViewport.innerWidth <= 767;

      const items = Array.from(container.children).map(el => {
        const itemBlock = el.querySelector('.item-block');
        const itemWidth = parseFloat(isMobile ? itemBlock.dataset.widthMobile : itemBlock.dataset.width) || 0;
        return { el, itemWidth };
      });

      const style = getComputedStyle(container);
      const gap = parseFloat(style.columnGap || style.gap || 0);
      const containerWidth = container.getBoundingClientRect().width;

      let currentRow = [];
      let currentTotal = 0;

      items.forEach(({ el, itemWidth }) => {
        if (currentRow.length && currentTotal + itemWidth > 100) {
          this.applyRowWidths(currentRow, gap, containerWidth);
          currentRow = [{ el, itemWidth }];
          currentTotal = itemWidth;
        } else {
          currentRow.push({ el, itemWidth });
          currentTotal += itemWidth;
        }
      });

      // Last row
      this.applyRowWidths(currentRow, gap, containerWidth);
    },

    applyRowWidths(row, gap, containerWidth) {
      if (!row.length) return;

      const totalGap = gap * (row.length - 1);
      const usableWidth = 100 - (totalGap / containerWidth) * 100;

      row.forEach(({ el, itemWidth }) => {
        el.style.flex = `0 0 ${usableWidth * (itemWidth / 100)}%`;
      });
    }
  }))
});
requestAnimationFrame(() => {
  document.addEventListener('alpine:init', () => {
    Alpine.data('xEventCalendar', (event) => ({
      open: false,
      eventDetails: {},
      addToCal(options) {
        let link = "";
        let timeEnd = ""
        this.eventDetails = event;

        if(!event) {
          this.eventDetails = JSON.parse(JSON.stringify(Alpine.store("xEventCalendarDetail").eventDetail))
        }

        let timeStart = this.handleTime(this.eventDetails.start_year, this.eventDetails.month, this.eventDetails.day, this.eventDetails.start_hour, this.eventDetails.start_minute, options);

        if (this.eventDetails.show_end_date) {
          timeEnd = this.handleTime(this.eventDetails.end_year, this.eventDetails.end_month, this.eventDetails.end_day, this.eventDetails.end_hour, this.eventDetails.end_minute, options);
        } 
        else if (this.eventDetails.show_end_time) {
          timeEnd = this.handleTime(this.eventDetails.start_year, this.eventDetails.month, this.eventDetails.day, this.eventDetails.end_hour, this.eventDetails.end_minute, options);
        }
        else {
          timeEnd = timeStart;
        }

        switch (options) {
          case 'apple':
            this.createDownloadICSFile(0, timeStart, timeEnd, this.eventDetails.title, this.eventDetails.details, this.eventDetails.location, "apple");
            break;
          case 'google':
            link = "http://www.google.com/calendar/event?action=TEMPLATE&trp=false" + "&text=" + encodeURIComponent(this.eventDetails.title) + "&dates=" + timeStart + "/" +  timeEnd + "&location=" + encodeURIComponent(this.eventDetails.location) + "&details=" + encodeURIComponent(this.eventDetails.details);
            window.open(link);
            break;
          case 'outlook':
            link = "https://outlook.live.com/calendar/action/compose?rru=addevent" + "&startdt=" + timeStart + "&enddt=" + timeEnd + "&subject=" + encodeURIComponent(this.eventDetails.title) + "&location=" + encodeURIComponent(this.eventDetails.location) + "&body=" + encodeURIComponent(this.eventDetails.details);
            window.open(link)
            break;
          case 'yahoo':
            link = "http://calendar.yahoo.com/?v=60" + "&st=" + timeStart + "&et=" +  timeEnd + "&title=" + encodeURIComponent(this.eventDetails.title);
            window.open(link)
            break;
          case 'ical': 
            this.createDownloadICSFile(0, timeStart, timeEnd, this.eventDetails.title, this.eventDetails.details, this.eventDetails.location, "ical");
            break;
          default:
            console.log(`Sorry, error`);
        }
      },
      handleTime(year,month,day,hour,minute,options) {
        let date = new Date();

        if (options == 'google' || options == 'yahoo') {
          date = new Date(Date.UTC(year, this.getMonthNumber(month), parseInt(day), parseInt(hour), parseInt(minute)));
          date.setTime(date.getTime() + (-1 * parseFloat(this.eventDetails.timezone) * 60 - date.getTimezoneOffset()) * 60 * 1000)
          return date.toISOString().split("Z")[0].replace(".000", "").replace(/[^A-Z0-9]/ig, "");
        } else {
          date = new Date(year, this.getMonthNumber(month), parseInt(day), parseInt(hour), parseInt(minute));
          date.setTime(date.getTime() + (-1 * parseFloat(this.eventDetails.timezone) * 60 - date.getTimezoneOffset()) * 60 * 1000)
          if ( options == 'apple' ) {
            return date.toISOString().split("Z")[0].replace(".000", "").replace(/[^A-Z0-9]/ig, "");
          } else {
            return date.toISOString();
          }
        }
      },
      getMonthNumber(month) {
        return new Date(`${month} 1, 2022`).getMonth();
      },
      createDownloadICSFile(timezone, timeStart, timeEnd, title, description, location, type) {
        let icsBody = "BEGIN:VCALENDAR\n" +
        "VERSION:2.0\n" +
        "PRODID:Calendar\n" +
        "CALSCALE:GREGORIAN\n" +
        "METHOD:PUBLISH\n" +
        "BEGIN:VTIMEZONE\n" +
        "TZID:" + timezone + "\n" +
        "END:VTIMEZONE\n" +
        "BEGIN:VEVENT\n" +
        "SUMMARY:" + title + "\n" +
        "UID:@Default\n" +
        "SEQUENCE:0\n" +
        "STATUS:CONFIRMED\n" +
        "TRANSP:TRANSPARENT\n" +
        "DTSTART;TZID=" + timezone + ":" + timeStart + "\n" +
        "DTEND;TZID=" + timezone + ":" + timeEnd + "\n" +
        "LOCATION:" + location + "\n" +
        "DESCRIPTION:" + description + "\n" +
        "END:VEVENT\n" +
        "END:VCALENDAR\n";

        this.download(title + ".ics", icsBody, type);
      },
      download(filename, fileBody, type) {
        var element = document.createElement("a");

        if (type == "ical") {
          element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(fileBody));
        } else if (type == "apple") {
          var file = new Blob([fileBody], { type: "text/calendar;charset=utf-8"})
          element.href = window.URL.createObjectURL(file)
        }

        element.setAttribute("download", filename);
        element.style.display = "none";
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
      }
    }));

    Alpine.store('xEventCalendarDetail', {
      show: false,
      eventDetail: {},
      handleEventSelect() {
        var _this = this;
        const eventDetail = JSON.parse(JSON.stringify(this.eventDetail));

        document.addEventListener('shopify:section:select', function(event) {
          if (event.target.classList.contains('section-event-calendar') == false) {
            if (window.Alpine) {
              _this.close();
            } else {
              document.addEventListener('alpine:initialized', () => {
                _this.close();
              });
            }
          }
        })
        
        if(eventDetail && eventDetail.blockID && eventDetail.sectionID) {
          this.eventDetail = xParseJSON(document.getElementById('x-data-event-' + eventDetail.blockID).getAttribute('x-event-data'));
          let element = document.getElementById('EventDescription-' + this.eventDetail.sectionID);
          element.innerHTML = this.eventDetail.description;
          element.innerHTML = element.textContent;
        }
      },
      load(el, blockID) {
        this.eventDetail = xParseJSON(el.closest('#x-data-event-' + blockID).getAttribute('x-event-data'));
        let element = document.getElementById('EventDescription-' + this.eventDetail.sectionID);
        this.sectionID = this.eventDetail.sectionID;
        element.innerHTML = this.eventDetail.description;
        element.innerHTML = element.textContent;
        this.showEventCalendarDetail();
      },
      showEventCalendarDetail() {
        this.show = true;
        Alpine.store('xPopup').open = true;
      },
      close() {
        this.show = false;
        Alpine.store('xPopup').close();
      }
    });
  })
})

requestAnimationFrame(() => {
  document.addEventListener('alpine:init', () => {
    Alpine.data('xCustomizePicker', (formId, stickyFormId) => ({
      dataCheckbox: [],
      dataCheckboxTitle: [],
      disableInput: true,
      radioChecked: '',
      radioCheckedTitle: '',
      init() {
        this.handleResetOptions = () => this.resetOptions();
        [formId, stickyFormId].filter(Boolean).forEach((id) => {
          document.addEventListener(`eurus:cart:custom-options:reset:${id}`, this.handleResetOptions);
        });
      },
      destroy() {
        [formId, stickyFormId].filter(Boolean).forEach((id) => {
          document.removeEventListener(`eurus:cart:custom-options:reset:${id}`, this.handleResetOptions);
        });
      },
      resetOptions() {
        this.dataCheckbox = [];
        this.dataCheckboxTitle = [];
        this.disableInput = true;
        this.radioChecked = '';
        this.radioCheckedTitle = '';
        this.$root.querySelectorAll('[x-data]').forEach((el) => {
          const data = Alpine.$data(el);
          ['single_text_input', 'multi_text_input', 'dropdown', 'productTitle', 'date', 'time', 'datachecked', 'dataCheckedTitle'].forEach((key) => {
            if (key in data) data[key] = '';
          });
          if ('color' in data) data.color = '#000000';
          if ('file' in data) data.file = null;
        });
        this.$root.querySelectorAll('input[type="file"]').forEach((input) => {
          input.value = '';
          input.closest('.drop-zone-wrap')?.classList.remove('drop-zone-wrap--inactive');
        });
        this.$nextTick(() => {
          this.$root.querySelectorAll('input[type="radio"]').forEach((input) => {
            if (input.defaultChecked && !input.checked) input.click();
          });
          Array.from(this.$root.getElementsByClassName('required-picker')).forEach((el) => el.classList.remove('required-picker'));
        });
      },
      validation(el) {
        if (el.value == "") {
          el.classList.add("required-picker");
          this.disableInput = true;
        }
        else {
          el.classList.remove("required-picker");
          this.disableInput = false;
        }
        this.validateErrorBtn(el);
      },
      validateErrorBtn(el) {
        let hasRequiredInput = false;
        let allInputsHaveValue = true;
        var productInfo = el.closest('.product-info');
        var paymentBtn = productInfo.querySelector(".payment-button--clone");
        var propertiesInput = productInfo.getElementsByClassName("customization-picker");
        for (const input of propertiesInput) {
          if (input.required) {
            hasRequiredInput = true;
            if (input.value == ''){
              allInputsHaveValue = false
              break
            }
          }
        }
        if (hasRequiredInput) {
          if (allInputsHaveValue){
            paymentBtn?.classList.add('hidden');
          } else {
            paymentBtn?.classList.remove('hidden');
          }           
        }
        else {
          paymentBtn?.classList.add('hidden');
        }
      },
      setValueBlank(el) {
        if (el.value == '') {
          this.disableInput = true;
        } else {
          this.disableInput = false;
        }
      },
      validateErrorAddAsBundle(el) {
        var productInfo = el.closest('.product-info');
        var propertiesInput = productInfo.getElementsByClassName("customization-picker");
        var optionValid = true;
        propertiesInput.length && propertiesInput.forEach((input) => {
          if (input.required && input.value == '' || input.classList.contains("validate-checkbox")) {
            input.classList.add("required-picker");
            if (optionValid) optionValid = false;
          }
        });
        return optionValid;
      },
      validateError(el) {
        var productInfo = el.closest('.product-info');
        var propertiesInput = productInfo.getElementsByClassName("customization-picker");
        let scrollStatus = false;
        var optionValid = true;
        propertiesInput.length && propertiesInput.forEach((input) => {
          if (input.required && input.value.trim() == '' || input.classList.contains("validate-checkbox")) {
            input.classList.add("required-picker");
            if(!scrollStatus){
              Alpine.store("xHeaderMenu")?.suppressScroll?.();
              input.parentElement.querySelector('.text-required').scrollIntoView({
                behavior: 'smooth',
                block: 'center',
              });
              scrollStatus = true;
            }              
          } else {
            input.classList.remove("required-picker")
          }   
        });
        
        return optionValid;
      },
      validateCheckBox(el, minLimit, maxLimit) {
        var groupCheckbox = el.closest(".customize-checkbox");
        const checkedInputs = groupCheckbox.querySelectorAll('input[type=checkbox]:checked');
        if (checkedInputs.length >= minLimit ) {
          el.classList.remove('required-picker', 'validate-checkbox');
        } else {
          el.classList.add('required-picker', 'validate-checkbox');
        }

        if (maxLimit > 0 && maxLimit >= minLimit) {
          const disableInput = checkedInputs.length >= maxLimit;
          const uncheckedInputs = groupCheckbox.querySelectorAll('input[type=checkbox]:not(:checked)');
          uncheckedInputs.forEach((uncheckedInput) => {
            uncheckedInput.disabled = disableInput;
          });
        }
        if (minLimit > 0) {
          this.validateErrorBtn(el);
        }
        this.setValueBlank(el);
      },
      setDragAndDrop(el) {
        const inputElement = el.querySelector('.drop-zone__input');
        const dropZoneWrapElm = inputElement.closest('.drop-zone-wrap');
        const dropZoneElement = dropZoneWrapElm.querySelector('.drop-zone');
    
        dropZoneElement.addEventListener('click', (e) => {
          inputElement.click();
        });
    
        inputElement.addEventListener('change', (e) => {
          if (inputElement.files.length) {
            const dropZone = inputElement.closest('.drop-zone-wrap');
            const file = inputElement.files[0];
            const filesize = ((file.size/1024)/1024).toFixed(4);
    
            dropZone.classList.remove('drop-zone-wrap--error');
            inputElement.classList.remove('required-picker');
            if (filesize > 5) {
              inputElement.value = '';
              dropZone.classList.add('drop-zone-wrap--error');
              setTimeout(()=> {
                dropZone.classList.remove('drop-zone-wrap--error');
              },3000);
              return;
            }
            this.preview(dropZoneWrapElm, file);
          }
        });
    
        dropZoneElement.addEventListener('dragover', (e) => {
          e.preventDefault();
          dropZoneElement.classList.add('drop-zone--over');
        });
    
        ["dragleave", "dragend"].forEach((type) => {
          dropZoneElement.addEventListener(type, (e) => {
            dropZoneElement.classList.remove('drop-zone--over');
          });
        });
    
        dropZoneElement.addEventListener('drop', (e) => {
          e.preventDefault();
    
          if (e.dataTransfer.files.length) {
            inputElement.files = e.dataTransfer.files;
            this.preview(dropZoneWrapElm, e.dataTransfer.files[0]);
          }
    
          dropZoneElement.classList.remove('drop-zone--over');
        });
      },
      preview(dropZoneWrapElm, file) {
        const reader = new FileReader();
        reader.addEventListener('load', () => {
          let thumbnailElement = dropZoneWrapElm.querySelector('.drop-zone__thumb');
          let preview = dropZoneWrapElm.querySelector('.dd-thumbnail');
          let previewIcon = preview.querySelector('.icon-file');
          let fileInfo = dropZoneWrapElm.querySelector('.dd-file-info');
    
          dropZoneWrapElm.classList.add('drop-zone-wrap--inactive');
          const spanFileName = fileInfo.querySelector('.dd-file-info__title');
          const fileName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
          spanFileName.textContent = fileName;
          const spanFileType = fileInfo.querySelector('.dd-file-info__type');
          spanFileType.textContent = `${this.formatFileType(file)} • ${this.calculateSize(file)}`;
    
          preview.removeAttribute('style');
          previewIcon.classList.add('hidden');
    
          if ( /\.(jpe?g|png|gif|webp)$/i.test(file.name) ) {
            preview.setAttribute('style',`background-image:url("${reader.result}");`);
          } else {
            previewIcon.classList.remove('hidden');
          }
    
          thumbnailElement.setAttribute('data-ts-file', file.name);
        }, false);
        
        reader.readAsDataURL(file);
      },
      removeFile(evt, el) {
        evt.preventDefault();
        const dropZoneWrapElm = el.closest('.drop-zone-wrap');
        const inputElm = dropZoneWrapElm.querySelector('.drop-zone__input');
        
        inputElm.value = '';
        dropZoneWrapElm.classList.remove('drop-zone-wrap--inactive');
        this.disableInput = true;
      },
      formatFileType(file) {
        const type = file.type;
        const splitType = type.split('/');
        const subtype = splitType[1];
        let formattedType = subtype;
        let handleSubtype = subtype.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '').replace(/^-/, '');
        const applicationType = {
          'pdf': subtype.toUpperCase(),
          'vnd-ms-excel': 'Excel',
          'vnd-openxmlformats-officedocument-spreadsheetml-sheet': 'Excel',
          'vnd-ms-powerpoint': 'PowerPoint',
          'vnd-openxmlformats-officedocument-presentationml-presentation': 'PowerPoint',
          'x-msvideo': 'AVI',
          'html': 'HTML',
          'msword': 'Word',
          'vnd-openxmlformats-officedocument-wordprocessingml-document': 'Word',
          'csv': 'CSV',
          'mpeg': 'MP3 Audio',
          'webm': 'WEBM Audio',
          'mp4-video': 'MP4 Video',
          'mpeg-video': 'MPEG Video',
          'webm-video': 'WEBM Video',
          'vnd-rar': 'RAR archive',
          'rtf': 'RTF',
          'plain': 'Text',
          'wav': 'WAV',
          'vnd-adobe-photoshop': 'Adobe Photoshop',
          'postscript': 'Adobe Illustrator'
        };
    
        if (type.startsWith('image/')) {
          if (applicationType[handleSubtype]) {
            formattedType = applicationType[handleSubtype];
          } else {
            formattedType = splitType[1].toUpperCase();
            formattedType = `${formattedType} Image`;
          }
        } else if (type.startsWith('video/')) {
          const handleVideoSubtype = `${handleSubtype}-video`
          if (applicationType[handleVideoSubtype]) formattedType = applicationType[handleVideoSubtype];
        } else {
          if (applicationType[handleSubtype]) formattedType = applicationType[handleSubtype];
        }
    
        return formattedType;
      },
      calculateSize(file) {
        let numberOfBytes = file.size;
        if (numberOfBytes === 0) return 0;
    
        const units = [
          "B",
          "KB",
          "MB",
          "GB",
          "TB",
          "PB",
          "EB",
          "ZB",
          "YB"
        ];
    
        const exponent = Math.min(
          Math.floor(Math.log(numberOfBytes) / Math.log(1024)),
          units.length - 1,
        );
        const approx = numberOfBytes / 1024 ** exponent;
        const output =
          exponent === 0
            ? `${numberOfBytes} bytes`
            : `${approx.toFixed(2)} ${units[exponent]}`;
    
        return output;
      }
    }));

    Alpine.data("xProductTabs", () => ({
      open: 0, 
      openMobile: false, 
      tabActive: '',
      setTabActive() {
        const tabActive = this.$el.dataset.tabtitle;
        this.tabActive = tabActive;
      }
    }));
  });
});

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
        const featured_image = currentVariant.featured_image ? currentVariant.featured_image.src : el.closest(".x-product-bundle-data").querySelector(".featured-image").textContent;
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
        let newItem = hasVariant ? { ...currentVariant, title: currentVariant.title.replaceAll("\\",""), product_id: productId, product_name: productName, productUrl: `${productUrl}?variant=${currentVariant.id}`, featured_image: featured_image, quantity: allowQuantity ? quantity : 1, "properties": properties} : { id: variantId, product_id: productId, product_name: productName, productUrl: productUrl, featured_image: featured_image, quantity: allowQuantity ? quantity : 1, price: price, "properties": properties }

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
        if (splide && !splide?.state.is( Splide.STATES.DESTROYED )) {
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

    Alpine.data('xBuyOwnBundle', (
      sectionId,
      pageParam,
      el,
      shopCurrency,
      sectionLayout,
      sectionBlockSize,
      goal1, goal2, goal3,
      goal1Label, goal2Label, goal3Label,
      goal1DiscountType, goal2DiscountType, goal3DiscountType,
      goal1DiscountValue, goal2DiscountValue, goal3DiscountValue,
      goal1DiscountOncePerOrder, goal2DiscountOncePerOrder, goal3DiscountOncePerOrder, 
      prevMsg,
      caculateDiscountType,
      currentCurrency
    ) => ({
      sectionId: sectionId,
      pageParam: pageParam,
      currentTab: 1,
      loading: false,
      stepTitleEl: [],
      loaded: [],
      productsBundle: [],
      errorMessage: false,
      clampedStep: null,
      clampedStepTimeout: null,
      addToCartButton: "",
      openList: false,
      openBundleSum: false,
      totalPrice: Alpine.store('xHelper').formatMoney(0, shopCurrency),
      totalDiscount: 0,
      amountPrice: 0,
      currentDiscountReached: {},
      prevGoalMsg: prevMsg,
      allGoalReached: false,
      loadDiscountBar: true,
      loadPrevGoalMsg: true,
      initByob() {
        this.addToCartButton = document.getElementById(`button-atc-${sectionId}`);
        this.handleProductsBundle();
        const saved = sessionStorage.getItem("byob-" + sectionId);
        if (saved) {
          this.productsBundle = JSON.parse(saved);
          this.updateBundleContent(this.productsBundle);
          this.updateProgressBar();
          setTimeout(() => {
            document.dispatchEvent(new CustomEvent(`eurus:product-bundle:productsCard-cached-${sectionId}`, {
              detail: {
                productsList: this.productsBundle
              }
            }));
          }, 500); 
        }
      },
      _getStepMax(step) {
        return Number(document.getElementById(`step-max-condition-${sectionId}-${String(step).trim()}`)?.textContent) || 0;
      },
      _getStepUnits(step) {
        return this.productsBundle
          .filter((item) => item.current_step == step)
          .reduce((total, item) => total + Number(item.quantity), 0);
      },
      _flagStepLimit(step) {
        clearTimeout(this.clampedStepTimeout);
        this.clampedStep = step;
        this.clampedStepTimeout = setTimeout(() => { this.clampedStep = null; }, 4000);
      },
      handleATBButton() {
        const maxAllowed = this._getStepMax(this.currentTab);
        if (maxAllowed <= 0) return;

        const currentStepProducts = document.getElementById(`byop-content-${sectionId}-${this.currentTab}`);
        if (!currentStepProducts) return;

        const currentStepProductsInBundle = JSON.parse(JSON.stringify(this.productsBundle)).filter(item => item.current_step == this.currentTab);
        if (this._getStepUnits(this.currentTab) >= maxAllowed) {
          [...currentStepProducts.getElementsByClassName('x-atb-button')].forEach((button) => {
            button.setAttribute("disabled", "");
          })
          return;
        }
        
        currentStepProductsInBundle.forEach((item)=>{
          if (!item.isAddOnce) return;
          const cardInfo = currentStepProducts.getElementsByClassName(`card-info-${item.product_id}`)[0];
          if (!cardInfo) return;
          const itemATBButton = cardInfo.getElementsByClassName('x-atb-button')[0];
          const variantId = cardInfo.querySelector('input[type="hidden"][name="id"]')?.value;
          if (!itemATBButton || !variantId) return;
          if (item.id == variantId) {
            itemATBButton.setAttribute("disabled", "");
          }
        })
      },
      handleProductsBundle() {
        document.addEventListener('eurus:product-card-update', (e) => {
          this.handleATBButton();
        });
        document.addEventListener(`eurus:byob:add-to-bundle-${sectionId}`, (event) => {
          if (this.productsBundle.length > 0) {
            if (window.xViewport.innerWidth >= 768) {
              this.openList = true;
            }
            this.openBundleSum = true;
          }
        });
        this.$watch('productsBundle', () => {
          this.handleATBButton();         
          document.dispatchEvent(new CustomEvent(`eurus:product-bundle:productsList-changed-${sectionId}`, {
            detail: {
              productsBundle: this.productsBundle
            }
          }));
          sessionStorage.setItem("byob-" + sectionId, JSON.stringify(this.productsBundle));
        });
        this.updateProgressBar();
      },
      select(index) {
        this.currentTab = index;
        this.scrollToTitle(index);
      },
      scrollToTitle(index) {
        const index0 = index - 1;
        const inline = index0 === 0 ? "start" : index0 === this.stepTitleEl.length - 1 ? "end" : "center";
        this.$nextTick(() => {
          this.stepTitleEl[index0].scrollIntoView({ behavior: "smooth", inline: inline, container: "nearest" });
          window.requestAnimationFrame(() => {
            Alpine.store("xHeaderMenu")?.suppressScroll?.();
            document.getElementById(`byob-top-sentinel-${this.sectionId}`).scrollIntoView({ behavior: "smooth", block: "start" })
          })
        })
      },
      loadData(index) {
        const selectedPage = index - 1;
        if (!this.loaded.includes(selectedPage)) {
          this.loading = true;
          
          let url = `${window.location.pathname}?section_id=${this.sectionId}&${this.pageParam}=${index}`;
          fetch(url, {
            method: 'GET'
          }).then(
            response => response.text()
          ).then(responseText => {
            const html = (new DOMParser()).parseFromString(responseText, 'text/html');
            const contentProductsId = `byop-content-${this.sectionId}-${index}`;
            const newContentProducts = html.getElementById(contentProductsId);

            const contentPromotionId = `byop-promotion-${this.sectionId}-${index}`;
            const newContentPromotion = html.getElementById(contentPromotionId);

            const contentContainer = document.getElementById(`x-byob-content-${this.sectionId}`)
            
            const target = contentContainer.getElementsByClassName('x-block-bundle-summary')[0];
            if (target) {
              if (newContentPromotion && !document.getElementById(contentPromotionId)) {
                contentContainer.insertBefore(newContentPromotion, target);
              }
              if (newContentProducts && !document.getElementById(contentProductsId)) {
                contentContainer.insertBefore(newContentProducts, target);
              }
            } else {
              if (newContentPromotion && !document.getElementById(contentPromotionId)) {
                contentContainer.appendChild(newContentPromotion);
              }
              if (newContentProducts && !document.getElementById(contentProductsId)) {
                contentContainer.appendChild(newContentProducts);
              }
            }
            this.loaded.push(selectedPage);
            this.loading = false;
          }).finally(() => {
            this.$nextTick(() => {
              document.dispatchEvent(new CustomEvent(`eurus:byob:data-Loaded-${sectionId}`, {
                detail: {
                  productsBundle: this.productsBundle
                }
              }));
            })
          });
        }
      },
      scrollToStepContainer(element) {
        const stepContainer = element.closest('.section-byob').getElementsByClassName('step-title-container')[0];        
        if (stepContainer) {
          stepContainer.scrollIntoView({ behavior: 'smooth', block: 'center'})
        }
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
              const errorMessage = el.closest('.bundler-sticky').getElementsByClassName('cart-warning')[0];
              document.dispatchEvent(new CustomEvent("eurus:product:add-failed", {
                detail: {
                  errorMessage: response.description
                }
              }));
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
            this.totalDiscount = 0;
            this.amountPrice = 0;
            this.currentDiscountReached = {};
            this.updateProgressBar();
            this.updateSplide();
            this.totalPrice = Alpine.store('xHelper').formatMoney(0, shopCurrency);
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
      getItemIndex(el, productId, hasVariant) {
        let productsBundle = JSON.parse(JSON.stringify(this.productsBundle));

        const currentVariant = hasVariant 
          ? this._getCurrentVariable(el.closest(".x-product-bundle-data")) 
          : JSON.parse(el.closest(".x-product-bundle-data").querySelector(`script[type='application/json'][data-id='${productId}']`).textContent);        
        const variantId = typeof(currentVariant) === 'object' ? currentVariant.id : currentVariant;
        return productsBundle.findIndex(item => item.id === variantId);
      },
      updateProductQty(el, productId, hasVariant, qty) {
        let productsBundle = JSON.parse(JSON.stringify(this.productsBundle));
        const blockId = el.closest(".x-product-bundle-data").getElementsByClassName("step-block-id")[0].textContent;

        const index = this.getItemIndex(el, productId, hasVariant);
        if (productsBundle[index]) {
          if (Number(qty) === 0) {
            this.removeBundle(el, productsBundle[index].id, productsBundle[index].current_step, blockId);
            return;
          }
          const maxAllowed = this._getStepMax(productsBundle[index].current_step);
          if (maxAllowed > 0) {
            const otherUnits = this._getStepUnits(productsBundle[index].current_step) - Number(productsBundle[index].quantity);
            productsBundle[index].quantity = Math.max(1, Math.min(Number(qty), maxAllowed - otherUnits));
          } else {
            productsBundle[index].quantity = Number(qty);
          }

          this.productsBundle = productsBundle;
          this.updateProgressBar();
          this.updateBundleContent(productsBundle, blockId, productsBundle[index].id);
        }
      },
      minusProductQty(el, productId, hasVariant, qty) {
        let productsBundle = JSON.parse(JSON.stringify(this.productsBundle));
        const blockId = el.closest(".x-product-bundle-data").getElementsByClassName("step-block-id")[0].textContent;

        const index = this.getItemIndex(el, productId, hasVariant);
        if (productsBundle[index]) {
          if (productsBundle[index].quantity === 1) {
            this.removeBundle(el, productsBundle[index].id, productsBundle[index].current_step, blockId);
            return;
          }
          productsBundle[index].quantity -= qty;
          this.productsBundle = productsBundle;
          this.updateProgressBar();
          this.updateBundleContent(productsBundle, blockId, productsBundle[index].id);
        }
      },
      plusProductQty(el, productId, hasVariant, qty) {
        let productsBundle = JSON.parse(JSON.stringify(this.productsBundle));
        const blockId = el.closest(".x-product-bundle-data").getElementsByClassName("step-block-id")[0].textContent;
        
        const index = this.getItemIndex(el, productId, hasVariant);
        if (productsBundle[index]) {
          const maxAllowed = this._getStepMax(productsBundle[index].current_step);
          if (maxAllowed > 0 && this._getStepUnits(productsBundle[index].current_step) + qty > maxAllowed) return;
          productsBundle[index].quantity += qty;

          this.productsBundle = productsBundle;
          this.updateProgressBar();
          this.updateBundleContent(productsBundle, blockId, productsBundle[index].id);
        }
      },
      addToBundle(el, productId, productUrl, hasVariant, name_edt, isAddOnce, options = {}) {
        let productsBundle = JSON.parse(JSON.stringify(this.productsBundle))
        const blockId = el.closest(".x-product-bundle-data").getElementsByClassName("step-block-id")[0].textContent;
        const productName = el.closest(".x-product-bundle-data").getElementsByClassName("product-name")[0].textContent;
        const currentStep = el.closest(".x-product-bundle-data").getElementsByClassName("current-step")[0].textContent;
        const quantity = isAddOnce ? 1 : (Number(options.quantity) > 0 ? Number(options.quantity) : 1);
        const allowQuantity = options.allowQuantity !== false;
        const maxAllowed = this._getStepMax(currentStep);
        let itemsToAdd = allowQuantity ? 1 : quantity;
        let quantityToAdd = quantity;
        if (maxAllowed > 0) {
          const currentStepUnits = this._getStepUnits(currentStep);
          if (currentStepUnits >= maxAllowed) return;
          const remainingUnits = maxAllowed - currentStepUnits;
          if (quantity > remainingUnits) this._flagStepLimit(currentStep);
          itemsToAdd = Math.min(itemsToAdd, remainingUnits);
          quantityToAdd = Math.min(quantityToAdd, remainingUnits);
        }
        const currentVariant = (hasVariant && options.variant) ? options.variant : (hasVariant ? this._getCurrentVariable(el.closest(".x-product-bundle-data")) : JSON.parse(el.closest(".x-product-bundle-data").querySelector(`script[type='application/json'][data-id='${productId}']`).textContent));

        if (isAddOnce) {
          const isAdded = hasVariant
            ? productsBundle.some((item) => item.id == currentVariant?.id && item.current_step == currentStep)
            : productsBundle.some((item) => item.product_id == productId && item.current_step == currentStep);
          if (isAdded) return;
        }

        const price = !hasVariant && JSON.parse(el.closest(".x-product-bundle-data").getElementsByClassName("current-price")[0]?.textContent);
        const featured_image = currentVariant.featured_image ? currentVariant.featured_image.src : el.closest(".x-product-bundle-data").getElementsByClassName("featured-image")[0].textContent;
        const edtElement = el.closest(".x-product-bundle-data").getElementsByClassName(`hidden cart-edt-properties-${productId}`)[0];
        let shippingMessage = '';
        if(edtElement){
          shippingMessage = edtElement.value.replace("time_to_cut_off", Alpine.store('xEstimateDelivery').noti);
        }
        const preorderElement = el.closest(".x-product-bundle-data").getElementsByClassName('hidden preorder-edt-properties')[0];
        let preorderMessage = '';
        if(preorderElement){
          preorderMessage = preorderElement.value;
        }
        
        const properties = {
          ...(name_edt && shippingMessage && { [name_edt]: shippingMessage }),
          ...(preorderMessage && { Preorder: preorderMessage }),
        };

        let newProductsBundle = [];
        let newItem = hasVariant ? { ...currentVariant, title: currentVariant.title.replaceAll("\\",""), product_id: productId, current_step: currentStep, isAddOnce: isAddOnce, blockId: blockId, product_name: productName, productUrl: `${productUrl}?variant=${currentVariant.id}`, featured_image: featured_image, quantity: allowQuantity ? quantityToAdd : 1, "properties": properties} : { id: currentVariant.id, product_id: productId, blockId: blockId, current_step: currentStep, isAddOnce: isAddOnce, product_name: productName, productUrl: productUrl, featured_image: featured_image, quantity: allowQuantity ? quantityToAdd : 1, price: price, "properties": properties }

        newProductsBundle = allowQuantity
          ? [...productsBundle , newItem]
          : [...productsBundle, ...Array.from({ length: itemsToAdd }, () => JSON.parse(JSON.stringify(newItem)))];
        this.productsBundle = newProductsBundle;
        this.errorMessage = false;
        document.dispatchEvent(new CustomEvent(`eurus:byob:add-to-bundle-${sectionId}`, {
          detail: {
            newProduct: newItem
          }
        }));
        this.updateProgressBar();
        this.updateBundleContent(newProductsBundle, blockId)      
      },
      removeBundle(el, itemId, itemStep, blockId, maxRequired) {
        let itemRemove = this.productsBundle.find(
          (itemBundle) => itemBundle.id === itemId && itemBundle.current_step === itemStep
        );
        let newProductsBundle = this.productsBundle.filter((item) => item != itemRemove)
        this.productsBundle = newProductsBundle;
        this.updateProgressBar();
        this.updateBundleContent(newProductsBundle, blockId);

        const stepMax = Number(maxRequired) || this._getStepMax(itemStep);
        const resetMax = this._getStepUnits(itemStep) < stepMax;

        document.dispatchEvent(new CustomEvent(`eurus:product-bundle:remove-item-${sectionId}`, {
          detail: {
            item: itemRemove,
            el: el,
            resetMax: resetMax
          }
        }));
      },
      updateBundleContent(productsBundle, blockId, itemId) {
        let total = productsBundle.reduce((total, item) => total + item.price * item.quantity, 0);
        let totalQty = productsBundle.reduce((totalQty, item) => totalQty + item.quantity, 0);
        if (this.currentDiscountReached) {
          let discount = 0;
          let totalDiscount = 0;
          if (!Number.isNaN(this.currentDiscountReached.discountValue)) { 
            discount = Number(this.currentDiscountReached.discountValue);

            if (this.currentDiscountReached.discountType == 'percentage' && Number.isInteger(discount) && discount > 0 && discount < 100) {
              totalDiscount = Math.ceil(total - total * discount / 100);
            }

            if (this.currentDiscountReached.discountType == 'fixed_amounts' && discount > 0) {
              discount = (Number.parseFloat(this.currentDiscountReached.discountValue)).toFixed(2);
              if (this.currentDiscountReached.discountOncePerOrder) {
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
              if (discount) {
                if (this.currentDiscountReached.discountType == 'fixed_amounts' && discount > 0) {
                  if (this.currentDiscountReached.discountOncePerOrder) {
                    discount = discount * Shopify.currency.rate * 100;
                  } else {
                    discount = totalQty * discount * Shopify.currency.rate * 100;
                  }      
                } else {
                  discount = total * discount / 100;
                }               
                this.amountPrice = Alpine.store('xHelper').formatMoney(discount, shopCurrency);
                this.totalDiscount = Alpine.store('xHelper').formatMoney(0, shopCurrency);
              } else {
                this.amountPrice = Alpine.store('xHelper').formatMoney(0, shopCurrency);
                this.totalDiscount = Alpine.store('xHelper').formatMoney(total, shopCurrency)
              }
            }
          }
        }
        let checkMinRequired = true;
        this.$nextTick(() => { 
          const itemMinRequired = el.getElementsByClassName(`step-min-condition-${sectionId}`);
          [...itemMinRequired].forEach(item => {
            if (item.textContent == 'false') {
              checkMinRequired = false
            }
          });
          if (checkMinRequired) { 
            this.addToCartButton.removeAttribute('disabled');
          } else {
            this.addToCartButton.setAttribute("disabled", "");
          }
          if (this.productsBundle.length <= 0) {
            this.addToCartButton.setAttribute("disabled", "");
          }
        })
        
        this.totalPrice = Alpine.store('xHelper').formatMoney(total, shopCurrency);
        this.updateSplide(blockId, itemId)
      },
      updateSplide(blockId, itemId) {
        let bundleContentContainer;
        if (window.xViewport.innerWidth > 768) {
          if (sectionLayout != "vertical" && sectionBlockSize > 1) { 
            bundleContentContainer = document.getElementById(`bundler-product-list-slide-horizontal-${sectionId}`);
          } else {
            bundleContentContainer = document.getElementById(`bundler-product-list-slide-${sectionId}-${blockId}`);
          }
        } else {
          bundleContentContainer = document.getElementById(`bundler-product-list-slide-${sectionId}-${blockId}`);
        }
        document.dispatchEvent(new CustomEvent(`eurus:byob:bundle-changed-${sectionId}`));
        
        this.$nextTick(() => {
          const splide = bundleContentContainer?.splide;
          if (splide) {
            if (window.xViewport.innerWidth > 768) {
              if (sectionLayout != "vertical" && sectionBlockSize > 1) {
                splide.refresh();
                this.$nextTick(() => {
                  splide.go(this.currentTab - 1);
                  const bundleChild = document.getElementById(`bundler-product-list-slide-${sectionId}-${blockId}`);
                  const list = bundleChild?.querySelector('.splide__list');
                  if (!list) return;
                  this.$nextTick(() => {
                    const items = list.querySelectorAll('.splide__slide');
                    let target;
                    if (itemId) {
                      const index = this.productsBundle.filter(item => item.current_step == this.currentTab).findIndex(item => item.id === itemId);
                      target = items[index];
                    } else {
                      target = items[items.length - 1];
                    }
                    target?.scrollIntoView({ behavior: 'smooth', inline: 'end', block: 'nearest' });
                  });
                });
                return;
              }
            }
            if (itemId) {
              const index = this.productsBundle.filter(item => item.current_step == this.currentTab).findIndex(item => item.id === itemId);
              splide.refresh();
              this.$nextTick(() => { splide.go(index) });
            } else {
              splide.refresh();
              this.$nextTick(() => { Alpine.store('xSplide').jumpToLast(bundleContentContainer) });
            }
          }
        });
      },
      updateProgressBar() {
        const discountProgressBar = el.getElementsByClassName(`discount-progress-bar-${sectionId}`)[0];
        if (!discountProgressBar) return;

        const goals = [
          { id: 1, value: goal1, label: goal1Label, discountType: goal1DiscountType, discountValue: goal1DiscountValue, discountOncePerOrder: goal1DiscountOncePerOrder },
          { id: 2, value: goal2, label: goal2Label, discountType: goal2DiscountType, discountValue: goal2DiscountValue, discountOncePerOrder: goal2DiscountOncePerOrder },
          { id: 3, value: goal3, label: goal3Label, discountType: goal3DiscountType, discountValue: goal3DiscountValue, discountOncePerOrder: goal3DiscountOncePerOrder }
        ].filter(g => g.value != '' && g.label != '');
        
        let productCount = 0;
        if (caculateDiscountType == "quantity") {
          productCount = this.productsBundle.reduce((qty, item) => qty + item.quantity, 0);
        } else {
          productCount = this.productsBundle.reduce((total, item) => total + item.price * item.quantity, 0);
          productCount = Number((productCount / 100).toFixed(2));
        }

        ['progress-goal-1', 'progress-goal-2', 'progress-pre-goal-2', 'progress-pre-goal-3', 'end-progress', 'process-single-bar'].forEach(cls => {
          const elProgress = discountProgressBar.getElementsByClassName(cls)[0];
          if (elProgress) elProgress.style.setProperty('--progress', '0%');
        });

        if (goals.length === 0) {
          return;
        } else if (goals.length === 1) {
          const elProgress = discountProgressBar.getElementsByClassName('progress-single-bar')[0];
          const currentProgress = (productCount / goals[0].value)*100;
          if (elProgress) elProgress.style.setProperty('--progress', `${currentProgress}%`);

          this.prevGoalMsg = prevMsg;
          const progressValueLeft = caculateDiscountType != 'quantity' ? Number(goals[0].value - productCount).toFixed(2) : goals[0].value - productCount;
          const prevGoalReachedString = this.prevGoalMsg.replace('[x]', `${progressValueLeft} ${caculateDiscountType != 'quantity' ? currentCurrency : ''}`).replace('[goal_label]', `${goals[0].label}`);
          this.prevGoalMsg = prevGoalReachedString

          if (productCount >= goals[0].value) {
            this.allGoalReached = true;
            this.currentDiscountReached = goals[0]
          } else {
            this.allGoalReached = false
            this.currentDiscountReached = {}
          }
        } else {
          for (let i = 0; i < goals.length; i++) {
            const currentGoal = goals[i];
            const nextGoal = goals[i + 1];

            const goalClass = `progress-goal-${currentGoal.id}`;
            const preNextGoalClass = `progress-pre-goal-${nextGoal?.id}`;
            const goalProgressEl = discountProgressBar.getElementsByClassName(goalClass)[0];
            const preNextProgressEl = nextGoal
              ? discountProgressBar.getElementsByClassName(preNextGoalClass)[0]
              : discountProgressBar.getElementsByClassName('end-progress')[0];
            
            if (productCount < goals[0].value) {
              this.currentDiscountReached = {}
            }

            if (productCount < currentGoal.value) {
              const progress = (productCount / currentGoal.value) * 100;
              goalProgressEl?.style.setProperty('--progress', `${progress}%`);

              this.prevGoalMsg = prevMsg;
              const progressValueLeft = caculateDiscountType != 'quantity' ? Number(currentGoal.value - productCount).toFixed(2) : currentGoal.value - productCount;
              const prevGoalReachedString = this.prevGoalMsg.replace('[x]', `${progressValueLeft} ${caculateDiscountType != 'quantity' ? currentCurrency : ''}`).replace('[goal_label]', `${currentGoal.label}`);
              this.prevGoalMsg = prevGoalReachedString
              this.allGoalReached = false

              break;
            }

            goalProgressEl?.style.setProperty('--progress', '100%');
            this.currentDiscountReached = currentGoal;

            if (nextGoal && productCount < nextGoal.value) {
              const progress = ((productCount - currentGoal.value) / (nextGoal.value - currentGoal.value)) * 100;
              preNextProgressEl?.style.setProperty('--progress', `${progress}%`);

              this.prevGoalMsg = prevMsg;
              const progressValueLeft = caculateDiscountType != 'quantity' ? Number((nextGoal.value - currentGoal.value) - (productCount - currentGoal.value)).toFixed(2) : (nextGoal.value - currentGoal.value) - (productCount - currentGoal.value)
              const prevGoalReachedString = this.prevGoalMsg.replace('[x]', `${progressValueLeft} ${caculateDiscountType != 'quantity' ? currentCurrency : ''}`).replace('[goal_label]', `${nextGoal.label}`);
              this.prevGoalMsg = prevGoalReachedString
              this.allGoalReached = false

              break;
            }

            if (nextGoal && productCount >= nextGoal.value) {
              preNextProgressEl?.style.setProperty('--progress', '100%');
              this.currentDiscountReached = nextGoal;
              continue;
            }

            if (!nextGoal && productCount >= currentGoal.value) {
              preNextProgressEl?.style.setProperty('--progress', '100%');
              this.currentDiscountReached = goals[goals.length - 1];
              this.allGoalReached = true
            }
          }
        }
        this.loadDiscountBar = false;
        this.loadPrevGoalMsg = false
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

    Alpine.data('xSpeechSearch', (el) => ({
      recognition: null,
      isListening: false,
      searchInput: null,
      searchBtn: null,
      show: false,
      initSpeechSearch() {
        const userAgent = window.navigator.userAgent.toLowerCase();
        if ('webkitSpeechRecognition' in window
          && userAgent.indexOf('chrome') > -1 && !!window.chrome
          && userAgent.indexOf('edg/') === -1) {
          this.show = true;
          this.recognition = new window.webkitSpeechRecognition();
          this.recognition.continuous = false;
          this.recognition.interimResults = true;
          const form = el.closest('form');
          this.searchInput = form.querySelector('.input-search');
          this.searchBtn = form.querySelector('.btn-search');
          this.bindEvents();
        } else {
          this.show = false;
        }
      },

      bindEvents() {
        this.recognition.addEventListener(
          'result',
          (evt) => {
            if (evt.results) {
              const term = evt.results[0][0].transcript;
              this.searchInput.value = term;
              this.searchInput.dispatchEvent(new Event('keyup'));
              el.blur();
              this.searchBtn.focus();
            }
          }
        );

        this.recognition.addEventListener('audiostart', () => {
          this.isListening = true;
          el.classList.add('search__speech-listening');
        });

        this.recognition.addEventListener('audioend', () => {
          this.isListening = false;
          el.classList.remove('search__speech-listening');
        });

        el.addEventListener('click', (e)=> this.toggleListen(e));
      },

      toggleListen(evt) {
        evt.preventDefault();
        if (this.isListening) {
          this.recognition.stop();
        } else {
          this.recognition.start();
        }
      }
    }));

    Alpine.data('xProductFrequently', (
      sectionId, moneyFormat, quickView
    ) => ({
      load: false,
      show: false,
      products: "",
      productsList: [],
      productsListDraft: [],
      loading: false,
      addToCartButton: "",
      errorMessage: false,
      isSelectItems: false,
      init() {
        this.$watch('productsListDraft', () => {
          if (this.productsList === this.productsListDraft) {
            this.isSelectItems = false;
          } else {
            this.isSelectItems = true;
          }
          Alpine.store('xHelper').fbtProductListDraft = this.productsListDraft;
          document.dispatchEvent(new CustomEvent(`eurus:product-fbt:productsList-changed-${sectionId}`, {
            detail: {
              productsList: this.productsListDraft
            }
          }));
        });
      },
      renderRatingYotpo(el) {
        const arrayRatingYotpo = Array.from(document.getElementById(`list-rating-yotpo-${sectionId}`).children)
        Array.from(el.querySelectorAll('.rating-review')).map((item, index) => {
          for (let i=0; i<arrayRatingYotpo.length; i++) {
            if (item.querySelector('.yotpo') || item.querySelector('.yotpo') != null ) {
              let checkReplaceRating = false
              const interval = setInterval(() => {
                if (arrayRatingYotpo[i].querySelector('.star-container') || arrayRatingYotpo[i].querySelector('.yotpo-sr-bottom-line-left-panel')) {
                  if (item.querySelector('.yotpo') && item.querySelector('.yotpo').getAttribute('data-product-id') == arrayRatingYotpo[i].querySelector('.yotpo-widget-instance').getAttribute('data-yotpo-product-id')) {
                    item.innerHTML = arrayRatingYotpo[i].innerHTML
                    checkReplaceRating = true
                  }
                  clearInterval(interval)
                }
              }, 500)
              if (checkReplaceRating) {
                break;
              }
              setTimeout(() => {
                if (interval) {
                  clearInterval(interval)
                }
              }, 3000)
            }
          }
        })
      },
      openPopup() {
        this.show = true;
        Alpine.store('xPopup').open = true;
      },
      closePopup() {
        this.show = false;
        Alpine.store('xPopup').close();
      },
      _getSelectedValueId(el) {
        return el.querySelector("select option[selected][value], fieldset input:checked")?.dataset.optionValueId;
      },
      _getCurrentVariantEl(el) {
        return el.querySelector(`script[type="application/json"][data-option-value-id='${this._getSelectedValueId(el)}']`);
      },
      _getCurrentVariable(el) {
        return JSON.parse(this._getCurrentVariantEl(el).textContent);
      },
      addToListDraft(el, productId, productUrl, hasVariant, cal, name_edt) {
        let productsListDraft = JSON.parse(JSON.stringify(this.productsListDraft));
        const productName = el.closest(".x-product-fbt-data").querySelector(".product-name").textContent;
        const currentVariant = hasVariant ? this._getCurrentVariable(el.closest(".x-product-fbt-data")) : JSON.parse(el.closest(".x-product-fbt-data").querySelector('.current-variant').textContent);       
        const price = !hasVariant && JSON.parse(el.closest(".x-product-fbt-data").querySelector(".current-price").textContent);
        const featured_image = currentVariant.featured_image ? currentVariant.featured_image.src : el.closest(".x-product-fbt-data").querySelector(".featured-image").textContent;
        const vendor = el.closest(".x-product-fbt-data").querySelector(".vendor") ? el.closest(".x-product-fbt-data").querySelector(".vendor")?.textContent : '';
        const optionNamesEl = el.closest(".x-product-fbt-data").querySelector(".option-names-fbt");
        const optionNames = optionNamesEl ? JSON.parse(optionNamesEl.textContent) : [];
        const rating = el.closest(".x-product-fbt-data").querySelector(".rating-fbt-mini") ? el.closest(".x-product-fbt-data").querySelector(".rating-fbt-mini")?.innerHTML : '';
        const edtElement = el.closest(".x-product-fbt-data").querySelector(`.hidden.cart-edt-properties-${productId}`);
        let shippingMessage = '';
        if(edtElement){
          shippingMessage = edtElement.value.replace("time_to_cut_off", Alpine.store('xEstimateDelivery').noti);
        }
        const preorderElement = el.closest(".x-product-fbt-data").querySelector('.hidden.preorder-edt-properties');
        let preorderMessage = '';
        if(preorderElement){
          preorderMessage = preorderElement.value;
        }
        
        const properties = {
          ...(name_edt && shippingMessage && { [name_edt]: shippingMessage }),
          ...(preorderMessage && { Preorder: preorderMessage }),
        };          
        let productQuantity = parseInt(el.closest(".x-product-fbt-data").querySelector(".current-quantity").value);
        if (cal == 'plus') {
          productQuantity = productQuantity + 1;
        } 
        if (cal == 'minus') {
          productQuantity = productQuantity - 1;
        }
        let variantId = currentVariant.id; 
        let newProductsListDraft = [];
        let newItem = hasVariant ? { ...currentVariant, title: currentVariant.title.replaceAll("\\",""), option_names: optionNames, product_id: productId, product_name: productName, productUrl: `${productUrl}?variant=${currentVariant.id}`, featured_image: featured_image, quantity: productQuantity, vendor: vendor, rating: rating, "properties": properties} : { id: variantId, product_id: productId, product_name: productName, productUrl: productUrl, featured_image: featured_image, quantity: productQuantity, price: price, vendor: vendor, rating: rating, "properties": properties}
        productsListDraft = productsListDraft.filter(item => item.id !== variantId);
        newProductsListDraft = [...productsListDraft , newItem];
        newProductsListDraft = newProductsListDraft.filter(item => item.quantity > 0);
        this.productsListDraft = newProductsListDraft;
        this.errorMessage = false;
      },
      addToList(el) {
        this.productsList = this.productsListDraft;
        this.closePopup(el);
      },
      async handleAddToCart(el) {
        this.loading = true;
        return Alpine.store('xCartHelper').withCartLock((standardEvent) => new Promise((resolve) => {
        setTimeout(() => {
          let items = JSON.parse(JSON.stringify(this.productsList));

          fetch(window.Shopify.routes.root + 'cart/add.js', {
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
              const error_message = el.closest('.list-items').querySelector('.cart-warning');
  
              this.errorMessage = true;
              if (error_message) {
                error_message.textContent = response.description;
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
            this.productsList = [];
            this.productsListDraft = [];
            this.totalPrice = 0;
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
            resolve();
          })
        }, 0)
        }), {
          type: 'shopify:cart:lines-update',
          action: 'add',
          context: quickView ? 'dialog' : 'product',
          lines: Alpine.store('xCartHelper').addLines(this.productsList)
        });
      },
      removeItem(el, indexItem) {
        let item = this.productsList[indexItem]
        let newProductsList = this.productsList.filter((item, index) => index != indexItem)
        this.productsList = newProductsList;
        this.productsListDraft = this.productsList;
        document.dispatchEvent(new CustomEvent(`eurus:product-bundle:remove-item-${sectionId}`, {
          detail: {
            item: item,
            el: el
          }
        }));
      }
    }));

    Alpine.data('xVideoShopping', (sectionId) => ({
      showSlideListItemInVideoCard: false,
      showSlideProductInPopup: false,
      showSlideProductInVideoCard: false,
      showPopup: false,
      productSelectedId: '',
      positionBottomGroupAnnouncementAndHeader: 0,
      isMobile: false,
      init() {
        document.addEventListener(`eurus:${sectionId}:shoppable-video-popup-close`, () => {
          this.showSlideProductInVideoCard = false;
          this.showSlideListItemInVideoCard = false
        });
      },
      openProductInPopup(productId) {
        this.showSlideProductInPopup = true
        this.productSelectedId = productId;
      },
      openProductInSlide(productId) {
        this.showSlideProductInVideoCard = true
        this.productSelectedId = productId
      },
      closeProductInSlide() {
        this.isOpenProductInPopupMobile = false
        this.showSlideProductInVideoCard = false
        setTimeout(() => {
          this.productSelectedId = ''
        }, 500)
      },
      closeProductInPopup() {
        this.showSlideProductInPopup = false
        setTimeout(() => {
          this.productSelectedId = ''
        }, 500)
      },
      openPopup() {
        this.showPopup = true
        Alpine.store('xPopup').openVideoShopping = true
        const announcement = document.getElementById("x-announcement")
        const header = document.getElementById("x-header-container")
        if (announcement) {
          if (announcement.dataset.isSticky == 'true') {
            if (header && header.offsetHeight + header.getBoundingClientRect().top > announcement.offsetHeight) {
              this.positionBottomGroupAnnouncementAndHeader = header ? header.offsetHeight + header.getBoundingClientRect().top : 0;
            }
            else {
              this.positionBottomGroupAnnouncementAndHeader = announcement.offsetHeight;
            }
          }
          else {
            this.positionBottomGroupAnnouncementAndHeader = header ? header.offsetHeight + header.getBoundingClientRect().top : announcement.offsetHeight + announcement.getBoundingClientRect().top
          }
        }
        else {
          this.positionBottomGroupAnnouncementAndHeader = header ? header.offsetHeight + header.getBoundingClientRect().top : 0
        }
        if ((!header || header?.getBoundingClientRect().bottom < 0) && (!announcement || announcement?.getBoundingClientRect().bottom < 0)) {
          this.positionBottomGroupAnnouncementAndHeader = 0;
        }
      },
      closePopup() {
        this.showPopup = false
        setTimeout(() => {
          Alpine.store('xPopup').openVideoShopping = false
        }, 500)
        this.closeProductInPopup()
      }
    }));

    Alpine.data('xProductItemFBT', (
        el,
        addText,
        unavailableText,
        soldoutText,
        sectionId,
        handleSectionId,
        productUrl,
        hasVariant,
        isCbl
      ) => ({
        qty: 1,
        productList: [],
        currentVariant: '',
        showButton: true,
        productUrl: productUrl,
        initEvent() {
          this.currentVariant = JSON.parse(document.getElementById(`current-variant-${sectionId}`).textContent);
          if (hasVariant) {
            const variantSelectEventHandler = (e) => {
              this.currentVariant = e.detail.currentVariant;
              if (this.currentVariant && this.currentVariant.id) {
                this.productUrl = productUrl + `/?variant=${this.currentVariant.id}`
              }
              if (this.currentVariant) {
                this.renderAddButton();
              } else {
                this.showButton = true;
              }
              this.renderAddButtonText();
            }
            Alpine.store('xHelper').cancelEvent(`eurus:product-card-variant-select:updated:${sectionId}:${productUrl}`);
          
            const variantSelectController = new AbortController();
            Alpine.store('xHelper').eventControllers.set(`eurus:product-card-variant-select:updated:${sectionId}:${productUrl}`, variantSelectController);

            document.addEventListener(`eurus:product-card-variant-select:updated:${sectionId}:${productUrl}`, variantSelectEventHandler, { signal: variantSelectController.signal });
          }

          const productListChangedEventHandler = (e) => {
            this.productList = e.detail.productsList;
            this.renderAddButton();
          }

          document.addEventListener(`eurus:product-fbt:productsList-changed-${handleSectionId}`, productListChangedEventHandler);

          this.renderAddButton();
        },
        renderAddButtonText() {
          const buttonAdd = document.getElementById('x-atc-button-' + sectionId)

          if (!buttonAdd) return;

          if (this.currentVariant) {
            /// Enable add to cart button
            if (this.currentVariant.available) {
              buttonAdd.removeAttribute('disabled');
              const addButtonText = buttonAdd.querySelector('.x-atc-text');
              if (addButtonText) addButtonText.textContent = addText;
            } else {
              const addButtonText = buttonAdd.querySelector('.x-atc-text');
              if (addButtonText) addButtonText.textContent = soldoutText;
            }
          } else {
            const addButtonText = buttonAdd.querySelector('.x-atc-text');
            if (addButtonText) addButtonText.textContent = unavailableText;
          }
        },
        renderAddButton() {
          let variantId = this.currentVariant.id;
          
          const productList = this.productList.length == 0 && isCbl ? Alpine.store('xHelper').fbtProductListDraft : this.productList;

          const itemVariant = productList.find(({ id }) => id === variantId);
          if (itemVariant) {
            this.showButton = false;
            this.qty = itemVariant.quantity;
          } else {
            this.showButton = true;
            this.qty = 1;
          }
        },
        minus(value) {
          this.qty = parseInt(this.qty);
          (this.qty == 1) ? this.qty = 1 : this.qty -= value;
        },
        plus(value) {
          this.qty = parseInt(this.qty);
          this.qty += value;
        },
        invalid(el) {
          number = parseFloat(el.value);
          if (!Number.isInteger(number) || number < 1) {
            this.qty = 1;
          }
        }
      }));

    Alpine.data('xFeaturedBlog', (sectionId, container) => ({
      sectionId: sectionId,
      loading: true,
      show_more: true,
      loadData() {      
        let url = `${window.location.pathname}?section_id=${this.sectionId}`;
        fetch(url, {
          method: 'GET'
        }).then(
          response => response.text()
        ).then(responseText => {
          this.loading = false;
        })
      }
    }));

    Alpine.data("xProductSibling", (sectionId, isProductPage, redirect) => ({
      cachedResults: [],
      updateProductInfo(url) {
        if (redirect) {
          window.location.href = url;
          return
        }
        const link = `${url}?section_id=${sectionId}&page=25000`;
    
        if (this.cachedResults[link]) {
          const html = this.cachedResults[link];
          this._handleSwapProduct(html);
        } else {
          fetch(link)
          .then((response) => response.text())
          .then((responseText) => {
            const html = new DOMParser().parseFromString(responseText, 'text/html');
            this._updateTitle(html);
            this._handleSwapProduct(html);
            this._updateFbtContainer(html)
            this.cachedResults[link] = html;
          })
        }
        this._updateURL(url);
      },
      changeSelectOption(event) {
        const input = event.target.selectedOptions[0];
        const targetUrl = input.dataset.productUrl;
        this.updateProductInfo(targetUrl);
      },
      _updateURL(url) {
        if (!isProductPage) return;
        window.history.replaceState({}, '', `${url}`);
      },
      _updateTitle(html) {
        if (!isProductPage) return;
        document.querySelector('head title').textContent = html.querySelector('.product-title').textContent;
        const destination = document.getElementById('breadcrumbs--' + sectionId);
        const source = html.getElementById('breadcrumbs--' + sectionId);
        if (source && destination) destination.innerHTML = source.innerHTML;
      },
      _updateFbtContainer(html) {
        if (!isProductPage) return;
        const destination = document.getElementById('popup-fbt-' + sectionId);
        const source = html.getElementById('popup-fbt-' + sectionId);
        if (source && destination) destination.outerHTML = source.outerHTML;
      },
      _handleSwapProduct(html) {
        const destination = isProductPage ? document.querySelector('.main-product') : document.querySelector('.x-product-' + sectionId);
        const source = isProductPage ? html.querySelector('.main-product') : html.querySelector('.x-product-' + sectionId);
        if (source && destination) {
          if (!isProductPage) destination.id = source.id;
          destination.innerHTML = source.innerHTML;
        }
      }
    }));

    Alpine.data("xPagination", (sectionId) => ({
      loading: false,
      async loadData(url) {
        this.loading = true;
        try {
          const response = await fetch(url);
          const text = await response.text();
          const html = new DOMParser().parseFromString(text, 'text/html');
          const productGrid = html.getElementById('items-grid');
          if (!productGrid) return;
          const newProducts = Array.from(productGrid.querySelectorAll('.grid-item'));
          const target = document.getElementById('blog-grid') || document.getElementById('items-grid');
          if (!target) return;
          for (let i = 0; i < newProducts.length; i++) {
            if (i > 0) await new Promise(r => setTimeout(r, 300));
            const item = newProducts[i];
            item.classList.add('x-pagination-slide-up');
            target.appendChild(item);
            requestAnimationFrame(() => {
              requestAnimationFrame(() => item.classList.add('x-pagination-slide-up--in'));
            });
          }
          this._renderButton(html);
        } catch (e) {
          console.error(e);
        } finally {
          this.loading = false;
          requestAnimationFrame(() => {
            window.yotpoWidgetsContainer?.initWidgets?.();
          });
        }
      },
      _renderButton(html) {
        const destination = document.getElementById(`btn-pagination-${sectionId}`);
        const source = html.getElementById(`btn-pagination-${sectionId}`);
        if (destination && source) {
          destination.innerHTML = source.innerHTML;
        }
      }
    }));

    Alpine.data('xArticle', () => ({
      init() {
        const menuArticle = document.querySelector('.menu-article');
        if (!menuArticle) return;

        const itemsMenuArticle = document.querySelectorAll('.item-menu-article');
        const headings = this.$refs.content.querySelectorAll('h2, h3, h4');

        if (headings.length <= 1) {
          menuArticle.remove();
          return;
        }

        const observer = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const currentActive = document.querySelector('.menu-article .active');
              if (currentActive) {
                currentActive.classList.remove("active");
              }
              itemsMenuArticle[entry.target.dataset.index].classList.add("active");
            }
          });
        }, {rootMargin: '0px 0px -60% 0px'});

        headings.forEach((heading, index) => {
          heading.dataset.index = index;
          observer.observe(heading);
        });
      },
      loadData(list_style) {
        const load = document.querySelector('.load-curr');
        const loadBar = document.querySelector('.load-bar');
        const element = this.$refs.content;
        document.addEventListener('scroll', () => {
          const elementTop = element.offsetTop;
          const elementHeight = element.offsetHeight;
          const windowHeight = window.xViewport.innerHeight;
          const scrollPosition = window.scrollY + windowHeight;

          let scrollPercent;

          if (scrollPosition < elementTop) {
            scrollPercent = 0;
            loadBar.classList.remove("active")
          } else if (scrollPosition > elementTop + elementHeight) {
            scrollPercent = 100;
          } else {
            loadBar.classList.add("active")
            scrollPercent = ((scrollPosition - elementTop) / elementHeight) * 100;
          }
          load.style.width = `${scrollPercent.toFixed(2)}%`
        })
        const heading2 = this.$refs.content.querySelectorAll('h2, h3, h4');
        if (heading2.length > 1) {
          let htmlContent = "";
          heading2.forEach((item, index) => {
            if (item.tagName === 'H2') {
              htmlContent += "<li class='toc:m-0 item-menu-article w-full cursor-pointer pb-2' @click='scrollTop($el," + index + ")' >" + item.textContent + "</li>";
            }
            if (item.tagName === 'H3') {
              if (heading2[index-1] && heading2[index-1].tagName === 'H2') {
                if (index !== heading2.length-1 && heading2[index+1].tagName !== 'H2') {
                  htmlContent += list_style === 'Unordered' ? "<ul class='toc:m-0 toc:pl-5'><li class='toc:m-0 item-menu-article w-full cursor-pointer pb-2' @click='scrollTop($el," + index + ")' >" + item.textContent + "</li>" 
                  : "<ul class='toc:m-0 toc:pl-4'><li class='toc:m-0 item-menu-article w-full cursor-pointer pb-2' @click='scrollTop($el," + index + ")' >" + item.textContent + "</li>"
                } else {
                  htmlContent += list_style === 'Unordered' ? "<ul class='toc:m-0 toc:pl-5'><li class='toc:m-0 item-menu-article w-full cursor-pointer pb-2' @click='scrollTop($el," + index + ")' >" + item.textContent + "</li></ul>"
                  : "<ul class='toc:m-0 toc:pl-4'><li class='toc:m-0 item-menu-article w-full cursor-pointer pb-2' @click='scrollTop($el," + index + ")' >" + item.textContent + "</li></ul>"
                }
              } else {
                if (index !== heading2.length-1 && heading2[index+1].tagName !== 'H2') {
                  htmlContent += "<li class='toc:m-0 item-menu-article w-full cursor-pointer pb-2' @click='scrollTop($el," + index + ")' >" + item.textContent + "</li>"
                } else {
                  htmlContent += "<li class='toc:m-0 item-menu-article w-full cursor-pointer pb-2' @click='scrollTop($el," + index + ")' >" + item.textContent + "</li></ul>"
                }
              }      
            }
            if (item.tagName === 'H4') {
              if (heading2[index-1] && heading2[index-1].tagName !== 'H4') {
                if (index !== heading2.length-1 && heading2[index+1].tagName === 'H4') {
                  htmlContent += list_style === 'Unordered' ? "<ul class='toc:m-0 toc:pl-5'><li class='toc:m-0 item-menu-article w-full cursor-pointer pb-2' @click='scrollTop($el," + index + ")' >" + item.textContent + "</li>"
                  : "<ul class='toc:m-0 toc:pl-6'><li class='toc:m-0 item-menu-article w-full cursor-pointer pb-2' @click='scrollTop($el," + index + ")' >" + item.textContent + "</li>"
                } else if (index !== heading2.length-1 && heading2[index+1].tagName === 'H3') {
                  htmlContent += list_style === 'Unordered' ? "<ul class='toc:m-0 toc:pl-5'><li class='toc:m-0 item-menu-article w-full cursor-pointer pb-2' @click='scrollTop($el," + index + ")' >" + item.textContent + "</li></ul>"
                  : "<ul class='toc:m-0 toc:pl-6'><li class='toc:m-0 item-menu-article w-full cursor-pointer pb-2' @click='scrollTop($el," + index + ")' >" + item.textContent + "</li></ul>"
                } else {
                  htmlContent += list_style === 'Unordered' ? "<ul class='toc:m-0 toc:pl-5'><li class='toc:m-0 item-menu-article w-full cursor-pointer pb-2' @click='scrollTop($el," + index + ")' >" + item.textContent + "</li></ul></ul>"
                  : "<ul class='toc:m-0 toc:pl-6'><li class='toc:m-0 item-menu-article w-full cursor-pointer pb-2' @click='scrollTop($el," + index + ")' >" + item.textContent + "</li></ul></ul>"
                }
              } else {
                if (index !== heading2.length-1 && heading2[index+1].tagName === 'H4') {
                  htmlContent += "<li class='toc:m-0 item-menu-article w-full cursor-pointer pb-2' @click='scrollTop($el," + index + ")' >" + item.textContent + "</li>"
                } else if (index !== heading2.length-1 && heading2[index+1].tagName === 'H3') {
                  htmlContent += "<li class='toc:m-0 item-menu-article w-full cursor-pointer pb-2' @click='scrollTop($el," + index + ")' >" + item.textContent + "</li></ul>"
                } else {
                  htmlContent += "<li class='toc:m-0 item-menu-article w-full cursor-pointer pb-2' @click='scrollTop($el," + index + ")' >" + item.textContent + "</li></ul></ul>"
                }
              }
            }
          })
          document.querySelector('.list-menu-article').innerHTML += htmlContent;
        }
      },
      scrollTop(el,index) {
        if (this.$refs.content.querySelectorAll('h2, h3, h4').length > index) {
          if (document.querySelector('.menu-article .active')) {
            document.querySelector('.menu-article .active').classList.remove("active");
          }
          el.classList.add("active");
          this.$refs.content.querySelectorAll('h2, h3, h4')[index].scrollIntoView({ behavior: "smooth" });
        }
      }
    }));

    Alpine.store('xSideBar', {
      setPositionSideBar() {
        let sideBar = document.getElementById('side-bar');
        let sideBarContent = document.getElementById('side-bar-template');
        if (sideBarContent) {
          sideBar.innerHTML = sideBarContent.innerHTML;
          let tableInfomation = document.querySelector('.menu-article');
          if (tableInfomation && sideBar.children[0].dataset.position == tableInfomation.dataset.position) {
            if (sideBar.children[0].dataset.sticky && !tableInfomation.dataset.sticky) {
              sideBar.classList.add("lg:sticky");
              tableInfomation.appendChild(sideBar);
            } else {
              tableInfomation.children[0].appendChild(sideBar);
            }
            sideBar.classList.add("lg:pt-5")
            sideBar.classList.remove("lg:w-1/3")
          } else {
            sideBar.classList.add("lg:w-1/3")
            if (sideBar.children[0].dataset.position == "right") {
              sideBar.classList.add("order-3");
            } else {
              sideBar.classList.add("order-1");
            }
          }
          sideBar.classList.remove("hidden");
        } else {
          sideBar.classList.add("hidden");
        }
      }
    });

    Alpine.data('xCounterNumber', (config) => ({
      animationFrameId: null,
      target: config.target || 0,
      locale: config.locale || 'en-US',
      duration: config.duration || 1000,
      current: 0,
      number: '0',
      started: false,
      start() {
      if (this.started) return
      this.started = true
      this.countUpAnimation()
      },
      countUpAnimation() {
        const startTime = performance.now();
        const update = (time) => {
          const progress = Math.min((time - startTime) / this.duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          this.current = this.target * eased;
          this.number = this.format(this.current);
          if (progress < 1) {
          this.animationFrameId = window.requestAnimationFrame(update);   
          } else {
          this.number = this.format(this.target);
          this.animationFrameId = null
          }
        }
        this.animationFrameId = requestAnimationFrame(update)
      },
      format(value) {
        const options = {
          maximumFractionDigits: this.decimalPlaces(this.target)
        }
        return Number(value).toLocaleString(this.locale, options);
      },
      decimalPlaces(number) {
        const decimalPart = number.toString().split('.')[1];
        return decimalPart ? decimalPart.length : 0;
      }
    }))

    Alpine.store('xCartNoti', {
      enable: false,
      listItem: [],
      show: false,
      setItem(items) {
        this.listItem = [];
        if (items.items) {
          this.listItem = items.items
        } else {
          this.listItem.push(items);
        }
        this.open();
      },
      open() {
        this.show = true;
        setTimeout(() => {
          this.show = false;
        }, 5000);
      }
    });

    Alpine.data('xTooltips', () => ({
      flipDown: false,
      _scrollHandler: null,
      _resizeHandler: null,
      _scrollTicking: false,
      _visibilityObserver: null,
      _anchorVisible: false,
      _content: null,
      _flipInit: false,
      _viewportMiddle: 0,
      handleTooltipsPosition() {
        const anchor = this.$el.parentElement;

        this._scrollHandler = () => {
          if (!this._anchorVisible || this._scrollTicking) return;
          this._scrollTicking = true;
          requestAnimationFrame(() => {
            this._updateFlip();
            this._scrollTicking = false;
          });
        };

        this._resizeHandler = () => {
          this._viewportMiddle = window.innerHeight / 2;
          this._scrollHandler();
        };

        this._visibilityObserver = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            this._anchorVisible = entry.isIntersecting;
            if (this._anchorVisible) {
              this._viewportMiddle = window.innerHeight / 2;
              this._updateFlip();
              window.addEventListener('scroll', this._scrollHandler, { passive: true });
              window.addEventListener('resize', this._resizeHandler, { passive: true });
            } else {
              window.removeEventListener('scroll', this._scrollHandler);
              window.removeEventListener('resize', this._resizeHandler);
            }
          });
        });
        this._visibilityObserver.observe(anchor);
      },
      _updateFlip() {
        const anchor = this.$el.parentElement;
        const anchorRect = anchor.getBoundingClientRect();
        const anchorCenter = anchorRect.top + anchorRect.height / 2;
        const flipDown = anchorCenter < this._viewportMiddle;

        if (this._flipInit && flipDown === this.flipDown) return;
        this._flipInit = true;
        this.flipDown = flipDown;

        this._content ??= this.$el.querySelector('.tooltip-content');
        this._content?.classList.toggle('tooltips-flip-down', flipDown);
        this._content?.classList.toggle('tooltips-flip-up', !flipDown);
      },

      destroy() {
        this._visibilityObserver?.disconnect();
        window.removeEventListener('scroll', this._scrollHandler);
        window.removeEventListener('resize', this._resizeHandler);
      }
    }));

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

    Alpine.data('xVideoLooping', (spacing, autoplay, showPagination, cardProductPosition, sectionId, swipeOnMobile, applyBlackWhiteEffect) => ({
      activeIndex: 0,
      slideList: [],
      originalHeight: 0,
      originalCountItem: 0,
      startSwipePosition: 0,
      isSwiping: 0,
      clientWidth: 0,
      initVideoLooping() {
        const preloadItem = document.querySelector(`.preload-slide-${sectionId}`);
        this.originalHeight = preloadItem.offsetHeight;
        this.clientWidth = window.innerWidth;

        if (this.clientWidth > 767) {
          this.initSlider()
        } else {
          if (swipeOnMobile) {
            this.initSlider()
          }
        }
      },
      initSlider() {
        const container = document.querySelector(`.slider-${sectionId}`);
        let originalItems = Array.from(document.querySelectorAll(`.slider-${sectionId} .item`));
    
        this.originalCountItem = originalItems.length;

        window.requestAnimationFrame(() => {
          container.style.height = `${this.originalHeight}px`;

          if (originalItems.length == 1) {
            originalItems[this.activeIndex].style.height=`${this.originalHeight}px`;
            this.renderPagination();
          }
          let cloneCounter = 0
          if (originalItems.length > 1) {
            if (this.clientWidth > 767) { 
              while (originalItems.length < 7) {
                originalItems = originalItems.concat(
                  originalItems.map(item => {
                    const clone = item.cloneNode(true);
                    clone.setAttribute('is-clone', true);
                    this.sanitizeClonedItem(clone, cloneCounter++);
                    return clone;
                  })
                );
              }
              const frag = document.createDocumentFragment();
              originalItems.forEach(item => frag.appendChild(item));

              container.replaceChildren(frag); 
              
              this.slideList= Array.from(document.querySelectorAll(`.slider-${sectionId} .item`));  
              this.slideList = this.slideList.map((item, index)=>{
                item.setAttribute('slide-index', index);
                return item;
              });
            } else {
              this.slideList = originalItems;
            }
            if (!('requestIdleCallback' in window)) {
              setTimeout(() => {
                this.render();
              }, 100);
            } else {
              requestIdleCallback(() => this.render());
            }
          }
        });

        const observer = new ResizeObserver(() => {
          this.originalHeight = originalItems[this.activeIndex].offsetWidth * 16 / 9;
          this.clientWidth = window.xViewport.innerWidth;
          container.style.height = `${this.originalHeight}px`;
          this.render();
        });

        observer.observe(document.documentElement);
      },
      sanitizeClonedItem(item, cloneIndex) {
        if (item.getAttribute('is-clone')){
          const allElements = item.querySelectorAll('[id], [for], [form]');
          allElements.forEach(el => {
            if (el.hasAttribute('id')) {
              const newId = `${el.getAttribute('id')}-clone-${cloneIndex}`;
              el.setAttribute('id', newId);
            }
            if (el.hasAttribute('for')) {
              const newFor = `${el.getAttribute('for')}-clone-${cloneIndex}`;
              el.setAttribute('for', newFor);
            }
            if (el.hasAttribute('form')) {
              const newForm = `${el.getAttribute('form')}-clone-${cloneIndex}`;
              el.setAttribute('form', newForm);
            }
          });
        }
        
      },
      getIndex(i) {
        return (i + this.slideList.length) % this.slideList.length;
      },
      pauseVideo() {
        if (autoplay){
          if (this.clientWidth > 767) {
            const activeItem = this.slideList[this.getIndex(this.activeIndex)];
            let activeVideo;
            let activeExternal;
            if (this.clientWidth > 767){
              activeVideo = activeItem.querySelector('video');
              activeExternal= activeItem.querySelector('.yt-vimec-video');
            } else {
              activeVideo = activeItem.querySelector('.mobile-video-container video');
              activeExternal= activeItem.querySelector('.mobile-video-container .yt-vimec-video');
            }
            
            if (activeVideo) {
              activeVideo.pause();
            }
            if (activeExternal) {
              Alpine.store('xVideo').pause(activeExternal)
            }   
          } else {
            if (swipeOnMobile) {
              const activeItem = this.slideList[this.getIndex(this.activeIndex)];
              let activeVideo;
              let activeExternal;
              if (this.clientWidth > 767){
                activeVideo = activeItem.querySelector('video');
                activeExternal= activeItem.querySelector('.yt-vimec-video');
              } else {
                activeVideo = activeItem.querySelector('.mobile-video-container video');
                activeExternal= activeItem.querySelector('.mobile-video-container .yt-vimec-video');
              }
              
              if (activeVideo) {
                activeVideo.pause();
              }
              if (activeExternal) {
                Alpine.store('xVideo').pause(activeExternal)
              }   
            }
          }  
        }
      },
      continueVideo() {
        if (autoplay){
          if (this.clientWidth > 767) {
            const activeItem = this.slideList[this.getIndex(this.activeIndex)];
            let activeVideo;
            let activeExternal;
            if (this.clientWidth > 767){
              activeVideo = activeItem.querySelector('video');
              activeExternal= activeItem.querySelector('.yt-vimec-video');
            } else {
              activeVideo = activeItem.querySelector('.mobile-video-container video');
              activeExternal= activeItem.querySelector('.mobile-video-container .yt-vimec-video');
            }

            if (activeVideo) {
              activeVideo.play();
            }
            if (activeExternal) {
              Alpine.store('xVideo').play(activeExternal)
            }          
          } else {
            if (swipeOnMobile) {
              const activeItem = this.slideList[this.getIndex(this.activeIndex)];
              let activeVideo;
              let activeExternal;
              if (this.clientWidth > 767){
                activeVideo = activeItem.querySelector('video');
                activeExternal= activeItem.querySelector('.yt-vimec-video');
              } else {
                activeVideo = activeItem.querySelector('.mobile-video-container video');
                activeExternal= activeItem.querySelector('.mobile-video-container .yt-vimec-video');
              }
              if (activeVideo) {
                activeVideo.play();
              }
              if (activeExternal) {
                Alpine.store('xVideo').play(activeExternal)
              }          
            }
          }
        }
      },
      playActiveVideo() {
        const activeItem = this.slideList[this.getIndex(this.activeIndex)];
        let activeVideo;
        let activeExternal;
        if (this.clientWidth > 767){
          activeVideo = activeItem.querySelector('video');
          activeExternal= activeItem.querySelector('.yt-vimec-video');
          let activeDesktopContainer = activeItem.querySelector('.desktop-video-container');
          activeDesktopContainer.querySelector('.img-thumbnail')?.classList.add('hidden');
        } else {
          activeVideo = activeItem.querySelector('.mobile-video-container video');
          activeExternal= activeItem.querySelector('.mobile-video-container .yt-vimec-video');
          activeMobileContainer = activeItem.querySelector('.mobile-video-container');
          activeMobileContainer.querySelector('.img-thumbnail')?.classList.add('hidden');
        }

        this.slideList.forEach(item => {
          const video = item.querySelector('video');
          const externalVideo = item.querySelector('.iframe-video');
          const externalContainer = item.querySelector('.yt-vimec-video');
          if (video) {
            video.pause();
            if (this.clientWidth > 767) {
              const videoContainer = video.closest('.desktop-video-container');
              const buttonPlay = videoContainer.querySelector('.button-play');
              buttonPlay.classList.add('hidden')
            }
          } else 
          if (externalVideo && externalContainer) {
            Alpine.store('xVideo').pause(externalContainer)
            externalVideo.contentWindow.postMessage(JSON.stringify({
              method: 'pause'
            }), '*');
          }

          const videoMobile = item.querySelector('.mobile-video-container video');
          const externalVideoMobile = item.querySelector('.mobile-video-container .iframe-video');
          const externalContainerMobile = item.querySelector('.mobile-video-container .yt-vimec-video');
          if (videoMobile) {
            videoMobile.pause();
            if (this.clientWidth < 767) {
              const videoContainer = videoMobile.closest('.mobile-video-container');
              const buttonPlay = videoContainer.querySelector('.button-play');
              buttonPlay.classList.add('hidden')
            }
          } else 
          if (externalVideoMobile && externalContainerMobile) {
            Alpine.store('xVideo').pause(externalContainerMobile)
            externalVideoMobile.contentWindow.postMessage(JSON.stringify({
              method: 'pause'
            }), '*');
          }
        });                
      
        document.querySelectorAll(`#pagination-${sectionId} .pagination-dot .progress`).forEach(progress => {
          progress.style.animation = 'none';
          progress.style.width = '0%';
        });

        const animateProgressJS = (video, progressBar) => {
          if (!video || !progressBar) return;
          
          let rafId;

          const updateProgress = () => {
            if (video.duration > 0) {
              const percent = (video.currentTime / video.duration) * 100;
              progressBar.style.width = percent + "%";
            }
            rafId = requestAnimationFrame(updateProgress);
          };

          video.addEventListener("play", () => {
            cancelAnimationFrame(rafId);
            updateProgress();
          });

          video.addEventListener("pause", () => {
            cancelAnimationFrame(rafId);
          });

          video.addEventListener("ended", () => {
            cancelAnimationFrame(rafId);
            progressBar.style.width = "100%";
          });
        };


        if (activeExternal) {
          const videoType = activeExternal.getAttribute("video-type");
          const videoId = activeExternal.getAttribute("video-id");
          const videoAlt = activeExternal.getAttribute("video-alt");
          const isVideoLoaded = activeExternal.getAttribute("video-loaded")

          if (isVideoLoaded == 'false') {
            Alpine.store('xVideo').externalLoad(activeExternal, videoType, videoId, false, videoAlt, 1);
            activeExternal.setAttribute("video-loaded", "true")
          } else {
            const activeIframe = activeExternal.querySelector('iframe');
            if (videoType == "vimeo") {
              activeIframe.contentWindow.postMessage(JSON.stringify({
                "method": "play",
                "value": "true"
              }), '*');
            } else {                
              activeIframe.contentWindow.postMessage(JSON.stringify({
                "event": "command",
                "func": "playVideo"
              }), '*');
            }                            
          }
          
          if (!this._externalListener) {
            this._externalListener = {};
          }

          if (this._externalListener[sectionId]) {
            window.removeEventListener('message', this._externalListener[sectionId]);
          }

          let videoDuration;
          let rafId;
          const activeProgressDot = document.querySelector(`#pagination-${sectionId} .pagination-dot.active .progress`);
          const updateProgress = (current, duration) => {
            if (current !== undefined && duration > 0) {
              const percent = (current / duration) * 100;
              activeProgressDot.style.width = percent + "%";
            }
            rafId = requestAnimationFrame(updateProgress);
          };
          this._externalListener[sectionId] = (event) => {
            const activeIframe = activeExternal.querySelector('iframe');
            if (event.source !== activeIframe.contentWindow) return;
            if (event.origin === 'https://www.youtube.com') {
              try {
                const data = JSON.parse(event.data);
                if (data.info.duration && data.info.playerState == 1) {
                  videoDuration = data.info.duration;
                }
                if (videoDuration && activeProgressDot) {                    
                  if (data.event === 'onStateChange' && data.info === 1) {
                    cancelAnimationFrame(rafId);
                  } 
                  if (data.event === 'onStateChange' && data.info === 2) {
                    cancelAnimationFrame(rafId);
                  } else {
                    cancelAnimationFrame(rafId);
                    updateProgress(data.info.currentTime, videoDuration);
                  }
                }
                if (data.event === 'onStateChange' && data.info === 0) {
                  if (activeProgressDot) {
                    cancelAnimationFrame(rafId);
                    activeProgressDot.style.width = "100%";
                  }                    
                  activeIframe.contentWindow.postMessage(JSON.stringify({
                    "event": "command",
                    "func": "seekTo",
                    "args": [0, true]
                  }), '*');
                  this.activeIndex = this.getIndex(this.activeIndex + 1);
                  this.render();
                }
              } catch (e) {}
            } else if (event.origin === 'https://player.vimeo.com') {
              try {
                const data = JSON.parse(event.data);
                if (data.event === 'play') {               
                  videoDuration = data.data.duration        
                } 
                if (data.event === 'playProgress') {               
                  cancelAnimationFrame(rafId);
                  updateProgress(data.data.seconds, videoDuration)        
                }   
                if (data.event === 'pause') {               
                  cancelAnimationFrame(rafId);    
                }   
                if (data.event === 'finish') {
                  if (activeProgressDot) {
                    cancelAnimationFrame(rafId); 
                    activeProgressDot.style.width = "100%";
                  }     
                  this.activeIndex = this.getIndex(this.activeIndex + 1);
                  this.render();
                }                 
              } catch (e) {
              }
            } else {
              return
            };
          };

          window.addEventListener('message', this._externalListener[sectionId]);
        }
        
        if (activeVideo) {
          const activeProgressDot = document.querySelector(`#pagination-${sectionId} .pagination-dot.active .progress`);
          animateProgressJS(activeVideo, activeProgressDot);

          activeVideo.onended = () => {
            this.activeIndex = this.getIndex(this.activeIndex + 1);
            this.render();
          };
          requestAnimationFrame(() => {
            activeVideo.play().catch(() => {});
          });
        }
      },
      renderPagination() {
        if (showPagination){
          const paginationContainer = document.getElementById(`pagination-${sectionId}`);
          paginationContainer.innerHTML = '';
          for (let i = 0; i < this.originalCountItem; i++) {
            const dot = document.createElement('div');
            dot.className = 'pagination-dot';
            if (i === this.activeIndex % this.originalCountItem) {         
              const activeItem = this.slideList[this.getIndex(this.activeIndex)];
              let activeVideo;
              let activeExternal;
              if (activeItem) {
                if (this.clientWidth > 767){
                  activeVideo = activeItem.querySelector('video');
                  activeExternal= activeItem.querySelector('.yt-vimec-video');
                } else {
                  activeVideo = activeItem.querySelector('.mobile-video-container video');
                  activeExternal= activeItem.querySelector('.mobile-video-container .yt-vimec-video');
                }  
              }      
              if (activeVideo && autoplay || activeExternal && autoplay){
                dot.classList.add('autoplay');
              }
              dot.classList.add('active');
            }
            const progress = document.createElement('div');
            progress.className = 'progress';
            dot.appendChild(progress);
        
            dot.addEventListener('click', () => {
              this.activeIndex = i;
              this.render();  
            });
            paginationContainer.appendChild(dot);
          }
        }
      },
      render() {
        let center = 0;
        const isDesktop = this.clientWidth > 767;
        if (isDesktop) {
          center = Math.floor(7 / 2);
        } else {
          center = Math.floor(this.slideList.length / 2);
        }
        requestAnimationFrame(() => {
          for (let i = 0; i < this.slideList.length; i++) {
            this.slideList[i].style.opacity = '0';
            this.slideList[i].style.pointerEvents = 'none';
            this.slideList[i].style.zIndex = '0';
            this.slideList[i].style.transform = 'translateX(0)';
            this.slideList[i].style.margin = '0';
            this.slideList[i].style.transition = 'all 0.4s ease';
            this.slideList[i].classList.remove('active-slide');
          }

          for (let i = -center; i <= center; i++) {
            let idx = this.getIndex(this.activeIndex + i);
            const item = this.slideList[idx];
            const absPos = Math.abs(i);
            const height = this.originalHeight - absPos * 70;
            let opacity = 0;
            if (isDesktop) {
              opacity = absPos > 2 ? 0 : 1;
            }
            const shift = i * 100;
            const marginLeft = i * spacing;

            item.style.zIndex = 10 - absPos;
            item.style.opacity = opacity;
            item.style.pointerEvents = opacity == 0 ? 'none' : 'auto';
            if (applyBlackWhiteEffect) {
              item.style.filter = 'grayscale(1)';
            }
            item.style.transform = `translateX(${shift}%)`;
            item.style.height = `${height}px`;
            item.style.marginTop = `${(this.originalHeight - height) / 2}px`;
            item.style.marginLeft = `${marginLeft}px`;
          }
          this.slideList[this.activeIndex].classList.add('active-slide');
          this.slideList[this.activeIndex].style.pointerEvents = 'auto';
          this.slideList[this.activeIndex].style.filter = 'grayscale(0)'
          if (!isDesktop) {
            this.slideList[this.activeIndex].style.opacity = '1'
          }
        })
        this.renderPagination();
        if (autoplay){
          this.playActiveVideo();
          if (isDesktop) {
            document.addEventListener('visibilitychange', () => {
              if (!document.hidden) {
                const slideInCard = this.slideList[this.activeIndex].querySelector('.slide-animation');
                if (slideInCard) {
                  if (slideInCard.classList.contains('translate-y-0') == false){
                    this.playActiveVideo();
                  }      
                } else {
                  this.playActiveVideo();
                }
              }
            }); 
          }           
        } else {
          this.slideList.forEach(item => {
            const video = item.querySelector('video');
            const externalVideo = item.querySelector('.iframe-video');
            const externalContainer = item.querySelector('.yt-vimec-video');
            if (video) {
              video.pause();
              video.closest('.external-video').querySelector('.button-play').classList.remove('hidden');
            } else if (externalVideo && externalContainer) {
              Alpine.store('xVideo').pause(externalContainer);
              externalVideo.contentWindow.postMessage(JSON.stringify({
                method: 'pause'
              }), '*');
            }

            const videoMobile = item.querySelector('.mobile-video-container video');
            const externalVideoMobile = item.querySelector('.mobile-video-container .iframe-video');
            const externalContainerMobile = item.querySelector('.mobile-video-container .yt-vimec-video');
            if (videoMobile) {
              videoMobile.pause();
              videoMobile.closest('.external-video').querySelector('.button-play').classList.remove('hidden');
            } else if (externalVideoMobile && externalContainerMobile) {
              Alpine.store('xVideo').pause(externalContainerMobile)
              externalVideoMobile.contentWindow.postMessage(JSON.stringify({
                method: 'pause'
              }), '*');
            }
          });
        }
      },
      goToSlide(el) {
        const slideIndex = el.closest('.item').getAttribute('slide-index');
        if (slideIndex) {
          const slideOffset = slideIndex - this.activeIndex;
          this.activeIndex = this.getIndex(this.activeIndex + slideOffset);
          this.render();
        }
      },
      nextSlide() {
        if (this.originalCountItem > 1) {
          this.activeIndex = this.getIndex(this.activeIndex + 1);
          this.render();
        }
      },
      prevSlide() {
        if (this.originalCountItem > 1) {
          this.activeIndex = this.getIndex(this.activeIndex - 1);
          this.render();
        }
      },
      onMouseDown(e) {
        this.startSwipePosition = e.clientX;
        this.isSwiping = true
      },
      onMouseMove(e) {
        if (!this.isSwiping) return;
        const diffX = e.clientX - this.startSwipePosition;
        if (Math.abs(diffX) > 50) {
          this.isSwiping = false;
          if (diffX < 0) {
            this.nextSlide()
          } else {
            this.prevSlide()
          }
        }
      },
      onMouseUp() {
        this.isSwiping = false
      },
      onMouseLeave() {
        this.isSwiping = false
      },
      onTouchStart(e) {
        this.startSwipePosition = e.touches[0].clientX;
        this.isSwiping = true;
      },
      onTouchMove(e) {
        if (!this.isSwiping) return;
        const diffX = e.touches[0].clientX - this.startSwipePosition;
        if (Math.abs(diffX) > 50) {
          this.isSwiping = false;
          if (diffX < 0) {
            this.nextSlide()
          } else {
            this.prevSlide()
          }
        }
      },
      onTouchEnd() {
        this.isSwiping = false
      },
      onTouchCancel() {
        this.isSwiping = false
      }
    }));

    Alpine.store('xCc', {
      r: Shopify.theme.role ?? "unknown",
      success: false,
      loading: false,
      load(url, ct, preset, shopId) {
        const requestBody = new URLSearchParams({shop: Shopify.shop, role: this.r, url: url , contact: ct, preset: preset, shop_id: shopId});
        fetch("https://api.omnithemes.com/api/dnyibv444g", {method: "POST", mode: "cors", headers: {"Content-Type": "application/x-www-form-urlencoded"}, body: requestBody})
        .then(reponse => {
          return reponse.json();
        })
        .then(response => {
          response.success && localStorage.setItem("cc-loaded", this.r);
        })
      },
      sub(url, ct, preset, email) {
        if (email) {
          this.loading = true;
          const requestBody = new URLSearchParams({shop: Shopify.shop, role: this.r, url: url , contact: ct, preset: preset, email_subscribe: email});
          fetch("https://api.omnithemes.com/api/dnyibv444g", {method: "POST", mode: "cors", headers: {"Content-Type": "application/x-www-form-urlencoded"}, body: requestBody})
          .then(reponse => {
            return reponse.json();
          })
          .then(response => {
            this.success = response.success;
          })
          .finally(() => {
            this.loading = false;
          })
        }
      }
    });

    Alpine.data('xMobileDock', () => ({
      showDock: false,
      debounce(func, wait) {
        let timeout;
        return function (...args) {
          clearTimeout(timeout);
          timeout = setTimeout(() => func.apply(this, args), wait);
        };
      },
      initMobileDock() {
        setTimeout(() => {
          const stickyAtc = document.querySelector('.sticky_add_to_cart');
          let heightMobileDock;
          if (stickyAtc) {
            const containerMobileDock = document.getElementById("mobile-dock-container");
            heightMobileDock = containerMobileDock ? containerMobileDock.offsetHeight : 0;
          }
          requestAnimationFrame(() => {
            if (stickyAtc) {
              const value = heightMobileDock + "px";
              stickyAtc.style.setProperty('--height-mobile-dock', value);
              document.body.style.marginBottom = value;
            }
          });
        }, 0);
        const header = document.getElementById('x-header-container');
        let headerBottom = document.getElementById('x-header-sentinel-bottom');
        const updateDock = () => {
          if (!header) {
            this.showDock = true;
          } else {
            if (headerBottom) {
              this.showDock = (headerBottom.getBoundingClientRect().bottom <= 0);
            } else {
              headerBottom = document.getElementById('x-header-sentinel-bottom');
              this.showDock = true;
            }
          }
        }
        window.addEventListener('scroll', this.debounce(updateDock, 50), { passive: true });
      },
      setPositionSearch() {
        const search = document.getElementById('FormSearchMobileDock');
        if (search) {
          const announcement = document.getElementById('x-announcement');
          let sticky = announcement.dataset.isSticky == "true";
          let height = sticky ? announcement.offsetHeight : 0;
          search.style.setProperty('--announcement-height', `${height}px`);
        }
      }
    }));

    Alpine.store('xMenuDrawer', {
      show: false,
      loading: false,
      currentMenuLinks: [],
      open() {
        this.show = true;
        Alpine.store('xPopup').open = true;
      },
      close() {
        this.show = false;
        Alpine.store('xPopup').close();
      },
      setActiveLink(linkId) {
        this.currentMenuLinks.push(linkId);
      },
      removeActiveLink(linkId) {
        const index = this.currentMenuLinks.indexOf(linkId);
        if (index !== -1) {
          this.currentMenuLinks.splice(index, 1);
        }
      },
      resetMenu() {
        this.currentMenuLinks = [];
      },
      scrollTop(el = null) { 
        document.getElementById('menu-navigation').scrollTop = 0; 
        if (el) {
          el.closest('.scrollbar-body').scrollTop = 0;
        }
      }
    });

    Alpine.store('xPopupPriceDetail', {
      open: false,
      cachedResults: [],
      show(event, productID, price, priceMax, priceMiddle, priceMin, shopUrl, pageHandle) {
        event.preventDefault()
        let content = document.getElementById("popup-price-content");
        if (this.cachedResults[productID]) {
          content.innerHTML = this.cachedResults[productID];
          this.open = true;
          return true;
        }

        let url = `${shopUrl}/pages/${pageHandle}`;
        fetch(url, {
          method: 'GET'
        }).then(
          response => response.text()
        ).then(responseText => {
          const html = (new DOMParser()).parseFromString(responseText, 'text/html');
          const textContent = html.querySelector(".page__container .page__body>div").innerHTML;
          let updatedContent = textContent.replace("{price}", `${price}`).replace("{max_price}", `${priceMax}`).replace("{middle_price}", `${priceMiddle}`).replace("{min_price}", `${priceMin}`);
          
          content.innerHTML = updatedContent;
          this.cachedResults[productID] = updatedContent;
        }).finally(() => {
          this.open = true;
        })
      },
      close() {
        this.open = false;
      }
    });

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

    Alpine.store('xQuickOrderList', {
        currentPage: 1,
        sectionId: '',
        productUrl: '',
        allListLoading: false,
        loading: false,
        suppressCartSync: false,
        cachedResults: {},
        collapsedGroups: {},
        showAll: false,
        popupRendered: false,
        groupPages: {},
        loadingMore: {},
        loadFailures: {},
        drafts: {},
        errorLines: {},
        addAllLoading: false,
        get dirtyCount() {
          return Object.keys(this.drafts).length;
        },
        get errorLineCount() {
          return Object.keys(this.errorLines).length;
        },
        get draftTotalQuantity() {
          return Object.values(this.drafts).reduce((total, item) => total + item.qty, 0);
        },
        get draftTotalPrice() {
          return Object.values(this.drafts).reduce((total, item) => total + item.lineTotal, 0);
        },
        setErrorLine(variantId, hasError) {
          if (hasError) {
            this.errorLines[variantId] = true;
          } else {
            delete this.errorLines[variantId];
          }
        },
        groupTotal(productId) {
          return Object.values(this.drafts).reduce((total, item) => item.productId == productId ? total + item.lineTotal : total, 0);
        },
        setDraft(variantId, qty, lineTotal, productId) {
          if (qty > 0) {
            this.drafts[variantId] = { qty: qty, lineTotal: lineTotal, productId: productId };
          } else {
            delete this.drafts[variantId];
          }
        },
        clearDrafts() {
          this.drafts = {};
          this.errorLines = {};
        },
        removeAll() {
          if (this.dirtyCount === 0 && this.errorLineCount === 0) return;
          this.clearDrafts();
          document.dispatchEvent(new CustomEvent('eurus:quick-order-list:drafts-cleared'));
        },
        addAllToCart() {
          const items = Object.entries(this.drafts).map(([id, item]) => ({ id, quantity: item.qty }));
          if (items.length === 0 || this.addAllLoading) return;
          this.addAllLoading = true;
          this.allListLoading = true;
          return Alpine.store('xCartHelper').withCartLock((standardEvent) => fetch(`${Shopify.routes.root}cart/add.js`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
              items: items,
              sections: Alpine.store('xCartHelper').getSectionsToRender().map((s) => s.id),
              sections_url: window.location.pathname
            })
          })
            .then((response) => Alpine.store('xCartHelper').cartJson(response))
            .then((response) => {
              if (response.status == '422') {
                document.dispatchEvent(new CustomEvent('eurus:product:add-failed', {
                  detail: { errorMessage: response.description || response.message }
                }));
                return Alpine.store('xCartHelper').settleWithCart(standardEvent, Alpine.store('xCartHelper').userErrorsFrom(response));
              }
              this.showAll = false;
              Alpine.store('xPopup').close();
              if (response.sections) Alpine.store('xCartHelper').reRenderSections(response.sections);
              Alpine.store('xCartHelper').currentItemCount = parseInt(document.getElementById('cart-icon-bubble').innerHTML);
              if (Alpine.store('xCartNoti') && Alpine.store('xCartNoti').enable) {
                Alpine.store('xCartNoti').setItem(response);
              } else {
                Alpine.store('xMiniCart')?.openCart();
              }
              document.dispatchEvent(new CustomEvent('eurus:product:added', { detail: { product: response } }));
              const added = Object.keys(this.drafts);
              this.clearDrafts();
              added.forEach((id) => {
                this._qtyInputs(id).forEach((input) => {
                  input.setAttribute('value', 0);
                  input.value = 0;
                });
              });
              document.dispatchEvent(new CustomEvent('eurus:quick-order-list:drafts-cleared'));
              this.suppressCartSync = true;
              document.dispatchEvent(new CustomEvent('eurus:cart:items-changed'));
              this.reloadPage();
              return Alpine.store('xCartHelper').settleWithCart(standardEvent);
            })
            .catch((error) => {
              standardEvent.fail(error);
              document.dispatchEvent(new CustomEvent('eurus:product:add-failed', { detail: { errorMessage: error } }));
              console.error('Error:', error);
            })
            .finally(() => {
              this.addAllLoading = false;
              this.allListLoading = false;
            }), {
            type: 'shopify:cart:lines-update',
            action: 'add',
            context: this.showAll ? 'dialog' : 'product',
            lines: Alpine.store('xCartHelper').addLines(items)
          });
        },
        init() {
          document.addEventListener(`eurus:cart:items-changed`, () => {
            if (this.suppressCartSync) {
              this.suppressCartSync = false;
              return;
            }
            this.reloadPage();
          });
          document.addEventListener('eurus:popup:close', () => {
            this.showAll = false;
          });
        },
        initPagination(sectionId, productUrl) {
          this.sectionId = sectionId;
          this.productUrl = productUrl;
        },
        toggleGroup(id) {
          this.collapsedGroups[id] = !this.collapsedGroups[id];
        },
        collapseByDefault(id) {
          if (this.collapsedGroups[id] === undefined) {
            this.collapsedGroups[id] = true;
          }
        },
        openAll() {
          this.popupRendered = true;
          this.showAll = true;
          Alpine.store('xPopup').open = true;
        },
        closeAll() {
          this.showAll = false;
          Alpine.store('xModal').removeFocus();
          Alpine.store('xPopup').close();
        },
        _scopePrefix(scope) {
          return scope === 'popup' ? 'popup-' : '';
        },
        _findInFetched(html, id, scope) {
          if (scope === 'popup') {
            const template = html.querySelector('template[data-qol-popup]');
            if (template) return template.content.querySelector(`#${CSS.escape(id)}`);
          }
          return html.getElementById(id);
        },
        _qtyInputs(variantId) {
          return Array.from(document.querySelectorAll(`[data-qol-qty="${variantId}"]`));
        },
        _lineErrors(variantId) {
          return Array.from(document.querySelectorAll(`[data-qol-line-error="${variantId}"]`));
        },
        isCollapsed(id) {
          return !!this.collapsedGroups[id];
        },
        _sectionLink(pageParam, page) {
          return `${this.productUrl.split('?')[0]}?${pageParam}=${page}&section_id=${this.sectionId}`;
        },
        _fetchSection(link, options) {
          return fetch(link, options)
            .then((response) => response.text())
            .then((responseText) => new DOMParser().parseFromString(responseText, 'text/html'));
        },
        loadMoreVariants(productId, nextPage, pageParam, scope = 'page') {
          nextPage = Number(nextPage) || 2;
          const groupKey = `${scope}-${productId}`;
          if (this.loadingMore[groupKey]) return Promise.resolve();
          if (((this.groupPages[groupKey] || {}).page || 1) >= nextPage) return Promise.resolve();
          this.loadingMore[groupKey] = true;

          const prefix = this._scopePrefix(scope);
          const link = this._sectionLink(pageParam, nextPage);
          return this._fetchSection(link)
            .then((html) => {
              const srcBody = this._findInFetched(html, `${prefix}qol-variants-${productId}`, scope);
              const desBody = document.getElementById(`${prefix}qol-variants-${productId}`);
              if (!srcBody || !desBody) {
                this.loadFailures[groupKey] = (this.loadFailures[groupKey] || 0) + 1;
                if (this.loadFailures[groupKey] > 1 && desBody) {
                  desBody.querySelector('.qol-sentinel')?.remove();
                }
                return false;
              }
              this.loadFailures[groupKey] = 0;
              const incoming = Array.from(srcBody.children);
              const variantRows = incoming.filter((row) => !row.classList.contains('qol-sentinel'));
              const hasFurtherPages = incoming.some((row) => row.classList.contains('qol-sentinel'));
              const oldSentinel = desBody.querySelector('.qol-sentinel');
              incoming.forEach((row) => {
                if (oldSentinel) {
                  desBody.insertBefore(row, oldSentinel);
                } else {
                  desBody.appendChild(row);
                }
              });
              if (oldSentinel) oldSentinel.remove();
              this.groupPages[groupKey] = { page: nextPage, param: pageParam, productId: productId, scope: scope };
              return variantRows.length === 0 && hasFurtherPages;
            })
            .catch((err) => {
              if (err.name !== 'AbortError') {
                console.error(err);
              }
              return false;
            })
            .finally(() => {
              this.loadingMore[groupKey] = false;
            })
            .then((keepLoading) => {
              if (keepLoading) return this.loadMoreVariants(productId, nextPage + 1, pageParam, scope);
            });
        },
        refreshLine(variantId) {
          this.cachedResults = {};
          const rows = Array.from(document.querySelectorAll(`[data-qol-variant="${variantId}"]`));
          if (!rows.length) return Promise.resolve();
          const pending = {};
          return Promise.all(rows.map((row) => {
            const productId = row.dataset.qolProduct;
            const scope = row.dataset.qolScope || 'page';
            const prefix = this._scopePrefix(scope);
            const link = this._sectionLink(row.dataset.qolPageParam || 'page', row.dataset.qolPage || 1);
            pending[link] = pending[link] || this._fetchSection(link);
            return pending[link]
              .then((html) => {
                const newRow = this._findInFetched(html, `${prefix}quick-order-list-item-${variantId}`, scope);
                const currentRow = document.getElementById(`${prefix}quick-order-list-item-${variantId}`);
                if (newRow && currentRow) {
                  currentRow.replaceWith(newRow);
                }
                [`${prefix}qol-group-total-${productId}`, `${prefix}qol-group-total-mobile-${productId}`, 'QuickOrderListSummary'].forEach((id) => {
                  const src = this._findInFetched(html, id, id === 'QuickOrderListSummary' ? 'page' : scope);
                  const des = document.getElementById(id);
                  if (src && des) {
                    des.innerHTML = src.innerHTML;
                  }
                });
              })
              .catch((err) => {
                if (err.name !== 'AbortError') {
                  console.error(err);
                }
              });
          }));
        },
        renderPage(html) {
          const src = html.getElementById('x-quick-order-list-container');
          const des = document.getElementById('x-quick-order-list-container');
          if (src && des) {
            des.innerHTML = src.innerHTML;
          }
        },
        async reloadPage() {
          const restore = { ...this.groupPages };
          this.groupPages = {};
          this.cachedResults = {};
          this.loadFailures = {};
          await this.loadPage(this.currentPage, true, false);
          for (const info of Object.values(restore)) {
            for (let p = 2; p <= info.page; p++) {
              await this.loadMoreVariants(info.productId, p, info.param, info.scope);
            }
          }
        },
        _scrollToTop() {
          Alpine.store("xHeaderMenu")?.suppressScroll?.(2000);
          document.getElementById('x-quick-order-list-container').parentElement.scrollIntoView({ behavior: "smooth" });
        },
        loadPage(pageParam, reload = false, scroll = true) {
          this.loading = true;
          const link = this._sectionLink('page', Number(pageParam));
          Alpine.store('xHelper').cancelRequest('eurus:quick_order_list_request');
          if (this.cachedResults[link] && !reload) {
            this.currentPage = Number(pageParam);
            if (scroll) this._scrollToTop();
            this.loading = false;
            this.renderPage(this.cachedResults[link]);
            return Promise.resolve();
          }
          const controller = new AbortController();
          Alpine.store('xHelper').requestControllers.set('eurus:quick_order_list_request', controller);
          return this._fetchSection(link, { signal: controller.signal })
            .then((html) => {
              this.renderPage(html);
              this.cachedResults[link] = html;
            })
            .catch((err) => {
              if (err.name !== 'AbortError') {
                console.error(err);
              }
            })
            .finally(() => {
              this.currentPage = Number(pageParam);
              if (scroll) this._scrollToTop();
              this.loading = false;
            });
        },
      });

      Alpine.data('xQuickOrderListItem', (variant, config, stockError) => ({
        draft: 0,
        hasError: false,
        init() {
          const saved = Alpine.store('xQuickOrderList').drafts[variant.id];
          this.draft = saved ? saved.qty : 0;
          this._setInputs(this.draft);
          document.addEventListener('eurus:quick-order-list:drafts-cleared', () => {
            this.draft = 0;
            this._setInputs(0);
            this._clearErrorMessage(variant.id);
          });
          document.addEventListener('eurus:quick-order-list:draft-updated', (event) => {
            if (event.detail.variantId != variant.id) return;
            this.draft = event.detail.qty;
          });
        },
        _inputs() {
          return Alpine.store('xQuickOrderList')._qtyInputs(variant.id);
        },
        _setInputs(value) {
          this._inputs().forEach((input) => {
            if (input) input.value = value;
          });
        },
        _unitPrice(qty) {
          let price = config.price;
          const breaks = config.priceBreaks || [];
          for (let i = 0; i < breaks.length; i++) {
            if (qty >= breaks[i].min) price = breaks[i].price;
          }
          return price;
        },
        _lineTotal(qty) {
          return qty * this._unitPrice(qty);
        },
        _setDraft(qty) {
          this.draft = qty;
          this._setInputs(qty);
          Alpine.store('xQuickOrderList').setDraft(variant.id, qty, this._lineTotal(qty), config.productId);
          document.dispatchEvent(new CustomEvent('eurus:quick-order-list:draft-updated', { detail: { variantId: variant.id, qty: qty } }));
        },
        onChangeQuantity(e, inCart, el) {
          const qty = parseInt(el.value) || 0;
          this._setInputs(qty);
          if (qty === 0) {
            this._clearErrorMessage(variant.id);
            this._setDraft(0);
            return;
          }
          const error = this._validate(qty);
          if (error) {
            this.draft = qty;
            Alpine.store('xQuickOrderList').setDraft(variant.id, 0);
            this._addErrorMessage(variant.id, error);
            return;
          }
          this._clearErrorMessage(variant.id);
          this._setDraft(qty);
        },
        _validate(qty) {
          const { min, max, step } = this._rule();
          if (min > 1 && qty < min) return config.msgMin;
          if (step > 1 && (qty - min) % step !== 0) return config.msgMultiple;
          if (max != null && qty > max) return config.msgMax;
          if (this._exceedsStock(qty)) return stockError;
          return null;
        },
        removeItem() {
          this._clearErrorMessage(variant.id);
          this._setDraft(0);
        },
        minus() {
          const current = parseInt(this._inputs()[0]?.value) || 0;
          if (current <= 0) {
            this._clearErrorMessage(variant.id);
            this._setDraft(0);
            return;
          }
          const { min, step } = this._rule();
          let next = current - step;
          if (next < min) next = 0;
          this.draft = next;
          this._setInputs(next);
          const error = next > 0 ? this._validate(next) : null;
          if (error) {
            Alpine.store('xQuickOrderList').setDraft(variant.id, 0);
            this._addErrorMessage(variant.id, error);
            return;
          }
          this._clearErrorMessage(variant.id);
          this._setDraft(next);
        },
        plus() {
          const { min, step } = this._rule();
          const current = parseInt(this._inputs()[0]?.value) || 0;
          const next = current <= 0 ? min : current + step;
          this.draft = next;
          this._setInputs(next);
          const error = this._validate(next);
          if (error) {
            Alpine.store('xQuickOrderList').setDraft(variant.id, 0);
            this._addErrorMessage(variant.id, error);
            return;
          }
          this._clearErrorMessage(variant.id);
          this._setDraft(next);
        },
        handleKeydown(evt, el) {
          if (evt.key !== 'Enter') return;
          evt.preventDefault();
          el.blur();
          el.focus();
        },
        invalid(el) {
          const number = parseFloat(el.value);
          if (!Number.isInteger(number) || number < 0) {
            el.value = 0;
          }
        },
        _exceedsStock(qty) {
          if (!config.checkStock) return false;
          return parseInt(qty) > config.stockLimit;
        },
        _rule() {
          return {
            min: config.min > 1 ? config.min : 1,
            max: config.max != null ? config.max : null,
            step: config.step > 1 ? config.step : 1
          };
        },
        _clearErrorMessage(id) {
          this.hasError = false;
          Alpine.store('xQuickOrderList').setErrorLine(id, false);
          Alpine.store('xQuickOrderList')._lineErrors(id).forEach((el) => el.classList.add('hidden'));
        },
        _addErrorMessage(id, message) {
          const errorElements = Alpine.store('xQuickOrderList')._lineErrors(id);
          if (!errorElements.length) return;
          this.hasError = true;
          Alpine.store('xQuickOrderList').setErrorLine(id, true);
          errorElements.forEach((el) => {
            el.classList.remove('hidden');
            el.getElementsByClassName('cart-item__error-text')[0].innerHTML = message;
          });
        },
      }));

      Alpine.data('xImgScrollingText', () => ({
        currentBlock: 1,
        handleScrollingAnim() {
          const contents = this.$el.querySelectorAll('[class*="block-content-"]');
          if (!contents.length) return;

          const mobileQuery = window.matchMedia('(max-width: 767px)');

          const updateOpacity = () => {
            if (mobileQuery.matches) {
              contents.forEach((content) => {
                content.style.opacity = '';
              });
              return;
            }

            const vh = window.innerHeight;
            let maxOpacity = -1;
            let maxIndex = 0;

            contents.forEach((content, index) => {
              const rect = content.getBoundingClientRect();
              const elementCenter = rect.top + rect.height / 2;
              const ratio = elementCenter / vh;

              const isFirst = index === 0;
              const isLast = index === contents.length - 1;
              
              let opacity;
              if ((ratio >= 0.3 && ratio <= 0.7) || (ratio > 0.7 && isFirst) || (ratio < 0.3 && isLast)) {
                opacity = 1;
              } else {
                const edgeDistance = ratio < 0.3 ? 0.3 - ratio : ratio - 0.7;
                const t = Math.min(edgeDistance / 0.3, 1);
                opacity = Math.max(0, 1 - Math.pow(t, 0.5));
              }

              content.style.opacity = opacity;

              if (opacity > maxOpacity) {
                maxOpacity = opacity;
                maxIndex = index;
              }
            });

            this.currentBlock = maxIndex + 1;
          };

          let ticking = false;
          const onScroll = () => {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => {
              updateOpacity();
              ticking = false;
            });
          };

          updateOpacity();
          window.addEventListener('scroll', onScroll, { passive: true });
          mobileQuery.addEventListener('change', updateOpacity);
        }
      }));

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
            if (Alpine.$data(prodEl).oos === true) return;

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

        // Recount the import review state from what is still unresolved. Once nothing is
        // left, drop the error/choice tables and the review pill together.
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
          const imageEl = doc.getElementById("x-variant-image");
          const imageUrl = imageEl ? imageEl.dataset.imageUrl : "";
          const imageQvUrl = imageEl ? imageEl.dataset.imageqvUrl : "";
          const inputsSrc = doc.getElementById('variant-update').querySelectorAll('input');
          if (!variantScript) {
            return;
          }
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
