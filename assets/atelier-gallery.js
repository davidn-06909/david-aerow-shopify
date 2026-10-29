document.addEventListener('alpine:init', () => {
  Alpine.data('xAtelierGallery', () => ({
    canScroll: false,
    resizeObserver: null,

    init() {
      const track = this.$refs.track;
      this.resizeObserver = new ResizeObserver(() => {
        this.canScroll = track.scrollWidth > track.clientWidth + 2;
      });
      this.resizeObserver.observe(track);
    },

    scrollTo(left) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.$refs.track.scrollTo({ left, behavior: reduce ? 'instant' : 'smooth' });
    },

    step(direction) {
      const track = this.$refs.track;
      const card = track.firstElementChild;
      if (!card) return;
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      const flip = getComputedStyle(track).direction === 'rtl' ? -1 : 1;
      this.scrollTo(track.scrollLeft + (card.getBoundingClientRect().width + gap) * direction * flip);
    },

    onKeydown(event) {
      if (event.target !== this.$refs.track) return;
      const track = this.$refs.track;
      const flip = getComputedStyle(track).direction === 'rtl' ? -1 : 1;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        this.step((event.key === 'ArrowRight' ? 1 : -1) * flip);
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        this.scrollTo(event.key === 'Home' ? 0 : track.scrollWidth * flip);
      }
    },

    destroy() {
      this.resizeObserver?.disconnect();
    }
  }));
});
