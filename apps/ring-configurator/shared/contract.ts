/** Public storefront contract. Commerce data is supplied by Shopify, never by the viewer. */
export const METALS = ['14K yellow gold', '14K white gold', '14K rose gold', 'Platinum'] as const;
export const SHAPES = ['Round', 'Oval'] as const;
export const STEPS = ['style', 'shank', 'metal', 'shape', 'diamond', 'size', 'engraving', 'review'] as const;
export type Metal = typeof METALS[number];
export type Shape = typeof SHAPES[number];
export type Step = typeof STEPS[number];
export interface Money { amount: number; currency: string }
export interface Selection {
  style: 'Hidden halo'; shank: 'High polish'; metal: Metal | ''; shape: Shape | '';
  diamondId: string; size: string; engraving: string; engravingEnabled: boolean;
}
export interface SettingVariant { id: string; metal: Metal; size: string; price: Money; available: boolean }
export interface PilotDiamond {
  id: string; sourceVariantId: string; handle: string; title: string; shape: Shape;
  origin: 'Lab grown' | 'Natural'; carat: number; color: string; clarity: string; cut: string;
  certificateLab: string; certificateNumber: string; certificateUrl: string;
  price: Money; available: boolean; imageUrl: string;
}
export interface Bootstrap {
  mode: 'connected' | 'read-only'; shop: string; currency: string; pilotVersion: string; assetVersion: string;
  assetBaseUrl: string; canPurchase: boolean; notices: string[];
  setting: { handle: string; title: string; style: 'Hidden halo'; shank: 'High polish'; imageUrl: string; variants: SettingVariant[] };
  engraving: { variantId: string; price: Money; available: boolean; maxLength: number };
  diamonds: PilotDiamond[];
}
export interface CartLineInput { id: string; quantity: number; properties: Record<string, string> }
export interface QuoteRequest { selection: Selection; cartGroupId?: string; previewDataUrl?: string; requestId?: string }
export interface Quote {
  id: string; expiresAt: string; designId: string; configurationId: string; reference: string; selection: Selection;
  items: CartLineInput[]; prices: { setting: Money; diamond: Money; engraving: Money; total: Money };
  previewUrl?: string; shareUrl?: string;
}
export interface SavedDesign { id: string; selection: Selection; previewUrl?: string; createdAt: string; pilotVersion: string; assetVersion: string; fittingStatus: 'visual-unverified'; priceContext?: Quote['prices'] }
export interface ApiError { error: { code: string; message: string; fields?: Record<string, string> } }
export interface ViewerConfiguration { shape: Shape; metal: string; size: string | number; engraving: string; diamondCarat?: number; assetBaseUrl?: string; assetVersion?: string }
declare global {
  interface Window {
    AevowRingCart?: {
      withPreviewContext?(path: string | URL): string;
      addConfiguration(quote: Quote): Promise<unknown>;
      editConfiguration(groupId: string, quote: Quote): Promise<unknown>;
      removeConfiguration(groupId: string): Promise<unknown>;
    };
    AevowRingPreviewUrl?: (path: string | URL) => string;
  }
}
