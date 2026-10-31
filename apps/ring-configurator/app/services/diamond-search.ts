import type { Bootstrap, DiamondPage, PilotDiamond } from "../../shared/contract";
import { PilotError } from "./errors.server";
import { diamondFits, settingsOf } from '../../shared/compatibility';
export function searchDiamonds(catalog: Bootstrap, params: URLSearchParams): DiamondPage {
  const settingId = params.get('setting');
  const setting = settingId ? settingsOf(catalog).find(s => s.id === settingId) : undefined;
  if (settingId && !setting) throw new PilotError('SETTING_INVALID', 'This setting is no longer offered.', 422);
  if (setting) catalog = { ...catalog, diamonds: catalog.diamonds.filter(d => diamondFits(setting, d)) };
  const range = (name: string, fallback: number) => { const raw = params.get(name); const v = raw ? Number(raw) : fallback; if (Number.isNaN(v) || v < 0 || (raw && !Number.isFinite(v))) throw new PilotError("INVALID_FILTER", "Enter valid numeric filter ranges.", 400); return v; };
  const minCarat = range("minCarat", 0), maxCarat = range("maxCarat", Infinity), minPrice = range("minPrice", 0), maxPrice = range("maxPrice", Infinity);
  if (minCarat > maxCarat || minPrice > maxPrice) throw new PilotError("INVALID_FILTER", "Minimum values cannot exceed maximum values.", 400);
  if (params.get("version") && params.get("version") !== catalog.catalogVersion) throw new PilotError("CATALOG_CHANGED", "The collection was updated. Reload the studio to use the current options.", 409);
  const q = (params.get("q") || "").trim().toLowerCase().slice(0, 100);
  const digits = new Intl.NumberFormat("en", { style: "currency", currency: catalog.currency }).resolvedOptions().maximumFractionDigits || 0;
  const filtered = catalog.diamonds.filter(d => (!params.get("shape") || d.shape === params.get("shape")) && (!params.get("origin") || d.origin === params.get("origin")) && (!params.get("color") || d.color.toLowerCase() === params.get("color")!.toLowerCase()) && (!params.get("clarity") || d.clarity.toLowerCase() === params.get("clarity")!.toLowerCase()) && d.carat >= minCarat && d.carat <= maxCarat && d.price.amount >= minPrice * 10 ** digits && d.price.amount <= maxPrice * 10 ** digits && (!q || `${d.title} ${d.certificateNumber}`.toLowerCase().includes(q)));
  const sort = params.get("sort") || "featured";
  if (!["featured", "price-asc", "price-desc", "carat-asc", "carat-desc"].includes(sort)) throw new PilotError("INVALID_FILTER", "Choose a valid sort order.", 400);
  const compare = (a: PilotDiamond, b: PilotDiamond) => sort.startsWith("price") ? a.price.amount - b.price.amount : a.carat - b.carat;
  if (sort !== "featured") filtered.sort((a, b) => compare(a, b) * (sort.endsWith("desc") ? -1 : 1) || a.id.localeCompare(b.id));
  const pageSize = range("pageSize", 12), page = range("page", 1);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 24 || !Number.isInteger(page) || page < 1 || page > 1000) throw new PilotError("INVALID_FILTER", "Choose a valid results page.", 400);
  return { diamonds: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, page, pageSize, totalPages: Math.ceil(filtered.length / pageSize), catalogVersion: catalog.catalogVersion || "legacy-pilot", observedAt: catalog.catalogObservedAt || new Date().toISOString() };
}
