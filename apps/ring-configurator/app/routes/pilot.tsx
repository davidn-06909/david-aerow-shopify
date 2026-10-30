import type { LoaderFunctionArgs } from "react-router";
/** Standalone resource HTML: the storefront bundle owns this root, matching
 * the Shopify theme app block without a second React hydration tree. */
export const loader = async (_args: LoaderFunctionArgs) => {
  if (process.env.ENABLE_READ_ONLY_PREVIEW !== "true") throw new Response("Not found", { status: 404 });
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aevow — Ring visual pilot</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/pilot-assets/ring-configurator.css"></head><body><div data-aevow-ring-builder data-api-base="/preview"></div><script type="module" src="/pilot-assets/ring-configurator.js"></script></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
};
