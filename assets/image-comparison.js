if (!window.Eurus.loadedScript.has('image-comparison.js')) {
  window.Eurus.loadedScript.add('image-comparison.js');

  const registerAtelierComparison = () => {
    Alpine.data('xAtelierComparison', (layout) => ({
      stage: null,
      stopDrag: null,

      init() {
        this.stage = this.$el;
        this.setPosition(this.$refs.range.value);
      },

      setPosition(value) {
        const position = Math.min(100, Math.max(0, Math.round(Number(value))));
        this.$refs.range.value = position;
        this.$refs.range.setAttribute('aria-valuetext', position + '%');
        this.stage.style.setProperty('--position', position + '%');
      },

      startDrag(event) {
        if (!event.isPrimary || event.button !== 0) return;
        this.stopDrag?.();
        const media = this.$refs.media;
        const pointerId = event.pointerId;
        const move = (moveEvent) => {
          if (moveEvent.pointerId !== pointerId) return;
          const rect = media.getBoundingClientRect();
          let ratio = layout === 'vertical'
            ? (moveEvent.clientY - rect.top) / rect.height
            : (moveEvent.clientX - rect.left) / rect.width;
          if (layout !== 'vertical' && getComputedStyle(this.stage).direction === 'rtl') {
            ratio = 1 - ratio;
          }
          this.setPosition(ratio * 100);
        };
        const stop = (stopEvent) => {
          if (!stopEvent || stopEvent.pointerId === pointerId) this.stopDrag?.();
        };
        this.stopDrag = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', stop);
          window.removeEventListener('pointercancel', stop);
          if (media.hasPointerCapture(pointerId)) media.releasePointerCapture(pointerId);
          this.stopDrag = null;
        };
        media.setPointerCapture(pointerId);
        move(event);
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', stop);
        window.addEventListener('pointercancel', stop);
      },

      destroy() {
        this.stopDrag?.();
      }
    }));
  };
  if (window.Alpine) registerAtelierComparison();
  else document.addEventListener('alpine:init', registerAtelierComparison, { once: true });

  requestAnimationFrame(() => {
    document.addEventListener('alpine:init', () => {
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
    });
  });
}
