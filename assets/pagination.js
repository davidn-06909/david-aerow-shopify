if (!window.Eurus.loadedScript.has('pagination.js')) {
  window.Eurus.loadedScript.add('pagination.js');

  requestAnimationFrame(() => {
    document.addEventListener("alpine:init", () => {
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
    });
  });
}