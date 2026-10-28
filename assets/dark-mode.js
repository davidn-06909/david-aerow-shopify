if (!window.Eurus.loadedScript.has('dark-mode.js')) {
  window.Eurus.loadedScript.add('dark-mode.js');
  
  requestAnimationFrame(() => {
    document.addEventListener('alpine:init', () => { 
      Alpine.store('xDarkMode', {
        alias: "btn-theme-mode",
        toggleThemeMode() {
          Alpine.store('xDOM').rePainting = this.alias;
          setTimeout(() => {
            if (document.documentElement.classList.contains('dark')) {
              localStorage.eurus_theme = 0;
              document.documentElement.classList.remove('dark');
            } else {
              localStorage.eurus_theme = 1;
              document.documentElement.classList.add('dark');
            }
            Alpine.store('pseudoIconTheme').updatePseudoIconInputTheme();

            Alpine.store('xDOM').rePainting = null;
          }, 200); // INP
        },
        toggleLightMode() {
          Alpine.store('xDOM').rePainting = this.alias;
          setTimeout(() => {
            localStorage.eurus_theme = 0;
            document.documentElement.classList.remove('dark');
            Alpine.store('pseudoIconTheme').updatePseudoIconInputTheme();

            Alpine.store('xDOM').rePainting = null;
          }, 200); // INP
        },
        toggleDarkMode() {
          Alpine.store('xDOM').rePainting = this.alias;
          setTimeout(() => {
            localStorage.eurus_theme = 1;
            document.documentElement.classList.add('dark');
            Alpine.store('pseudoIconTheme').updatePseudoIconInputTheme();

            Alpine.store('xDOM').rePainting = null;
          }, 200); // INP
        }
      });
      Alpine.store('pseudoIconTheme', {
        init() {
          this.updatePseudoIconInputTheme();
        },
        updatePseudoIconInputTheme() {
          const themeMode = localStorage.getItem('eurus_theme');
          document.querySelectorAll('input[type="date"], input[type="time"]').forEach(input => {
            if (themeMode === '1') {
              input.style.colorScheme = 'dark';
            } else {
              input.removeAttribute('style');
            }
          });
        }      
      });
    })
  })
}