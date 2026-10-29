document.addEventListener('alpine:init', () => {
  Alpine.data('xAtelierMediaStory', () => ({
    playing: false,
    visible: false,
    userPaused: false,
    manualPlay: false,
    videoSource: '',
    autoplay: false,
    cleanups: [],

    init() {
      const video = this.$refs.video;
      this.videoSource = this.$el.dataset.videoSrc;
      this.autoplay = this.$el.dataset.autoplay === 'true';
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      const listen = (target, event, handler) => {
        target.addEventListener(event, handler);
        this.cleanups.push(() => target.removeEventListener(event, handler));
      };
      const updatePlayback = () => {
        const autoplay = this.autoplay && !reducedMotion.matches;
        if (this.visible && !document.hidden && !this.userPaused && (autoplay || this.manualPlay)) {
          this.loadVideo();
          video.play().catch(() => { this.playing = false; });
        } else {
          video.pause();
        }
      };
      const observer = new IntersectionObserver(([entry]) => {
        this.visible = entry.isIntersecting;
        updatePlayback();
      });
      observer.observe(this.$el);
      this.cleanups.push(() => observer.disconnect());
      listen(document, 'visibilitychange', updatePlayback);
      listen(reducedMotion, 'change', () => {
        this.manualPlay = false;
        updatePlayback();
      });
    },

    loadVideo() {
      const video = this.$refs.video;
      if (!video.getAttribute('src')) {
        video.src = this.videoSource;
        video.muted = true;
        video.load();
      }
    },

    toggleVideo() {
      const video = this.$refs.video;
      this.userPaused = !video.paused;
      this.manualPlay = video.paused;
      if (video.paused) {
        this.loadVideo();
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
