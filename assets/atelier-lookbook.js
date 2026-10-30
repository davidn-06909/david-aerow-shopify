document.addEventListener('alpine:init', () => {
  Alpine.data('xAtelierLookbook', () => ({
    openDot: null,
    observer: null,
    current: 0,
    chapters: [],

    init() {
      this.chapters = [...this.$root.querySelectorAll('[data-lookbook-chapter]')];
      this.warm(1);
      if (!('IntersectionObserver' in window)) return;
      const ratios = new Map();
      this.observer = new IntersectionObserver(entries => {
        entries.forEach(entry => ratios.set(entry.target, entry.intersectionRatio));
        let best = null;
        let bestRatio = 0;
        ratios.forEach((ratio, chapter) => {
          if (ratio > bestRatio) { bestRatio = ratio; best = chapter; }
        });
        if (!best) return;
        const index = this.chapters.indexOf(best);
        if (this.current !== index) this.closeSpot();
        this.current = index;
        if (this.$refs.counter) this.$refs.counter.textContent = String(index + 1);
        this.warm(index + 1);
      }, { threshold: [0, 0.25, 0.5, 0.75, 1], rootMargin: '-20% 0px -20% 0px' });
      this.chapters.forEach(chapter => this.observer.observe(chapter));
    },

    warm(index) {
      const image = this.chapters[index]?.querySelector('.atelier-lookbook__image');
      if (image) image.loading = 'eager';
    },

    toggleSpot(event) {
      let dot = event.currentTarget;
      // Nearby touch targets overlap: choose the visible dot nearest the tap.
      if (event.detail > 0) {
        const dots = [...dot.closest('.atelier-lookbook__media').querySelectorAll('.atelier-lookbook__dot')];
        const distance = candidate => {
          const rect = candidate.getBoundingClientRect();
          return Math.hypot(event.clientX - rect.x - rect.width / 2, event.clientY - rect.y - rect.height / 2);
        };
        dot = dots.reduce((nearest, candidate) => distance(candidate) < distance(nearest) ? candidate : nearest, dot);
      }
      const wasOpen = this.openDot === dot;
      this.closeSpot();
      if (wasOpen) return;
      const card = this.$root.querySelector(`#${CSS.escape(dot.getAttribute('aria-controls'))}`);
      if (!card) return;
      this.openDot = dot;
      dot.setAttribute('aria-expanded', 'true');
      card.hidden = false;
      this.positionCard();
    },

    positionCard() {
      if (!this.openDot) return;
      const card = this.$root.querySelector(`#${CSS.escape(this.openDot.getAttribute('aria-controls'))}`);
      if (!card) return;
      card.style.removeProperty('left');
      card.style.removeProperty('top');
      if (window.matchMedia('(max-width: 749px)').matches) return;
      const media = this.openDot.closest('.atelier-lookbook__media').getBoundingClientRect();
      const dot = this.openDot.getBoundingClientRect();
      const left = Math.max(12, Math.min(dot.x - media.x + dot.width / 2 - card.offsetWidth / 2, media.width - card.offsetWidth - 12));
      const below = dot.bottom - media.y + 10;
      const top = below + card.offsetHeight <= media.height - 12 ? below : dot.top - media.y - card.offsetHeight - 10;
      card.style.left = `${left}px`;
      card.style.top = `${Math.max(12, top)}px`;
    },

    closeSpot(restoreFocus = false) {
      if (!this.openDot) return;
      const dot = this.openDot;
      const card = this.$root.querySelector(`#${CSS.escape(dot.getAttribute('aria-controls'))}`);
      dot.setAttribute('aria-expanded', 'false');
      if (card) card.hidden = true;
      this.openDot = null;
      if (restoreFocus || card?.contains(document.activeElement)) dot.focus({ preventScroll: true });
    },

    destroy() {
      this.observer?.disconnect();
      this.closeSpot();
    }
  }));
});
