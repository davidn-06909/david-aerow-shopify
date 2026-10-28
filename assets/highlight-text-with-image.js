if (!window.Eurus.loadedScript.has('highlight-text-with-image.js')) {
    window.Eurus.loadedScript.add('highlight-text-with-image.js');
    
    requestAnimationFrame(() => {
      document.addEventListener('alpine:init', () => {
        Alpine.data('xHighlightAnimation', () => ({
          initElements: null,
          animationFrameId: null,
          highlightChildCache: new Map(),
          observer: null,
          debounce (func, timeout = 300) {
            let timer;
            return (...args) => {
              clearTimeout(timer);
              timer = setTimeout(() => { func.apply(this, args); }, timeout);
            };
          },
          load(el, rtl_check, equalLines, fullScreen = false, range = 0) {
            this.initElements = this.separateWords(el);
            this.partitionIntoLines(el, rtl_check, equalLines, fullScreen, range);

            let lastWidth = window.xViewport.innerHeight;
            window.addEventListener("resize", this.debounce(() => {
              if (window.xViewport.innerHeight !== lastWidth) {
                lastWidth = window.xViewport.innerHeight;
                this.partitionIntoLines(el, rtl_check, equalLines, fullScreen, range);
              }
            }));
          },
          calRelativePos(el, rtl_check = false) {
            const elRect = el.getBoundingClientRect();
            const parentRect = el.parentElement.getBoundingClientRect();

            const pos = Math.round((elRect.left - parentRect.left) / parentRect.width * 100)
            
            return rtl_check ? Math.max(0, Math.min(100, 100 - pos)) : pos;
          },

          separateWords(container) {
            let elements = [];
          
            container.childNodes.forEach(node => {
              if (node.nodeType === Node.TEXT_NODE && node.textContent !== '') {
                let words = node.textContent.match(/(\s+|[^\s-]+|[-])/g);
                words?.forEach(word => {
                  if (word) {
                    let span = document.createElement("span");
                    span.textContent = word;
                    elements.push(span);  
                  }
                });
              } else if (node.nodeType === Node.ELEMENT_NODE) {
                elements.push(node);
              }
            });

            return elements;
          },

          resetContainer(container) {
            this.highlightChildCache.clear();

            const fragment = document.createDocumentFragment();
            this.initElements.forEach(el => fragment.appendChild(el));

            container.innerHTML = "";
            container.appendChild(fragment)
          },

          partitionIntoLines(container, rtl_check, equalLines, fullScreen = false, range) {
            this.resetContainer(container)
            let maxHeight = 0;
          
            requestAnimationFrame(() => {
              const elRects = new Map();
              this.initElements.forEach(el => {
                const rect = el.getBoundingClientRect();
                if (rect.width === 0) return;

                if (maxHeight < rect.height) maxHeight = rect.height;
                elRects.set(el, rect);
              })

              let lines = [];
              let currentLine = [];
              let prevMid = null;
          
              this.initElements.forEach((el) => {
                const rect = elRects.get(el);
                if (!rect) return;

                const midpoint = rect.bottom + (rect.top - rect.bottom) / 2;
    
                if (prevMid !== null && Math.abs(midpoint - prevMid) > 10) {
                  lines.push(currentLine);
                  currentLine = [];
                } 
                currentLine.push(el);
                prevMid = midpoint;
              });
  
              if (currentLine.length) lines.push(currentLine);

              const outerFragment = document.createDocumentFragment();

              lines.forEach(line => {
                let div = document.createElement("div");
                if (equalLines) {
                  div.className = "text-highlight content-center relative inline-block text-[rgba(var(--colors-heading),0.3)]";
                  div.style.height = `${maxHeight + 8}px`;
                } else {
                  div.className = "text-highlight content-center relative inline-block text-[rgba(var(--colors-heading),0.3)] mb-0.5";
                }
                line.forEach(el => div.appendChild(el));
                outerFragment.appendChild(div);
              })
            
              container.innerHTML = '';
              container.appendChild(outerFragment);
              container.setAttribute("x-intersect.once.margin.300px", `startAnim($el, ${rtl_check} , ${fullScreen}, ${range})`);
            });
          },

          startAnim(el, rtl_check, fullScreen = false, range) {
            let starts = [];
            let ends = [];

            if (fullScreen) {
              const offsetStart = el.offsetParent.parentElement.getBoundingClientRect().top + window.scrollY;
              const offsets = { 3000: -200, 2000: 200 };
              const offset = offsets[range] ?? 600;
              
              el.childNodes.forEach((element, index) => {
                if (index != 0) {
                  starts.push(ends[index - 1]);
                  ends.push(starts[index] + range);
                } else {
                  starts.push(offsetStart);
                  ends.push(offsetStart + range)
                }
              });
              el.offsetParent.parentElement.style.height = `calc(${ends[ends.length - 1] - starts[0] + range / 2 + offset}px)`
            } else {
              starts = [0.7];
              ends = [0.5];
              
              el.childNodes.forEach((element, index) => {
                if (index != el.childNodes.length - 1) {
                  const elementRect = element.getBoundingClientRect();
                  const elementHeight = Math.abs(elementRect.bottom - elementRect.top) / window.xViewport.innerHeight;
                  let start = ends[index] + elementHeight;
                  starts.push(start);
                  ends.push(Math.max(start - 0.2, 0.2));
                }
              });
            }

            el.childNodes.forEach((element, index) => {
              this.highlightChildCache.set(index, Array.from(element.getElementsByClassName('highlight')));
            });
            
            this.createObserver(el, rtl_check, starts, ends, fullScreen);
          },

          createObserver(el, rtl_check, starts, ends, fullScreen = false) {
            if (this.observer) {
              this.observer.disconnect();
            }
            const option = {
              root: null,
              rootMargin: '300px',
              threshold: 0
            };

            this.observer = new IntersectionObserver((entries) => {
              entries.forEach((entry) => {
                if (entry.isIntersecting) {
                  this.updateHighlight(el, rtl_check, starts, ends, fullScreen);
                } else {
                  if (this.animationFrameId) {
                    cancelAnimationFrame(this.animationFrameId);
                    this.animationFrameId = null;
                  }
                }
              });
            }, option);

            this.observer.observe(el);
          },
          
          updateHighlight(el, rtl_check = false, starts, ends, fullScreen = false) {
            const update = () => {
              const scrollPos = fullScreen ? window.scrollY : null
              const elRects = fullScreen ? null : Array.from(el.childNodes).map(el => el.getBoundingClientRect());

              el.childNodes.forEach((element, index) => {
                let value;
                let position = fullScreen ? scrollPos : Math.max(Math.min((elRects[index].top / window.xViewport.innerHeight), 1), 0);

                if (fullScreen) {
                  if (position < starts[index]) {
                    value = 0;
                  } else if (position > ends[index]) {
                    value = 120;
                  } else {
                    value = 120 * (position - starts[index]) / (ends[index] - starts[index]);
                  }
                } else {
                  if (position > starts[index]) {
                    value = 0;
                  } else if (position < ends[index]) {
                    value = 120;
                  } else {
                    value = 120 * (position - starts[index]) / (ends[index] - starts[index]);
                  }
                }
    
                const highlights = this.highlightChildCache.get(index) ?? [];
                const elementWidth = fullScreen ? element.getBoundingClientRect().width : elRects[index].width;

                highlights.forEach(el => {
                  if (Math.round(value) > this.calRelativePos(el, rtl_check)) {
                    el.classList.add('highlight-anm-start');
                    el.classList.remove('highlight-anm-end');
                  } else {
                    el.classList.remove('highlight-anm-start');
                    el.classList.add('highlight-anm-end');
                  }
                });

                element.style.backgroundSize = `${value}%`;
                element.style.setProperty('--highlight-fill-stop', `${elementWidth * value / 100 - elementWidth * 0.2}px`);
                element.style.setProperty('--highlight-unfill-stop', `${elementWidth * value / 100}px`)
              });
              
              this.animationFrameId = window.requestAnimationFrame(update);
            }

            if (!this.animationFrameId) {
              update();
            }
          }
        }));
      })
    });
  }