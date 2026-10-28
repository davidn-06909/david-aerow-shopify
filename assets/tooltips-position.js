if (!window.Eurus.loadedScript.has('tooltips-position.js')) {
  window.Eurus.loadedScript.add('tooltips-position.js');
  requestAnimationFrame(() => {
    document.addEventListener('alpine:init', () => {
      Alpine.data('xTooltips', () => ({
        flipDown: false,
        _scrollHandler: null,
        _resizeHandler: null,
        _scrollTicking: false,
        _visibilityObserver: null,
        _anchorVisible: false,
        _content: null,
        _flipInit: false,
        _viewportMiddle: 0,
        handleTooltipsPosition() {
          const anchor = this.$el.parentElement;

          this._scrollHandler = () => {
            if (!this._anchorVisible || this._scrollTicking) return;
            this._scrollTicking = true;
            requestAnimationFrame(() => {
              this._updateFlip();
              this._scrollTicking = false;
            });
          };

          this._resizeHandler = () => {
            this._viewportMiddle = window.innerHeight / 2;
            this._scrollHandler();
          };

          this._visibilityObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
              this._anchorVisible = entry.isIntersecting;
              if (this._anchorVisible) {
                this._viewportMiddle = window.innerHeight / 2;
                this._updateFlip();
                window.addEventListener('scroll', this._scrollHandler, { passive: true });
                window.addEventListener('resize', this._resizeHandler, { passive: true });
              } else {
                window.removeEventListener('scroll', this._scrollHandler);
                window.removeEventListener('resize', this._resizeHandler);
              }
            });
          });
          this._visibilityObserver.observe(anchor);
        },
        _updateFlip() {
          const anchor = this.$el.parentElement;
          const anchorRect = anchor.getBoundingClientRect();
          const anchorCenter = anchorRect.top + anchorRect.height / 2;
          const flipDown = anchorCenter < this._viewportMiddle;

          if (this._flipInit && flipDown === this.flipDown) return;
          this._flipInit = true;
          this.flipDown = flipDown;

          this._content ??= this.$el.querySelector('.tooltip-content');
          this._content?.classList.toggle('tooltips-flip-down', flipDown);
          this._content?.classList.toggle('tooltips-flip-up', !flipDown);
        },

        destroy() {
          this._visibilityObserver?.disconnect();
          window.removeEventListener('scroll', this._scrollHandler);
          window.removeEventListener('resize', this._resizeHandler);
        }
      }));
    })
  })
}