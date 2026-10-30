import { redirect, type LoaderFunctionArgs } from "react-router";
export const loader = ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  // Preserve Shopify's embedded bootstrap parameters; the authenticated layout
  // verifies them. Do not print or copy id_token values into diagnostics.
  if (url.searchParams.has("shop") || url.searchParams.has("host") || url.searchParams.has("id_token")) return redirect(`/app${url.search}`);
  return null;
};
export default function Index() {
  return <main style={{ maxWidth: 760, margin: "80px auto", fontFamily: "system-ui", lineHeight: 1.6 }}><h1>Aevow Ring Configurator</h1><p>Milestone 1 visual pilot. Open this app from Shopify admin to inspect the authenticated catalog, storage and order checks.</p><p><a href="/app">Open admin diagnostics</a></p><p>Purchase availability depends on the installed development store's configuration and current inventory.</p></main>;
}
