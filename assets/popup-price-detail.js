if (!window.Eurus.loadedScript.has('popup-price-detail.js')) {
  window.Eurus.loadedScript.add('popup-price-detail.js');
  
  requestAnimationFrame(() => {
    document.addEventListener('alpine:init', () => { 
      Alpine.store('xPopupPriceDetail', {
        open: false,
        cachedResults: [],
        show(event, productID, price, priceMax, priceMiddle, priceMin, shopUrl, pageHandle) {
          event.preventDefault()
          let content = document.getElementById("popup-price-content");
          if (this.cachedResults[productID]) {
            content.innerHTML = this.cachedResults[productID];
            this.open = true;
            return true;
          }

          let url = `${shopUrl}/pages/${pageHandle}`;
          fetch(url, {
            method: 'GET'
          }).then(
            response => response.text()
          ).then(responseText => {
            const html = (new DOMParser()).parseFromString(responseText, 'text/html');
            const textContent = html.querySelector(".page__container .page__body>div").innerHTML;
            let updatedContent = textContent.replace("{price}", `${price}`).replace("{max_price}", `${priceMax}`).replace("{middle_price}", `${priceMiddle}`).replace("{min_price}", `${priceMin}`);
            
            content.innerHTML = updatedContent;
            this.cachedResults[productID] = updatedContent;
          }).finally(() => {
            this.open = true;
          })
        },
        close() {
          this.open = false;
        }
      });
    })
  })
}
