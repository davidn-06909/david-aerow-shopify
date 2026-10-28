if (!window.Eurus.loadedScript.has('truncate-text.js')) {
  window.Eurus.loadedScript.add('truncate-text.js');
  
  requestAnimationFrame(() => {
    document.addEventListener('alpine:init', () => { 
      Alpine.data('xTruncateText', () => ({
        truncateEl: "",
        truncateInnerEl: "",
        truncated: false,
        truncatable: false,
        label: "",
        expanded: false,
        load(truncateEl) {
          const truncateRect = truncateEl.getBoundingClientRect();
          truncateEl.style.setProperty("--truncate-height", `${truncateRect.height}px`);
        },
        setTruncate(element) {
          if (element.offsetHeight < element.scrollHeight || element.offsetWidth < element.scrollWidth) {
            this.truncated = true;
            this.truncatable = true;
            this.expanded = false;
          } else {
            this.truncated = false;
            this.truncatable = false;
            this.expanded = true;
          }
        },
        open(el, newLabel) {
          const truncateEl = el.closest('.truncate-container').querySelector('.truncate-text');
          this.expanded = true;
          this.label = newLabel;
          if (truncateEl.classList.contains('truncate-expanded')) {
            this.truncated = true;
          } else {
            const truncateInnerEl = truncateEl.querySelector('.truncate-inner');
            window.requestAnimationFrame(() => {
              const truncateInnerRect = truncateInnerEl.getBoundingClientRect();
              truncateEl.style.setProperty("--truncate-height-expanded", `${truncateInnerRect.height}px`);
              truncateEl.classList.add('truncate-expanded');
            });
            this.truncated = false;
          }
        },
        close(el, newLabel, isQuickview = false, isImageComparison = false) {
          Alpine.store("xHeaderMenu")?.suppressScroll?.();
          this.label = newLabel;
          const truncateEl = el.closest('.truncate-container').querySelector('.truncate-text');
          const isInViewport = () => {
            const rect = truncateEl.getBoundingClientRect();
            return (rect.top >= 0 && rect.left >= 0 && rect.bottom <= (window.xViewport.innerHeight || document.documentElement.clientHeight) && rect.right <= (window.xViewport.innerWidth || document.documentElement.clientWidth))
          }
          this.truncated = true;
          if (!isInViewport() && !isQuickview) {
            if (isImageComparison) {
              this.$nextTick(() => {
                truncateEl.closest('.x-block-header').scrollIntoView({ behavior: "smooth", block: "center", container: "nearest" })
              })
            } else {
              const scrollPosition = truncateEl.getBoundingClientRect().top + window.scrollY - 500 ;
              window.scrollTo({
                top: scrollPosition,
                behavior: 'smooth'
              });
            }
            truncateEl.style.transition = 'none'
            setTimeout(() => {
              truncateEl.style.transition = ''
            }, 1000)
          }
          truncateEl.classList.remove('truncate-expanded');
          this.expanded = false;
        }
      }));
    })
  })
}