import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Bootstrap, Metal, PilotDiamond } from "../../shared/contract";
import { PILOT_VERSION } from "./manifest.server";
const secureImage = (url: string) => url.startsWith("//") ? `https:${url}` : url;
/** Audited catalog capture for visual QA only; never consumed by quote validation. */
export async function previewCatalog(): Promise<Bootstrap> {
  const capture = JSON.parse(await readFile(resolve("config/reference-catalog.json"), "utf8"));
  const currency = capture.currency as string;
  return {
    mode: "read-only", canPurchase: false, shop: capture.shop, currency,
    pilotVersion: PILOT_VERSION, assetVersion: "lumen-visual-v2", assetBaseUrl: "/models",
    notices: [`Read-only visual preview. Shopify catalog captured ${capture.capturedAt}; reconnect the installed app for current prices, stock and purchase.`, "Representative 3D proportions; physical gemstone fitting is unverified.", "Diamond selection in this preview does not verify or reserve current stock."],
    setting: { handle: capture.setting.handle, title: capture.setting.title, style: "Hidden halo", shank: "High polish", imageUrl: secureImage(capture.setting.image), variants: capture.setting.variants.map((v: { id: number; options: string[]; price: number; available: boolean }) => ({ id: String(v.id), metal: v.options[0] as Metal, size: v.options[1], price: { amount: v.price, currency }, available: v.available })) },
    engraving: { variantId: capture.engravingVariant, price: { amount: capture.engravingPrice, currency }, available: true, maxLength: 20 },
    diamonds: capture.diamonds.map((d: Record<string, string>): PilotDiamond => ({ id: d.diamondId, sourceVariantId: d.diamondId, handle: d.diamondHandle, title: d.diamondTitle, shape: d.diamondShape as PilotDiamond["shape"], origin: d.diamondOrigin as PilotDiamond["origin"], carat: Number(d.diamondCarat), color: d.diamondColor, clarity: d.diamondClarity, cut: d.diamondCut, certificateLab: d.diamondLab, certificateNumber: d.diamondCertificate, certificateUrl: d.diamondCertificatePdf, price: { amount: Number(d.diamondPrice), currency }, available: true, imageUrl: secureImage(d.diamondImage) })),
  };
}
