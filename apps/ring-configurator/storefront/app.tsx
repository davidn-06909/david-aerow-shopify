import React, { useEffect, useRef, useState } from 'react';
import { METALS, SHAPES, STEPS, type Bootstrap, type DiamondPage, type PilotDiamond, type Quote, type SavedDesign, type Selection, type Step, type ViewerConfiguration } from '../shared/contract';
import { canNavigate, characterCount, emptySelection, firstIncomplete, reconcileSelection, restoreSelection, savedDesignState, selectionUrl, stepComplete, themePreviewUrl } from './state';
import copy from './locales/en.json';
import type { RingViewer } from './viewer';
import { buyerAvailability } from './buyer-availability';

async function api<T>(base: string, path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${base.replace(/\/$/, '')}/${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(data?.error?.message || copy.loadError), { code: data?.error?.code, status: response.status });
  return data as T;
}
async function restoreJourney(url: URL, catalog: Bootstrap, apiBase: string, signal?: AbortSignal) {
  async function hydrate(id: string) {
    if (!id || catalog.diamonds.some(d => d.id === id || d.sourceVariantId === id)) return;
    try {
      const diamond = await api<PilotDiamond>(apiBase, `diamonds/${encodeURIComponent(id)}`, { signal });
      catalog = { ...catalog, diamonds: [...catalog.diamonds.filter(d => d.id !== diamond.id), diamond] };
    } catch (e) { if (signal?.aborted) throw e; if ((e as { status?: number }).status !== 404) throw e; }
  }
  await hydrate(url.searchParams.get('diamond') || '');
  const restored = restoreSelection(url, catalog);
  let selection = restored.selection;
  let step = restored.step;
  let notice = restored.unsupported ? copy.unsupported : '';
  let savedDesign: SavedDesign | null = null;
  const design = url.searchParams.get('design');
  const group = url.searchParams.get('configuration') || url.searchParams.get('config');
  try {
    if (design) {
      const saved = await api<SavedDesign>(apiBase, `designs/${encodeURIComponent(design)}`, { signal });
      await hydrate(saved.selection.diamondId);
      const view = savedDesignState(saved, catalog); savedDesign = saved;
      selection = view.selection; step = view.step; notice = `${copy.savedReadOnly}${view.needsReplacement ? ` ${copy.savedUnavailable}` : ''}`;
    } else if (group) {
      const response = await fetch(`${shopRoot()}cart.js`, { signal, cache: 'no-store' });
      if (!response.ok) throw new Error('cart');
      const cart = await response.json();
      const lines = cart.items.filter((item: { properties?: Record<string, string> }) => item.properties?._configuration_id === group);
      const setting = lines.find((item: { properties: Record<string, string> }) => item.properties._aevow_role === 'setting');
      if (!setting) throw new Error('setting');
      const p = setting.properties;
      if (p._aevow_design_id) {
        const saved = await api<SavedDesign>(apiBase, `designs/${encodeURIComponent(p._aevow_design_id)}`, { signal });
        await hydrate(saved.selection.diamondId);
        const view = savedDesignState(saved, catalog); savedDesign = saved;
        selection = view.selection; notice = `${copy.savedReadOnly}${view.needsReplacement ? ` ${copy.savedUnavailable}` : ''}`;
      } else {
        const entry = new URL(url);
        const values = { metal: p._aevow_metal || p.Metal, shape: p._aevow_shape || p.Shape, size: p._aevow_size || p['Ring size'], engraving: p._aevow_engraving || p.Engraving };
        Object.entries(values).forEach(([key, value]) => value ? entry.searchParams.set(key, value) : entry.searchParams.delete(key));
        const stone = lines.find((item: { properties: Record<string, string> }) => item.properties._aevow_role === 'diamond');
        if (stone) { entry.searchParams.set('diamond', String(stone.variant_id)); await hydrate(String(stone.variant_id)); }
        selection = restoreSelection(entry, catalog).selection;
      }
      step = savedDesign ? 'review' : firstIncomplete(selection, catalog);
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    notice = design ? copy.savedRestoreError : copy.cartRestoreError;
  }
  return { selection, step, notice, savedDesign, catalog };
}
const shopRoot = () => (window as unknown as { Shopify?: { routes?: { root?: string } } }).Shopify?.routes?.root || '/';
function previewContext(url: URL): URL {
  const helper = window.AevowRingCart?.withPreviewContext || window.AevowRingPreviewUrl;
  if (helper) return new URL(helper(url.href), location.href);
  return themePreviewUrl(url, new URL(location.href), (window as unknown as { Shopify?: { theme?: { id?: number | string; role?: string } } }).Shopify?.theme);
}
function money(amount: number, currency: string) { const formatter = new Intl.NumberFormat(document.documentElement.lang || 'en', { style: 'currency', currency }); return formatter.format(amount / 10 ** (formatter.resolvedOptions().maximumFractionDigits || 0)); }
const metalSwatches: Record<string, string> = { '14K yellow gold': '#d9b77c', '14K white gold': '#c9cdd4', '14K rose gold': '#d6a394', Platinum: '#e5e6e9' };
const icon = (name: string) => name === 'arrow' ? <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" /></svg> : <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="m5 11 6-6h10l6 6-11 17L5 11Zm0 0h22M11 5l5 23 5-23M5 11l11-6 11 6" /></svg>;

export function RingConfigurator({ apiBase, assetBase }: { apiBase: string; assetBase?: string }) {
  const [catalog, setCatalog] = useState<Bootstrap | null>(null);
  const [selection, setSelection] = useState<Selection>(emptySelection);
  const [step, setStep] = useState<Step>('metal');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [origin, setOrigin] = useState('');
  const [minCarat, setMinCarat] = useState('');
  const [maxCarat, setMaxCarat] = useState('');
  const [search, setSearch] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [color, setColor] = useState('');
  const [clarity, setClarity] = useState('');
  const [sort, setSort] = useState('featured');
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<DiamondPage | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [viewerStatus, setViewerStatus] = useState('loading');
  const [viewerAttempt, setViewerAttempt] = useState(0);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [added, setAdded] = useState(false);
  const [copyLink, setCopyLink] = useState('');
  const [cartLink, setCartLink] = useState(false);
  const [savedDesign, setSavedDesign] = useState<SavedDesign | null>(null);
  const viewerElement = useRef<HTMLDivElement>(null);
  const viewer = useRef<RingViewer | null>(null);
  const panelHeading = useRef<HTMLHeadingElement>(null);
  const nav = useRef<HTMLOListElement>(null);
  const selectionRef = useRef(selection);
  const cartGroup = useRef(new URL(location.href).searchParams.get('configuration') || new URL(location.href).searchParams.get('config') || crypto.randomUUID());
  const editing = useRef(new URL(location.href).searchParams.has('config') || new URL(location.href).searchParams.has('configuration'));
  const quoteCache = useRef<Quote | null>(null);
  const quoteRequest = useRef(crypto.randomUUID());
  const uncertainQuote = useRef(false);
  const navigation = useRef(0);
  const initialized = useRef(false);
  const busyRef = useRef(false);
  const adminCatalog = useRef<Bootstrap | null>(null);
  selectionRef.current = selection;

  useEffect(() => {
    const abort = new AbortController();
    initialized.current = false;
    setLoading(true); setError('');
    (async () => {
      const source = await api<Bootstrap>(apiBase, 'bootstrap?paged=1', { signal: abort.signal });
      adminCatalog.current = source;
      const buyer = await buyerAvailability(source, { root: shopRoot(), signal: abort.signal });
      const b = buyer.catalog;
      if (abort.signal.aborted) return;
      const url = previewContext(new URL(location.href));
      if (url.href !== location.href) history.replaceState(history.state, '', url);
      const group = url.searchParams.get('configuration') || url.searchParams.get('config');
      cartGroup.current = group || crypto.randomUUID(); editing.current = Boolean(group);
      quoteCache.current = null; quoteRequest.current = crypto.randomUUID(); uncertainQuote.current = false;
      const restored = await restoreJourney(url, b, apiBase, abort.signal);
      if (abort.signal.aborted) return;
      adminCatalog.current = { ...source, diamonds: restored.catalog.diamonds };
      setNotice([restored.notice, buyer.failed ? copy.buyerAvailabilityError : buyer.narrowed ? copy.buyerUnavailable : ''].filter(Boolean).join(' ')); setSavedDesign(restored.savedDesign); setSelection(restored.selection); setStep(restored.step); setCatalog(restored.catalog); setLoading(false); initialized.current = true;
    })().catch(e => { if (!abort.signal.aborted) { setError(e.message); setLoading(false); } });
    return () => abort.abort();
  }, [apiBase, loadAttempt]);

  const currentDiamond = catalog?.diamonds.find(d => d.id === selection.diamondId);
  const diamond = currentDiamond || (savedDesign?.selection.diamondId === selection.diamondId ? savedDesign.diamond : undefined);
  const variant = catalog?.setting.variants.find(v => v.metal === selection.metal && v.size === selection.size);
  const lowestSettingPrice = catalog && selection.metal ? Math.min(...catalog.setting.variants.filter(v => v.metal === selection.metal && v.available).map(v => v.price.amount)) : 0;
  const engravingPrice = selection.engravingEnabled && selection.engraving.trim() ? catalog?.engraving.price.amount || 0 : 0;
  const total = (variant?.price.amount ?? (Number.isFinite(lowestSettingPrice) ? lowestSettingPrice : 0)) + (currentDiamond?.price.amount || 0) + engravingPrice;
  const totalVisible = Boolean(selection.metal && currentDiamond);
  const complete = catalog ? stepComplete('review', selection, catalog) : false;
  const stepIndex = STEPS.indexOf(step);
  const filtered = results?.diamonds || [];
  useEffect(() => { setPage(1); }, [selection.shape, origin, minCarat, maxCarat, search, minPrice, maxPrice, color, clarity, sort]);
  useEffect(() => {
    if (loading || !catalog || step !== 'diamond') return;
    const abort = new AbortController();
    setSearchBusy(true); setSearchError('');
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ shape: selection.shape, origin, minCarat, maxCarat, q: search, minPrice, maxPrice, color, clarity, sort, page: String(page) });
      if (catalog.catalogVersion) params.set('version', catalog.catalogVersion);
      void api<DiamondPage>(apiBase, `diamonds?${params}`, { signal: abort.signal }).then(async response => {
        const source = { ...catalog, diamonds: response.diamonds };
        const checked = await buyerAvailability(source, { root: shopRoot(), signal: abort.signal });
        if (abort.signal.aborted) return;
        setResults({ ...response, diamonds: checked.catalog.diamonds });
        adminCatalog.current = { ...source, diamonds: [...(adminCatalog.current?.diamonds || []).filter(d => !response.diamonds.some(next => next.id === d.id)), ...response.diamonds] };
        setCatalog(previous => previous ? { ...previous, diamonds: [...previous.diamonds.filter(d => !response.diamonds.some(next => next.id === d.id)), ...checked.catalog.diamonds] } : previous);
      }).catch(e => { if (!abort.signal.aborted) { setResults(null); setSearchError(e.message); } }).finally(() => { if (!abort.signal.aborted) setSearchBusy(false); });
    }, 250);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [apiBase, Boolean(catalog), loading, catalog?.catalogVersion, step, selection.shape, origin, minCarat, maxCarat, search, minPrice, maxPrice, color, clarity, sort, page, searchAttempt]);

  function viewerConfig(): ViewerConfiguration { const s = selectionRef.current; const d = catalog?.diamonds.find(d => d.id === s.diamondId) || savedDesign?.diamond; return { shape: s.shape || 'Round', metal: s.metal || 'Platinum', size: s.size || '6', engraving: s.engravingEnabled ? s.engraving : '', diamondCarat: d?.carat || 2, assetBaseUrl: assetBase || catalog?.assetBaseUrl || '/models', assetVersion: savedDesign?.assetVersion || catalog?.assetVersion }; }
  useEffect(() => {
    if (loading || !catalog || !viewerElement.current) return;
    let disposed = false;
    setViewerStatus('loading');
    import('./viewer').then(({ mount }) => {
      if (disposed || !viewerElement.current) return;
      viewer.current = mount(viewerElement.current, viewerConfig(), { onStatus: state => { if (!disposed) setViewerStatus(state); } });
    }).catch(() => { if (!disposed) setViewerStatus('error'); });
    return () => { disposed = true; viewer.current?.destroy(); viewer.current = null; };
  }, [Boolean(catalog), loading, assetBase, viewerAttempt]);
  useEffect(() => { viewer.current?.updateConfiguration(viewerConfig()).catch(() => setViewerStatus('error')); }, [selection, catalog, savedDesign]);
  useEffect(() => {
    if (!catalog) return;
    let abort: AbortController | undefined;
    const onPopState = () => {
      abort?.abort(); abort = new AbortController();
      const current = ++navigation.current;
      const url = previewContext(new URL(location.href));
      if (url.href !== location.href) history.replaceState(history.state, '', url);
      const group = url.searchParams.get('configuration') || url.searchParams.get('config');
      cartGroup.current = group || crypto.randomUUID(); editing.current = Boolean(group);
      quoteCache.current = null; quoteRequest.current = crypto.randomUUID(); uncertainQuote.current = false;
      setAdded(false); setError(''); setStatus(''); setCopyLink(''); setCartLink(false);
      busyRef.current = true; setBusy(true);
      void restoreJourney(url, catalog, apiBase, abort.signal).then(restored => {
        if (current !== navigation.current || abort?.signal.aborted) return;
        selectionRef.current = restored.selection;
        setCatalog(restored.catalog);
        setSelection(restored.selection); setStep(restored.step); setNotice(restored.notice); setSavedDesign(restored.savedDesign);
      }).catch(() => {}).finally(() => {
        if (current === navigation.current) { busyRef.current = false; setBusy(false); }
      });
    };
    window.addEventListener('popstate', onPopState);
    return () => { abort?.abort(); window.removeEventListener('popstate', onPopState); };
  }, [catalog, apiBase]);
  useEffect(() => {
    nav.current?.querySelector('[aria-current="step"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }, [step]);

  function writeState(next: Selection, nextStep = step, push = false) {
    if (JSON.stringify(next) !== JSON.stringify(selectionRef.current)) { quoteCache.current = null; quoteRequest.current = crypto.randomUUID(); uncertainQuote.current = false; }
    selectionRef.current = next;
    if (savedDesign) { setSavedDesign(null); setNotice(copy.editingCopy); }
    setSelection(next); setStep(nextStep); setError(''); setStatus(''); setAdded(false); setCartLink(false); setCopyLink('');
    if (initialized.current) history[push ? 'pushState' : 'replaceState']({}, '', previewContext(selectionUrl(new URL(location.href), next, nextStep)));
  }
  function choose(next: Partial<Selection>, advance?: Step) {
    if (!catalog || busyRef.current || sharing) return;
    if (uncertainQuote.current) { setError(copy.reconcileFirst); setCartLink(true); return; }
    const updated = reconcileSelection({ ...selection, ...next }, catalog);
    writeState(updated, advance || step, Boolean(advance));
    if (advance) requestAnimationFrame(() => panelHeading.current?.focus({ preventScroll: true }));
  }
  function go(next: Step) {
    if (!catalog || busyRef.current || sharing) return;
    if (next === step) return;
    if (!canNavigate(next, selection, catalog)) { setError(copy.completeFirst); return; }
    writeState(selection, next, true);
    requestAnimationFrame(() => panelHeading.current?.focus({ preventScroll: true }));
  }
  async function previewDataUrl(): Promise<string | undefined> {
    try {
      if (viewerStatus !== 'ready') return undefined;
      const blob = await viewer.current?.capturePreview();
      if (!blob) return undefined;
      const bitmap = await createImageBitmap(blob);
      try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext('2d');
        if (!context) return undefined;
        context.fillStyle = '#111b2a'; context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        for (const quality of [0.86, 0.7, 0.5]) {
          const jpeg = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
          if (jpeg && jpeg.size <= 500_000) return await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(jpeg); });
        }
        return undefined;
      } finally { bitmap.close(); }
    } catch { return undefined; }
  }
  async function getQuote(purchase = false): Promise<Quote> {
    if (purchase && quoteCache.current && !uncertainQuote.current) { quoteCache.current = null; quoteRequest.current = crypto.randomUUID(); }
    if (catalog?.mode === 'connected') {
      const current = selectionRef.current;
      const selectedStone = catalog.diamonds.find(stone => stone.id === current.diamondId);
      const checked = await buyerAvailability(catalog, { root: shopRoot(), handles: [catalog.setting.handle, ...(selectedStone ? [selectedStone.handle] : [])], adminCatalog: adminCatalog.current || catalog });
      const setting = checked.catalog.setting.variants.find(variant => variant.metal === current.metal && variant.size === current.size);
      const stone = checked.catalog.diamonds.find(candidate => candidate.id === current.diamondId);
      if (!setting?.available || !stone?.available) {
        setCatalog(checked.catalog);
        if (!uncertainQuote.current) { quoteCache.current = null; quoteRequest.current = crypto.randomUUID(); }
        throw Object.assign(new Error(checked.failed ? copy.buyerAvailabilityError : copy.buyerUnavailable), { code: 'BUYER_CONTEXT_UNAVAILABLE' });
      }
    }
    // Every purchase attempt rechecks the active catalog on the server. Preserve
    // the request ID for uncertain retries, so reconciliation cannot duplicate a ring.
    if (quoteCache.current && new Date(quoteCache.current.expiresAt).getTime() <= Date.now()) { if (uncertainQuote.current) return quoteCache.current; quoteCache.current = null; quoteRequest.current = crypto.randomUUID(); }
    const request = quoteRequest.current;
    const quote = await api<Quote>(apiBase, 'quotes', { method: 'POST', body: JSON.stringify({ selection: { ...selectionRef.current, engraving: selectionRef.current.engravingEnabled ? selectionRef.current.engraving.trim() : '' }, cartGroupId: cartGroup.current, requestId: quoteRequest.current, previewDataUrl: await previewDataUrl() }) });
    if (request === quoteRequest.current) quoteCache.current = quote;
    return quote;
  }
  async function addToCart() {
    if (!catalog || !complete || busyRef.current || !catalog.canPurchase) return;
    if (!window.AevowRingCart) { setError(copy.adapterMissing); return; }
    busyRef.current = true; setBusy(true); setError(''); setStatus('');
    const context = navigation.current;
    try {
      const quote = await getQuote(true);
      if (context !== navigation.current) return;
      if (new Date(quote.expiresAt).getTime() <= Date.now()) { setCartLink(uncertainQuote.current); throw new Error(uncertainQuote.current ? copy.uncertainCart : copy.quoteError); }
      const result = editing.current ? await window.AevowRingCart.editConfiguration(cartGroup.current, quote) : await window.AevowRingCart.addConfiguration(quote);
      if (context !== navigation.current) return;
      if (result && typeof result === 'object' && 'rendered' in result && result.rendered === false) setCartLink(true);
      cartGroup.current = quote.configurationId; editing.current = true; setAdded(true); setStatus(copy.added);
      setSavedDesign(null); setNotice('');
      uncertainQuote.current = false;
      const url = previewContext(selectionUrl(new URL(location.href), selectionRef.current, step)); url.searchParams.delete('config'); url.searchParams.set('configuration', quote.configurationId); history.replaceState({}, '', url);
    } catch (e) {
      if (context !== navigation.current) return;
      if ((e as { code?: string }).code === 'reconciliation_required') { uncertainQuote.current = true; setCartLink(true); }
      if ((e as { code?: string }).code === 'BUYER_CONTEXT_UNAVAILABLE' && uncertainQuote.current) setCartLink(true);
      if ((e as { code?: string }).code === 'QUOTE_EXPIRED' && !uncertainQuote.current) { quoteCache.current = null; quoteRequest.current = crypto.randomUUID(); }
      setError(e instanceof Error ? e.message : copy.quoteError);
    }
    finally { if (context === navigation.current) { busyRef.current = false; setBusy(false); } }
  }
  async function shareDesign() {
    if (sharing || !catalog) return;
    setSharing(true); setError(''); setCopyLink('');
    try {
      let url = selectionUrl(new URL(location.href), selectionRef.current, step);
      url.searchParams.delete('config'); url.searchParams.delete('configuration');
      if (savedDesign) {
        url.searchParams.set('design', savedDesign.id); url.searchParams.set('step', 'review');
      } else if (catalog.canPurchase && complete) {
        const quote = await getQuote();
        const design = await api<SavedDesign>(apiBase, 'designs', { method: 'POST', body: JSON.stringify({ quoteId: quote.id, reference: quote.reference }) });
        url = new URL(quote.shareUrl || location.href); url.searchParams.delete('config'); url.searchParams.delete('configuration'); url.searchParams.set('design', design.id);
      }
      url = previewContext(url);
      try { await navigator.clipboard.writeText(url.href); setStatus(copy.copied); } catch { setCopyLink(url.href); }
    } catch (e) { setError(e instanceof Error ? e.message : copy.quoteError); }
    finally { setSharing(false); }
  }

  if (loading) return <div className="arb arb-loading" aria-live="polite"><span className="arb-loader" />{copy.loading}</div>;
  if (!catalog) return <div className="arb arb-error" role="alert"><p>{error || copy.loadError}</p><button onClick={() => setLoadAttempt(a => a + 1)}>{copy.retry}</button></div>;
  const price = (value: number) => money(value, catalog.currency);
  const summary = [selection.style, selection.shank, selection.metal || '—', selection.shape || '—', diamond?.title || savedDesign?.diamondTitle || '—', selection.size || '—', selection.engravingEnabled ? selection.engraving || '—' : copy.none];
  const actionDisabled = busy || added || (step === 'review' ? !catalog.canPurchase || !complete : !stepComplete(step, selection, catalog));
  const actionText = busy ? copy.adding : added ? copy.added : step === 'review' ? editing.current ? copy.update : copy.add : copy.continue;

  return <div className="arb" data-pilot-mode={catalog.mode}>
    <header className="arb-heading"><div><p className="arb-eyebrow">{copy.eyebrow}</p><h1>{copy.title}</h1><p className="arb-intro">{copy.intro}</p></div><span className="arb-pilot-badge"><span />{copy.pilot}</span></header>
    {!catalog.canPurchase && <aside className="arb-notice" role="status">{catalog.previewMode === 'merchant-draft' ? copy.draftPreview : catalog.mode === 'read-only' ? copy.readOnly : copy.purchaseDisabled}{catalog.notices.map((n, i) => <span key={i}>{n}</span>)}</aside>}
    {notice && <aside className="arb-notice">{notice}<button aria-label={copy.dismissNotice} onClick={() => setNotice('')}>×</button></aside>}
    <div className="arb-layout">
      <section className="arb-studio" aria-label={copy.previewAlt}>
        <div className="arb-canvas-wrap">
          <div className="arb-viewport" ref={viewerElement} />
          {viewerStatus === 'loading' && <div className="arb-viewer-overlay" aria-live="polite"><span className="arb-loader" />{copy.viewerLoading}</div>}
          {viewerStatus === 'error' && <div className="arb-viewer-fallback">{(savedDesign?.previewUrl || catalog.setting.imageUrl) && <img src={savedDesign?.previewUrl || catalog.setting.imageUrl} alt={copy.previewAlt} />}<p>{copy.viewerError}</p><button onClick={() => setViewerAttempt(v => v + 1)}>{copy.retry}</button></div>}
          <span className="arb-canvas-index">{copy.canvasTitle}</span><span className="arb-canvas-mark">{icon('diamond')}</span>
          <p className="arb-viewer-hint">{copy.rotate}</p>
        </div>
        <div className="arb-view-controls" role="group" aria-label={copy.ringViews}>{(['front', 'side', 'top', 'engraving', 'reset'] as const).map(view => <button key={view} type="button" onClick={() => viewer.current?.setView(view)} disabled={viewerStatus !== 'ready'}>{view === 'engraving' ? copy.engravingView : copy[view]}</button>)}</div>
        <p className="arb-fitting-note">{copy.representative}</p>
        <dl className="arb-live-summary">{summary.slice(0, 4).map((value, i) => <div key={i}><dt>{copy.stepNames[i]}</dt><dd>{value}</dd></div>)}</dl>
        <div className="arb-studio-total"><span>{catalog.canPurchase ? copy.total : copy.estimate}</span><strong>{totalVisible ? price(total) : '—'}</strong></div>
      </section>
      <section className="arb-work" aria-label={copy.configureRing} aria-busy={busy || sharing}>
        <ol className="arb-steps" ref={nav}>{STEPS.map((item, i) => <li key={item}><button type="button" disabled={(!canNavigate(item, selection, catalog) && item !== step) || busy} aria-current={step === item ? 'step' : undefined} onClick={() => go(item)} className={i < stepIndex && stepComplete(item, selection, catalog) ? 'is-complete' : ''}><span>{String(i + 1).padStart(2, '0')}</span><strong>{copy.stepNames[i]}</strong></button></li>)}</ol>
        <div className="arb-panel" key={step}>
          <p className="arb-step-number">{String(stepIndex + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')}</p>
          <h2 ref={panelHeading} tabIndex={-1}>{copy.stepTitles[stepIndex]}</h2><p className="arb-panel-copy">{copy.stepCopy[stepIndex]}</p>
          {(step === 'style' || step === 'shank') && <div className="arb-fixed-choice">{icon('diamond')}<div><h3>{step === 'style' ? copy.settingTitle : copy.bandTitle}</h3><p>{step === 'style' ? copy.settingDescription : copy.fixedChoice}</p></div><span>✓</span></div>}
          {step === 'metal' && <div className="arb-metal-grid">{(catalog.rules?.metals || METALS).map(metal => {
            const variants = catalog.setting.variants.filter(v => v.metal === metal && v.available);
            const available = variants.some(v => v.available);
            return <button className={`arb-metal ${selection.metal === metal ? 'is-selected' : ''}`} type="button" key={metal} disabled={!available || busy} aria-pressed={selection.metal === metal} onClick={() => choose({ metal }, 'shape')}><span className="arb-metal-swatch" style={{ '--metal': metalSwatches[metal] } as React.CSSProperties}><span /></span><span className="arb-option-name">{metal}</span><span className="arb-option-detail">{available && variants.length ? `${copy.from} ${price(Math.min(...variants.map(v => v.price.amount)))}` : copy.soldOut}</span><span className="arb-option-check" aria-hidden="true">{selection.metal === metal ? '✓' : '+'}</span></button>;
          })}</div>}
          {step === 'shape' && <div className="arb-shape-grid">{(catalog.rules?.shapes || SHAPES).map(shape => <button type="button" className={`arb-shape ${selection.shape === shape ? 'is-selected' : ''}`} key={shape} aria-pressed={selection.shape === shape} disabled={busy} onClick={() => choose({ shape }, 'diamond')}><span className={`arb-gem-shape arb-gem-shape--${shape.toLowerCase()}`} /><strong>{shape}</strong><span className="arb-option-check" aria-hidden="true">{selection.shape === shape ? '✓' : '+'}</span></button>)}</div>}
          {step === 'diamond' && <>
            {diamond && <aside className="arb-selected-stone"><p>{copy.selectedStone}</p><strong>{diamond.title}</strong><span>{price(diamond.price.amount)}</span></aside>}
            <div className="arb-filters arb-catalog-filters"><label>{copy.searchStone}<input type="search" maxLength={100} value={search} onChange={e => setSearch(e.target.value)} /></label><label>{copy.origin}<select value={origin} onChange={e => setOrigin(e.target.value)}><option value="">{copy.allOrigins}</option><option value="Lab grown">{copy.lab}</option><option value="Natural">{copy.natural}</option></select></label><label>{copy.minCarat}<input type="number" min="0" step="0.05" value={minCarat} onChange={e => setMinCarat(e.target.value)} /></label><label>{copy.maxCarat}<input type="number" min="0" step="0.05" value={maxCarat} onChange={e => setMaxCarat(e.target.value)} /></label><label>{copy.minPrice}<input type="number" min="0" value={minPrice} onChange={e => setMinPrice(e.target.value)} /></label><label>{copy.maxPrice}<input type="number" min="0" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} /></label><label>{copy.color}<input maxLength={20} value={color} onChange={e => setColor(e.target.value)} /></label><label>{copy.clarity}<input maxLength={20} value={clarity} onChange={e => setClarity(e.target.value)} /></label><label>{copy.sort}<select value={sort} onChange={e => setSort(e.target.value)}>{(['featured', 'price-asc', 'price-desc', 'carat-asc', 'carat-desc'] as const).map((value, i) => <option key={value} value={value}>{copy.sortOptions[i]}</option>)}</select></label></div>
            <p className="arb-results-count" aria-live="polite">{searchBusy ? copy.searching : `${results?.total || 0} ${copy.diamondCount} / ${selection.shape}`}</p>
            {searchError && <div role="alert" className="arb-empty"><p>{searchError}</p><button onClick={() => setSearchAttempt(n => n + 1)}>{copy.retry}</button><button onClick={() => setLoadAttempt(n => n + 1)}>{copy.reloadCollection}</button></div>}
            <div className="arb-diamonds" aria-busy={searchBusy}>{filtered.map(d => <DiamondCard key={d.id} diamond={d} selected={d.id === selection.diamondId} disabled={busy || searchBusy} price={price(d.price.amount)} onSelect={() => choose({ diamondId: d.id })} />)}</div>
            {!searchBusy && !searchError && !filtered.length && <div className="arb-empty"><p>{copy.noDiamonds}</p><button onClick={() => { setOrigin(''); setMinCarat(''); setMaxCarat(''); setSearch(''); setMinPrice(''); setMaxPrice(''); setColor(''); setClarity(''); setPage(1); }}>{copy.clearFilters}</button></div>}
            {results && results.totalPages > 1 && <nav className="arb-pagination" aria-label={copy.resultsPages}><button type="button" disabled={searchBusy || page <= 1} onClick={() => setPage(p => p - 1)}>{copy.previousPage}</button><span>{page} / {results.totalPages}</span><button type="button" disabled={searchBusy || page >= results.totalPages} onClick={() => setPage(p => p + 1)}>{copy.nextPage}</button></nav>}
            <p className="arb-fine-print">{copy.unreserved}</p>
          </>}
          {step === 'size' && <fieldset className="arb-size-grid"><legend className="arb-sr-only">{copy.ringSize}</legend>{catalog.setting.variants.filter(v => v.metal === selection.metal).map(v => <button type="button" key={v.id} disabled={!v.available || busy} aria-pressed={selection.size === v.size} className={selection.size === v.size ? 'is-selected' : ''} onClick={() => choose({ size: v.size }, 'engraving')}>{v.size}</button>)}</fieldset>}
          {step === 'engraving' && <div className="arb-engraving"><label className="arb-radio"><input type="radio" name="arb-engraving" checked={!selection.engravingEnabled} disabled={busy} onChange={() => choose({ engravingEnabled: false, engraving: '' })} /><span>{copy.noEngraving}</span></label><label className="arb-radio"><input type="radio" name="arb-engraving" checked={selection.engravingEnabled} disabled={!catalog.engraving.available || busy} onChange={() => choose({ engravingEnabled: true })} /><span>{copy.addEngraving}</span><span>{catalog.engraving.variantId ? price(catalog.engraving.price.amount) : copy.soldOut}</span></label>{selection.engravingEnabled && <div className="arb-engraving-field"><label htmlFor="arb-inscription">{copy.inscription}</label><input id="arb-inscription" autoComplete="off" value={selection.engraving} disabled={busy} onChange={e => { if (characterCount(e.target.value) <= catalog.engraving.maxLength) choose({ engraving: e.target.value }); }} aria-describedby="arb-count arb-engraving-note" /><p id="arb-count" aria-live="polite">{catalog.engraving.maxLength - characterCount(selection.engraving)} {copy.charactersLeft}</p><p className="arb-inscription-preview" aria-hidden="true">{selection.engraving || '…'}</p><p className="arb-fine-print" id="arb-engraving-note">{copy.engravingNote}</p></div>}</div>}
          {step === 'review' && <>
            {savedDesign?.previewUrl && <figure style={{ margin: '0 0 20px' }}><img src={savedDesign.previewUrl} alt={copy.savedPreview} style={{ width: '100%', maxHeight: 240, objectFit: 'contain' }} /><figcaption className="arb-fine-print">{copy.savedPreview}</figcaption></figure>}
            <dl className="arb-review-list">{summary.map((value, i) => <div key={i}><dt>{copy.stepNames[i]}</dt><dd>{value}</dd><button onClick={() => go(STEPS[i])} type="button" disabled={busy || !canNavigate(STEPS[i], selection, catalog)} aria-label={`${copy.edit} ${copy.stepNames[i]}`}>{copy.edit}</button></div>)}</dl>
            {savedDesign && !complete && <p className="arb-form-error" role="status">{copy.savedUnavailable}</p>}
            {savedDesign?.priceContext && <p className="arb-fine-print">{copy.originalQuotedTotal}: {money(savedDesign.priceContext.total.amount, savedDesign.priceContext.total.currency)}<br />{copy.currentPrices}</p>}
            {diamond?.certificateUrl && <a className="arb-certificate" href={diamond.certificateUrl} target="_blank" rel="noopener noreferrer">{diamond.certificateLab} / {diamond.certificateNumber} <span>{copy.report} ↗</span></a>}
            <dl className="arb-price-breakdown"><div><dt>{copy.setting}</dt><dd>{variant ? price(variant.price.amount) : '—'}</dd></div><div><dt>{copy.stone}</dt><dd>{currentDiamond ? price(currentDiamond.price.amount) : '—'}</dd></div>{engravingPrice > 0 && <div><dt>{copy.engraving}</dt><dd>{price(engravingPrice)}</dd></div>}<div className="arb-total-row"><dt>{catalog.canPurchase ? copy.total : copy.estimate}</dt><dd>{totalVisible ? price(total) : '—'}</dd></div></dl>
            <p className="arb-production">{copy.production}</p><p className="arb-fine-print">{copy.shipping}</p>
            <button type="button" className="arb-primary arb-review-add" disabled={actionDisabled} onClick={addToCart}>{actionText}{icon('arrow')}</button>
            <div className="arb-share-actions"><button type="button" onClick={shareDesign} disabled={sharing || busy}>{sharing ? copy.sharing : copy.share} ↗</button><button type="button" onClick={() => window.print()}>{copy.print}</button></div>
            {copyLink && <label className="arb-copy-link">{copy.copyFailed}<input readOnly value={copyLink} onFocus={e => e.target.select()} /></label>}
          </>}
          {error && <p className="arb-form-error" role="alert">{error}</p>}{status && <p className="arb-form-status" role="status">{status}</p>}{cartLink && <a href={`${shopRoot()}cart`} className="arb-certificate">{copy.viewCart} →</a>}
        </div>
        <div className="arb-actions"><button type="button" className="arb-back" disabled={stepIndex === 0 || busy} onClick={() => go(STEPS[Math.max(0, stepIndex - 1)])}>← {copy.back}</button><div className="arb-mobile-progress"><span>{String(stepIndex + 1).padStart(2, '0')} {copy.stepOf} 08</span><strong>{totalVisible ? price(total) : '—'}</strong></div><button type="button" className="arb-primary" disabled={actionDisabled} onClick={() => step === 'review' ? addToCart() : go(STEPS[stepIndex + 1])}>{actionText}{icon('arrow')}</button></div>
      </section>
    </div>
    <footer className="arb-assurances">{[[copy.assuranceOne, copy.assuranceOneCopy], [copy.assuranceTwo, copy.assuranceTwoCopy], [copy.assuranceThree, copy.assuranceThreeCopy]].map(([title, text], i) => <div key={title}><span>{String(i + 1).padStart(2, '0')}</span><h3>{title}</h3><p>{text}</p></div>)}</footer>
  </div>;
}

function DiamondCard({ diamond: d, selected, disabled, price, onSelect }: { diamond: PilotDiamond; selected: boolean; disabled: boolean; price: string; onSelect: () => void }) {
  return <article className={`arb-diamond ${selected ? 'is-selected' : ''}`}><button type="button" aria-pressed={selected} disabled={!d.available || disabled} onClick={onSelect}><span className="arb-diamond-image">{d.imageUrl ? <img src={d.imageUrl} alt="" loading="lazy" /> : <span className={`arb-gem-shape arb-gem-shape--${d.shape.toLowerCase()}`} />}</span><span className="arb-diamond-facts"><strong>{d.carat.toFixed(2)} <small>{copy.carat}</small> / {d.shape}</strong><span>{d.origin}</span><span>{[d.color, d.clarity, d.cut].filter(Boolean).join(' · ')}</span><span className="arb-diamond-lab">{d.certificateLab} {d.certificateNumber}</span></span><span className="arb-diamond-price">{d.available ? price : copy.soldOut}<span aria-hidden="true">{selected ? '✓' : '+'}</span></span></button></article>;
}
