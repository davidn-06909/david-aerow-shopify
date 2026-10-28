if (!window.Eurus.loadedScript.has('image-with-scrolling-text.js')) {
  window.Eurus.loadedScript.add('image-with-scrolling-text.js');

  requestAnimationFrame(() => {
    document.addEventListener('alpine:init', () => {
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
    });
  });
}