import copy from '../locales/en.json';
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, Outlet, useLoaderData, useRouteError } from "react-router";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
export const loader = async ({ request }: LoaderFunctionArgs) => { await authenticate.admin(request); return { apiKey: process.env.SHOPIFY_API_KEY || "" }; };
export default function AdminApp() { const { apiKey } = useLoaderData<typeof loader>(); return <AppProvider apiKey={apiKey}><nav aria-label={copy.aevowApp} style={{ display: 'flex', gap: 24, flexWrap: 'wrap', padding: '14px 32px', background: '#fff', borderBottom: '1px solid #dce1e8', font: '14px system-ui' }}><Link to="/app">{copy.overview}</Link><Link to="/app/catalog">{copy.catalog}</Link><Link to="/app/orders">{copy.configuredOrders}</Link><Link to="/app/operations">{copy.operationsHealth}</Link></nav><Outlet /></AppProvider>; }
export function ErrorBoundary() { return boundary.error(useRouteError()); }
export const headers: HeadersFunction = args => boundary.headers(args);
