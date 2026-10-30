if (!customElements.get('atelier-article')) {
  customElements.define('atelier-article', class extends HTMLElement {
    connectedCallback() {
      this.controller?.abort();
      this.controller = new AbortController();
      this.querySelector('[data-article-share]')?.addEventListener('click', () => this.share(), { signal: this.controller.signal });
    }

    disconnectedCallback() {
      this.controller?.abort();
      clearTimeout(this.resetTimer);
    }

    async share() {
      const button = this.querySelector('[data-article-share]');
      const label = button.querySelector('[data-article-share-label]');
      const status = this.querySelector('[data-article-share-status]');
      const fallback = this.querySelector('[data-article-copy]');
      const url = document.querySelector('link[rel="canonical"]')?.href || location.href;
      const originalLabel = this.shareLabel || label.textContent;
      this.shareLabel = originalLabel;
      button.disabled = true;
      clearTimeout(this.resetTimer);
      label.textContent = originalLabel;
      status.textContent = '';
      fallback.hidden = true;

      try {
        if (navigator.share) {
          await navigator.share({ title: button.dataset.title, url });
        } else {
          await navigator.clipboard.writeText(url);
          label.textContent = button.dataset.copied;
          status.textContent = button.dataset.copied;
          this.resetTimer = setTimeout(() => { label.textContent = originalLabel; }, 2400);
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          fallback.hidden = false;
          const input = fallback.querySelector('input');
          input.value = url;
          input.focus();
          input.select();
        }
      } finally {
        button.disabled = false;
      }
    }
  });
}
