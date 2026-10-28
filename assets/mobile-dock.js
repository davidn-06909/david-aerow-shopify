if (!window.Eurus.loadedScript.has('mobile-dock.js')) {
  window.Eurus.loadedScript.add('mobile-dock.js');
  
  requestAnimationFrame(() => {
    document.addEventListener("alpine:init", () => {
      Alpine.store('xMobileDock', {
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
            if (window.xViewport.innerWidth > 768) {
              this.showDock = false;
              return;
            }
            if (!header) {
              this.showDock = true;
            } else {
              if (headerBottom) {
                const bottomLine = (Alpine.store('xHeaderMenu').isTransparent) ? headerBottom.getBoundingClientRect().bottom + Alpine.store('xHeaderMenu').stickyOffsetHeight : headerBottom.getBoundingClientRect().bottom;
                this.showDock = (bottomLine < 0);
              } else {
                headerBottom = document.getElementById('x-header-sentinel-bottom');
                this.showDock = true;
              }
            }
          }
          requestAnimationFrame(updateDock)
          window.addEventListener('scroll', this.debounce(updateDock, 50), { passive: true });
        },
        setPositionSearch() {
          const search = document.getElementById('FormSearchMobileDock');
          if (search) {
            const announcement = document.getElementById('x-announcement');
            let height;
            if (announcement) {
              let sticky = announcement?.dataset.isSticky == "true";
              height = sticky ? announcement?.offsetHeight : 0;  
            } else {
              height = 0;
            }
            search.style.setProperty('--announcement-height', `${height}px`);
          }
        }
      });
    });
  });
}
