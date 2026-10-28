if (!window.Eurus.loadedScript.has('sticky-atc.js')) {
  window.Eurus.loadedScript.add('sticky-atc.js');

  requestAnimationFrame(() => {
    document.addEventListener('alpine:init', () => {
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
      }))
    })
  })
}