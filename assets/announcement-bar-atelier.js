(() => {
  const registerAnnouncement = () => {
    Alpine.data('xAtelierAnnouncement', () => ({
      active: 0,
      ready: false,
      playing: false,
      timer: null,
      cleanups: [],

      init() {
        this.items = Array.from(this.$el.querySelectorAll('[data-announcement-item]'));
        this.motion = window.matchMedia('(prefers-reduced-motion: reduce)');
        const listen = (target, event, handler) => {
          target.addEventListener(event, handler);
          this.cleanups.push(() => target.removeEventListener(event, handler));
        };
        listen(this.motion, 'change', () => {
          if (this.motion.matches) this.stop();
        });
        listen(document, 'visibilitychange', () => {
          if (document.hidden) this.clearTimer();
          else if (this.playing) this.start();
        });
        listen(document, 'shopify:block:select', (event) => {
          const index = this.items.findIndex(item => item === event.target || item.contains(event.target));
          if (index !== -1) {
            this.stop();
            this.active = index;
          }
        });
        this.ready = true;
        if (this.$el.dataset.autoplay === 'true' && !this.motion.matches && !Shopify.designMode) {
          this.start();
        }
      },

      start() {
        this.clearTimer();
        if (this.items.length < 2) return;
        this.playing = true;
        if (!document.hidden) {
          const interval = Number(this.$el.dataset.interval) || 6000;
          this.timer = window.setInterval(() => {
            this.active = (this.active + 1) % this.items.length;
          }, interval);
        }
      },

      clearTimer() {
        window.clearInterval(this.timer);
        this.timer = null;
      },

      stop() {
        this.clearTimer();
        this.playing = false;
      },

      go(step) {
        this.stop();
        this.active = (this.active + step + this.items.length) % this.items.length;
      },

      togglePlayback() {
        if (this.playing) this.stop();
        else this.start();
      },

      destroy() {
        this.stop();
        this.cleanups.forEach(cleanup => cleanup());
      }
    }));
  };

  if (window.Alpine) registerAnnouncement();
  else document.addEventListener('alpine:init', registerAnnouncement, { once: true });
})();
