if (!window.Eurus.loadedScript.has('double-touch.js')) {
  window.Eurus.loadedScript.add('double-touch.js');

  requestAnimationFrame(() => {
    document.addEventListener('alpine:init', () => {
      Alpine.data('xDoubleTouch', (productUrl) => ({
        lastTapTime: 0,
        DOUBLE_TAP_DELAY: 300,
        singleTapTimeout: null,
        touchStartX: 0,
        touchStartY: 0,
        touchMoved: false,
        MAX_MOVE_THRESHOLD: 10,
        showSecond: false,

        onTouchStart(event) {
          const touch = event.touches[0];
          this.touchStartX = touch.clientX;
          this.touchStartY = touch.clientY;
          this.touchMoved = false;
        },
  
        onTouchMove(event) {
          const touch = event.touches[0];
          const deltaX = Math.abs(touch.clientX - this.touchStartX);
          const deltaY = Math.abs(touch.clientY - this.touchStartY);
          if (deltaX > this.MAX_MOVE_THRESHOLD || deltaY > this.MAX_MOVE_THRESHOLD) {
            this.touchMoved = true;
          }
        },
  
        onTouchEnd(splide, carousel) {
          if (this.touchMoved) {
            return;
          }
  
          const currentTime = new Date().getTime();
          const tapLength = currentTime - this.lastTapTime;
  
          if (tapLength < this.DOUBLE_TAP_DELAY && tapLength > 0) {
            clearTimeout(this.singleTapTimeout);
            this.lastTapTime = 0;
            this.onDoubleTap(splide, carousel);
          } else {
            this.lastTapTime = currentTime;
            this.singleTapTimeout = setTimeout(() => {
              this.onSingleTap();
            }, this.DOUBLE_TAP_DELAY);
          }
        },
  
        onSingleTap() {
          window.location.href= productUrl
        },
  
        onDoubleTap(splide, carousel) {
          if (carousel) {
            Alpine.store('xSplide').togglePlayPause(splide)
          } else {
            this.showSecond = !this.showSecond;
          }
        }
      }));
    })
  });
}    