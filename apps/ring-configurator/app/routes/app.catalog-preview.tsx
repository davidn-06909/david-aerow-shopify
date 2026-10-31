import { useEffect, useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { Link } from "react-router";
import { merchant } from "../services/merchant.server";
import { RingConfigurator } from "../../storefront/app";
import "../../storefront/style.css";
export const loader = async ({ request }: LoaderFunctionArgs) => { await merchant(request); return null; };
export default function DraftPreview() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <><aside style={{ padding: 16, background: "#fff3cc", color: "#342600" }}><strong>Saved draft preview</strong> · Purchasing is disabled. <Link to="/app/catalog">Return to catalog</Link></aside>{mounted && <RingConfigurator apiBase="/app/draft-api" />}</>;
}
