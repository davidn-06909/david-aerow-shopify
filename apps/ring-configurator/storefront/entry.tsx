import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RingConfigurator } from './app';
import './style.css';

const roots = new Map<HTMLElement, Root>();
function mountAll(scope: ParentNode = document) {
  scope.querySelectorAll<HTMLElement>('[data-aevow-ring-builder]').forEach(element => {
    if (roots.has(element)) return;
    const root = createRoot(element);
    roots.set(element, root);
    root.render(<RingConfigurator apiBase={element.dataset.apiBase || '/apps/ring-builder'} assetBase={element.dataset.assetBase} />);
  });
}
function unmountRemoved() { roots.forEach((root, element) => { if (!element.isConnected) { root.unmount(); roots.delete(element); } }); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mountAll(), { once: true }); else mountAll();
document.addEventListener('shopify:section:load', () => mountAll());
document.addEventListener('shopify:section:unload', event => {
  const target = event.target as HTMLElement;
  roots.forEach((root, element) => { if (target.contains(element)) { root.unmount(); roots.delete(element); } });
});
new MutationObserver(unmountRemoved).observe(document.documentElement, { childList: true, subtree: true });
