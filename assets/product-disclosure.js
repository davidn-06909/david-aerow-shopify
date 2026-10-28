if (!window.Eurus.loadedScript.has('product-disclosure.js')) {
  window.Eurus.loadedScript.add('product-disclosure.js');
  
  requestAnimationFrame(() => {
    document.addEventListener('alpine:init', () => {
      Alpine.store('xProductDisclosure', {
        show: false,
        trigger: '',
        items: [],
        clearTimer: null,
        // Open popup, keep `triggerId` to restore focus on close,
        // load list from the JSON script tag `dataId`
        open(triggerId, dataId) {
          clearTimeout(this.clearTimer);
          this.items = this.readData(dataId);
          this.show = true;
          this.trigger = triggerId;
          Alpine.store('xPopup').open = true;
        },
        // Parse disclosure list rendered in a script tag; [] when missing or malformed
        readData(dataId) {
          const dataEl = document.getElementById(dataId);
          if (!dataEl) return [];
          try {
            return JSON.parse(dataEl.textContent);
          } catch (e) {
            return [];
          }
        },
        // Trap focus inside popup, starting on its close button
        trapFocus() {
          Alpine.store('xFocusElement').trapFocus('CartDisclosurePopup', 'CloseCartDisclosure');
        },
        // Close popup, return focus to the trigger that opened it.
        // Clear `items` only after the leave transition so the list stays painted while it plays
        close() {
          const activeElement = document.getElementById(this.trigger);
          Alpine.store('xFocusElement').removeTrapFocus(activeElement);
          this.show = false;
          this.trigger = '';
          clearTimeout(this.clearTimer);
          this.clearTimer = setTimeout(() => {
            this.items = [];
          }, 500);
          Alpine.store('xPopup').close();
        }
      });
    })
  });
}
