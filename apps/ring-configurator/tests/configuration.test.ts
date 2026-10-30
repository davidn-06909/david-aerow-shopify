import { beforeEach, describe, expect, test } from "vitest";
import type { Bootstrap, QuoteRequest } from "../shared/contract";
import { previewCatalog } from "../app/services/preview.server";
import { validateSelection } from "../app/services/validation";
import { filterDiamonds, minorUnits } from "../app/services/catalog.server";
let catalog: Bootstrap;
const complete: QuoteRequest = { selection: { style: "Hidden halo", shank: "High polish", metal: "Platinum", shape: "Round", diamondId: "55882563911753", size: "4.5", engraving: "3ertyui", engravingEnabled: true } };
beforeEach(async () => { catalog = await previewCatalog(); catalog.mode = "connected"; catalog.canPurchase = true; });
describe("server configuration validation", () => {
  test("the captured review example totals $5595 with exact manufacturing selections", () => {
    const value = validateSelection(complete, catalog);
    expect(value.prices.total).toEqual({ amount: 559500, currency: "USD" });
    expect(value.setting.metal).toBe("Platinum"); expect(value.setting.size).toBe("4.5"); expect(value.selection.engraving).toBe("3ertyui");
  });
  test("the preview never authorizes purchases", () => { catalog.mode = "read-only"; catalog.canPurchase = false; expect(() => validateSelection(complete, catalog)).toThrow(/Connect the Shopify app/); });
  test("client prices and unknown data are rejected", () => { expect(() => validateSelection({ ...complete, price: 1 }, catalog)).toThrow(); });
  test("unavailable individual diamonds cannot be quoted", () => { catalog.diamonds.find(d => d.id === complete.selection.diamondId)!.available = false; expect(() => validateSelection(complete, catalog)).toThrow(/no longer available/); });
  test("shape mismatch cannot be quoted", () => { expect(() => validateSelection({ selection: { ...complete.selection, shape: "Oval" } }, catalog)).toThrow(/matching/); });
  test("size must resolve to a Shopify setting variant", () => { expect(() => validateSelection({ selection: { ...complete.selection, size: "99" } }, catalog)).toThrow(/combination is unavailable/); });
  test("legacy source IDs map to target-store IDs", () => { const diamond = catalog.diamonds.find(d => d.id === complete.selection.diamondId)!; diamond.id = "123"; expect(validateSelection(complete, catalog).selection.diamondId).toBe("123"); });
  test("disabled engraving removes text and fee", () => { const v = validateSelection({ selection: { ...complete.selection, engravingEnabled: false } }, catalog); expect(v.selection.engraving).toBe(""); expect(v.prices.engraving.amount).toBe(0); });
  test("engraving counts Unicode characters and rejects hidden control characters", () => { expect(validateSelection({ selection: { ...complete.selection, engraving: "💎".repeat(20) } }, catalog).selection.engraving).toBe("💎".repeat(20)); expect(() => validateSelection({ selection: { ...complete.selection, engraving: "a\nb" } }, catalog)).toThrow(/without line breaks/); expect(() => validateSelection({ selection: { ...complete.selection, engraving: "a".repeat(21) } }, catalog)).toThrow(); });
});
test("diamond filters return a real empty result and reject invalid ranges", () => { expect(filterDiamonds(catalog.diamonds, new URLSearchParams("shape=Oval&origin=Natural&minCarat=1&maxCarat=1.2"))).toHaveLength(1); expect(filterDiamonds(catalog.diamonds, new URLSearchParams("minCarat=10"))).toHaveLength(0); expect(() => filterDiamonds(catalog.diamonds, new URLSearchParams("minCarat=2&maxCarat=1"))).toThrow(); });
test("minor units are exact across zero and three-decimal currencies", () => { expect(minorUnits("2450.00", "USD")).toBe(245000); expect(minorUnits("2450", "JPY")).toBe(2450); expect(minorUnits("1.234", "KWD")).toBe(1234); });
