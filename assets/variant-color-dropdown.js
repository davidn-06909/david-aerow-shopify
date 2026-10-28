if (!window.Eurus.loadedScript.has('variant-color-dropdown.js')) {
  window.Eurus.loadedScript.add('variant-color-dropdown.js');

  requestAnimationFrame(() => {
    document.addEventListener('alpine:init', () => {
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
    });
  });
}
