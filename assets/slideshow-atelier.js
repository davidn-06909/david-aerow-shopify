document.addEventListener('alpine:init', () => {
  Alpine.data('xAtelierHero', () => ({
    playing: false,
    userPaused: false,
    manualPlay: false,
    visible: false,
    cleanups: [],

    init() {
      const desktop = window.matchMedia('(min-width: 750px)');
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      const video = this.$refs.video;
      const updatePlayback = () => {
        if (!video) return;
        const autoplay = this.$el.dataset.autoplay === 'true' && !reducedMotion.matches;
        if (this.visible && !document.hidden && !this.userPaused && (autoplay || this.manualPlay)) {
          video.play().catch(() => { this.playing = false; });
        } else {
          video.pause();
        }
      };
      const updateMedia = () => {
        if (!video) return;
        const mode = desktop.matches ? 'desktop' : 'mobile';
        const source = this.$el.dataset[`${mode}Src`];
        video.poster = this.$el.dataset[`${mode}Poster`];
        if (source && video.getAttribute('src') !== source) {
          video.src = source;
          video.muted = true;
          video.load();
        }
        updatePlayback();
      };
      const observer = new IntersectionObserver(([entry]) => {
        this.visible = entry.isIntersecting;
        updatePlayback();
      });
      observer.observe(this.$el);
      this.cleanups.push(() => observer.disconnect());

      const resizeObserver = new ResizeObserver(() => this.fitHeading(desktop.matches));
      resizeObserver.observe(this.$el);
      this.cleanups.push(() => resizeObserver.disconnect());
      const listen = (target, event, handler) => {
        target.addEventListener(event, handler);
        this.cleanups.push(() => target.removeEventListener(event, handler));
      };
      listen(desktop, 'change', updateMedia);
      listen(reducedMotion, 'change', () => {
        this.manualPlay = false;
        updatePlayback();
      });
      listen(document, 'visibilitychange', updatePlayback);
      updateMedia();
      document.fonts.ready.then(() => {
        if (this.$el.isConnected) this.fitHeading(desktop.matches);
      });
    },

    fitHeading(desktop) {
      const heading = this.$refs.heading;
      if (!heading) return;
      this.$el.style.setProperty('--atelier-display-fit', '1');
      if (!desktop) return;
      const room = heading.parentElement.clientWidth;
      const widest = Math.max(...Array.from(heading.querySelectorAll('.atelier-hero__line > span'), line => line.scrollWidth));
      if (room && widest > room) {
        this.$el.style.setProperty('--atelier-display-fit', Math.max(0.45, room / widest * 0.985).toFixed(3));
      }
    },

    toggleVideo() {
      const video = this.$refs.video;
      if (!video) return;
      this.userPaused = !video.paused;
      this.manualPlay = video.paused;
      if (video.paused) {
        video.play().catch(() => { this.playing = false; });
      } else {
        video.pause();
      }
    },

    destroy() {
      this.$refs.video?.pause();
      this.cleanups.forEach(cleanup => cleanup());
    }
  }));
});
