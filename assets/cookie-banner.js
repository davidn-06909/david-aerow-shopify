requestAnimationFrame(() => {
  document.addEventListener('alpine:init', () => {
    Alpine.data('xCookieBanner', (delay) => ({
      show: false,
      showPreferencesPopup: false,
      saleOfDataRegion: false,
      prefs: {
        analytics: false,
        marketing: false,
        preferences: false,
        sale_of_data: false,
      },

      init() {
        setTimeout(() => {
          window.Shopify.loadFeatures([
            {
              name: 'consent-tracking-api',
              version: '0.1',
            }
          ],
          (error) => {
            if (error) {
              throw error;
            }

            const userCanBeTracked = window.Shopify.customerPrivacy.userCanBeTracked();
            const userTrackingConsent = window.Shopify.customerPrivacy.getTrackingConsent();
            this.saleOfDataRegion = window.Shopify.customerPrivacy.saleOfDataRegion();
            this.syncFromShopify();

            if(!userCanBeTracked && userTrackingConsent === 'no_interaction') {
              requestAnimationFrame(() => {
                this.show = true;
              });
            }

            document.addEventListener('visitorConsentCollected', () => {
              this.syncFromShopify();
            });

          });
        }, delay * 1000);
      },

      syncFromShopify() {
        const cp = window.Shopify.customerPrivacy;
        if (!cp) return;
        const current = cp.currentVisitorConsent();
        this.prefs.analytics = current.analytics === 'yes';
        this.prefs.marketing = current.marketing === 'yes';
        this.prefs.preferences = current.preferences === 'yes';
        this.prefs.sale_of_data = current.sale_of_data === 'yes';
      },

      handleAccept() {
        if (window.Shopify.customerPrivacy) {
          window.Shopify.customerPrivacy.setTrackingConsent(true, () => {});
          requestAnimationFrame(() => {
            this.show = false;
          });
        }
      },

      handleDecline() {
        if (window.Shopify.customerPrivacy) {
          window.Shopify.customerPrivacy.setTrackingConsent(false, () => {});
          requestAnimationFrame(() => {
            this.show = false;
          });
        }
      },

      handleManagePreferences() {
        this.syncFromShopify();
        this.showPreferencesPopup = true;
      },

      closePreferences() {
        this.showPreferencesPopup = false;
      },

      handleAcceptAll() {
        this.prefs.analytics = true;
        this.prefs.marketing = true;
        this.prefs.preferences = true;
        if (this.saleOfDataRegion) {
          this.prefs.sale_of_data = true;
        }
        this.persist();
      },

      handleDeclineAll() {
        this.prefs.analytics = false;
        this.prefs.marketing = false;
        this.prefs.preferences = false;
        if (this.saleOfDataRegion) {
          this.prefs.sale_of_data = false;
        }
        this.persist();
      },

      handleSaveChoices() {
        this.persist();
      },

      persist() {
        const cp = window.Shopify.customerPrivacy;
        if (!cp) return;
        const payload = {
          analytics: this.prefs.analytics,
          marketing: this.prefs.marketing,
          preferences: this.prefs.preferences,
        };
        if (this.saleOfDataRegion) {
          payload.sale_of_data = this.prefs.sale_of_data;
        }
        cp.setTrackingConsent(payload, () => {
          requestAnimationFrame(() => {
            this.show = false;
            if (this.showPreferencesPopup) Alpine.store('xModal').removeFocus();
            this.showPreferencesPopup = false;
          });
        });
      },
    }));
  });
});
