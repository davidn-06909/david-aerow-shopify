document.addEventListener('alpine:init', () => {
  Alpine.data('xAtelierClients', () => ({
    index: 0,
    targetIndex: 0,
    direction: 1,
    root: null,
    cards: [],
    gesture: null,
    animation: null,
    animating: false,
    suppressClick: false,
    announcePending: false,
    autoplayStopped: false,
    hovered: false,
    focused: false,
    visible: false,
    destroyed: false,
    timer: null,
    listeners: null,
    observer: null,
    resizeObserver: null,
    motionQuery: null,
    reducedMotion: false,

    get formattedIndex() {
      return String(this.index + 1).padStart(2, '0');
    },

    init() {
      this.root = this.$el;
      this.cards = Array.from(this.$refs.deck.querySelectorAll('[data-client-card]'));
      this.listeners = new AbortController();
      const options = { signal: this.listeners.signal };
      this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.reducedMotion = this.motionQuery.matches;
      this.motionQuery.addEventListener('change', (event) => {
        this.reducedMotion = event.matches;
        this.cancelDrag();
        if (event.matches) this.animation?.finish();
        this.scheduleAutoplay();
      }, options);

      this.root.addEventListener('pointerenter', (event) => {
        if (event.pointerType !== 'mouse') return;
        this.hovered = true;
        this.clearTimer();
      }, options);
      this.root.addEventListener('pointerleave', () => {
        this.hovered = false;
        this.scheduleAutoplay();
      }, options);
      this.root.addEventListener('focusin', () => {
        this.focused = true;
        this.clearTimer();
      }, options);
      this.root.addEventListener('focusout', (event) => {
        this.focused = this.root.contains(event.relatedTarget);
        this.scheduleAutoplay();
      }, options);
      document.addEventListener('visibilitychange', () => this.scheduleAutoplay(), options);

      this.observer = new IntersectionObserver(([entry]) => {
        this.visible = entry.isIntersecting;
        if (this.visible) this.preloadCards();
        this.scheduleAutoplay();
      }, { rootMargin: '200px 0px', threshold: 0.2 });
      this.observer.observe(this.$refs.deck);
      this.resizeObserver = new ResizeObserver(() => this.cancelDrag());
      this.resizeObserver.observe(this.$refs.deck);
      this.syncCards();
    },

    syncCards() {
      const count = this.cards.length;
      this.cards.forEach((card, index) => {
        const depth = (index - this.index + count) % count;
        card.classList.toggle('is-top', depth === 0);
        card.classList.toggle('is-next', depth === 1);
        card.classList.toggle('is-under', depth === 2);
        card.setAttribute('aria-hidden', String(depth !== 0));
        card.inert = depth !== 0;
      });
    },

    preloadCards() {
      // Fetch the small deck near the viewport so the next swipe has a photo ready.
      this.cards.forEach(card => {
        const image = card.querySelector('img');
        if (image) image.loading = 'eager';
      });
    },

    step(direction, start = null, byUser = true) {
      const count = this.cards.length;
      if (count < 2) return;
      this.goTo((this.targetIndex + direction + count) % count, direction, start, byUser);
    },

    goTo(index, direction = 1, start = null, byUser = true) {
      if (this.destroyed || !this.cards[index]) return;
      if (byUser) {
        this.autoplayStopped = true;
        this.announcePending = true;
      }
      this.clearTimer();
      this.targetIndex = index;
      this.direction = direction;
      if (this.animating || this.targetIndex === this.index) return;
      this.cancelDrag();
      this.animateTo(index, direction, start);
    },

    animateTo(index, direction, start) {
      const leaving = this.cards[this.index];
      const styles = getComputedStyle(leaving);
      const from = start || { transform: styles.transform, opacity: styles.opacity };
      const rtl = getComputedStyle(this.root).direction === 'rtl' ? -1 : 1;
      const distance = this.$refs.deck.clientWidth * 0.85 * -direction * rtl;
      const tilt = parseFloat(styles.getPropertyValue('--clients-tilt')) || 0;
      this.animating = true;
      this.index = index;
      leaving.classList.add('is-leaving');
      this.syncCards();

      const finish = () => {
        leaving.classList.remove('is-leaving');
        this.animation = null;
        this.animating = false;
        if (this.destroyed) return;
        if (this.targetIndex !== this.index) {
          this.animateTo(this.targetIndex, this.direction, null);
          return;
        }
        if (this.announcePending) {
          this.$refs.status.textContent = this.root.dataset.statusTemplate
            .replace('[index]', this.index + 1)
            .replace('[total]', this.cards.length)
            .replace('[name]', this.cards[this.index].dataset.name);
          this.announcePending = false;
        }
        this.scheduleAutoplay();
      };

      if (this.reducedMotion) {
        finish();
        return;
      }
      this.animation = leaving.animate([
        from,
        { transform: `translate3d(${distance}px, -6%, 0) rotate(${tilt - direction * rtl * 12}deg)`, opacity: 0 }
      ], { duration: 380, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
      this.animation.finished.then(finish, finish);
    },

    pointerDown(event) {
      this.suppressClick = false;
      if (this.cards.length < 2 || this.animating || this.gesture || !event.isPrimary || event.button !== 0) return;
      if (event.target.closest('a, button, input, textarea, select')) return;
      this.clearTimer();
      this.gesture = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastTime: event.timeStamp,
        velocity: 0,
        distance: 0,
        width: this.$refs.deck.clientWidth,
        axis: null
      };
      this.$refs.deck.setPointerCapture(event.pointerId);
    },

    pointerMove(event) {
      const gesture = this.gesture;
      if (!gesture || gesture.id !== event.pointerId) return;
      const x = event.clientX - gesture.startX;
      const y = event.clientY - gesture.startY;
      if (!gesture.axis) {
        if (Math.max(Math.abs(x), Math.abs(y)) < 8) return;
        gesture.axis = Math.abs(x) > Math.abs(y) * 1.15 ? 'x' : 'y';
      }
      if (gesture.axis !== 'x') return;
      if (event.cancelable) event.preventDefault();
      const elapsed = event.timeStamp - gesture.lastTime;
      if (elapsed > 0) gesture.velocity = (event.clientX - gesture.lastX) / elapsed;
      gesture.lastX = event.clientX;
      gesture.lastTime = event.timeStamp;
      gesture.distance = x;
      this.suppressClick = true;
      this.$refs.deck.classList.add('is-dragging');
      const travel = Math.max(-gesture.width, Math.min(gesture.width, x));
      this.$refs.deck.style.setProperty('--clients-drag-x', `${travel}px`);
      this.$refs.deck.style.setProperty('--clients-drag-angle', `${travel / gesture.width * 12}deg`);
      this.$refs.deck.style.setProperty('--clients-drag-opacity', 1 - Math.abs(travel / gesture.width) * 0.35);
    },

    pointerUp(event) {
      const gesture = this.gesture;
      if (!gesture || gesture.id !== event.pointerId) return;
      const distance = gesture.distance;
      const recentFlick = event.timeStamp - gesture.lastTime < 100
        && Math.abs(gesture.velocity) > 0.45
        && Math.abs(distance) > 24
        && Math.sign(gesture.velocity) === Math.sign(distance);
      const commit = gesture.axis === 'x'
        && (Math.abs(distance) > Math.min(100, gesture.width * 0.22) || recentFlick);
      const styles = getComputedStyle(this.cards[this.index]);
      const start = { transform: styles.transform, opacity: styles.opacity };
      this.cancelDrag();
      if (commit) {
        const rtl = getComputedStyle(this.root).direction === 'rtl' ? -1 : 1;
        this.step((distance < 0 ? 1 : -1) * rtl, start);
      }
    },

    cancelDrag(event = null) {
      if (!this.gesture) return;
      if (event && event.pointerId !== this.gesture.id) return;
      const id = this.gesture.id;
      this.gesture = null;
      const deck = this.$refs.deck;
      deck.classList.remove('is-dragging');
      ['--clients-drag-x', '--clients-drag-angle', '--clients-drag-opacity'].forEach(name => deck.style.removeProperty(name));
      if (deck.hasPointerCapture(id)) deck.releasePointerCapture(id);
      this.scheduleAutoplay();
    },

    preventDragClick(event) {
      if (!this.suppressClick) return;
      event.preventDefault();
      event.stopPropagation();
    },

    onKeydown(event) {
      if (event.target !== this.$refs.deck) return;
      const rtl = getComputedStyle(this.root).direction === 'rtl' ? -1 : 1;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        this.step((event.key === 'ArrowRight' ? 1 : -1) * rtl);
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        this.goTo(event.key === 'Home' ? 0 : this.cards.length - 1);
      }
    },

    selectBlock(event) {
      const index = this.cards.findIndex(card => card.dataset.blockId === event.detail.blockId);
      if (index >= 0) this.goTo(index);
    },

    clearTimer() {
      window.clearTimeout(this.timer);
      this.timer = null;
    },

    scheduleAutoplay() {
      this.clearTimer();
      if (this.destroyed || this.root.dataset.autoplay !== 'true' || this.autoplayStopped
        || this.cards.length < 2 || this.reducedMotion || !this.visible || this.hovered
        || this.focused || this.gesture || this.animating || document.hidden || window.Shopify?.designMode) return;
      const interval = Math.max(3000, Number(this.root.dataset.interval) || 5000);
      this.timer = window.setTimeout(() => this.step(1, null, false), interval);
    },

    toggleAutoplay() {
      this.autoplayStopped = !this.autoplayStopped;
      this.scheduleAutoplay();
    },

    destroy() {
      this.destroyed = true;
      this.clearTimer();
      this.cancelDrag();
      this.animation?.cancel();
      this.observer?.disconnect();
      this.resizeObserver?.disconnect();
      this.listeners?.abort();
    }
  }));
});
