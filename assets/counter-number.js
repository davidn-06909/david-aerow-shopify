if (!window.Eurus.loadedScript.has('counter-number.js')) {
  window.Eurus.loadedScript.add('counter-number.js');

  requestAnimationFrame(() => {
    document.addEventListener('alpine:init', () => {
      Alpine.data('xCounterNumber', (config) => ({
        animationFrameId: null,
        target: config.target || 0,
        locale: config.locale || 'en-US',
        duration: config.duration || 1000,
        current: 0,
        number: '0',
        started: false,
        start() {
        if (this.started) return
        this.started = true
        this.countUpAnimation()
        },
        countUpAnimation() {
          const startTime = performance.now();
          const update = (time) => {
            const progress = Math.min((time - startTime) / this.duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            this.current = this.target * eased;
            this.number = this.format(this.current);
            if (progress < 1) {
            this.animationFrameId = window.requestAnimationFrame(update);   
            } else {
            this.number = this.format(this.target);
            this.animationFrameId = null
            }
          }
          this.animationFrameId = requestAnimationFrame(update)
        },
        format(value) {
          const options = {
            maximumFractionDigits: this.decimalPlaces(this.target)
          }
          return Number(value).toLocaleString(this.locale, options);
        },
        decimalPlaces(number) {
          const decimalPart = number.toString().split('.')[1];
          return decimalPart ? decimalPart.length : 0;
        }
      }))
    })
  })
}