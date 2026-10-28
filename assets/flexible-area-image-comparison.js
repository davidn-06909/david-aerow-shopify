if (!window.Eurus.loadedScript.has('flexible-area-image-comparison.js')) {
  window.Eurus.loadedScript.add('flexible-area-image-comparison.js');

  requestAnimationFrame(() => {
    document.addEventListener('alpine:init', () => {
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
    });
  });
}
