import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { assertShopifyConfigured } from "../services/configured.server";
export async function action({ request }: ActionFunctionArgs) { assertShopifyConfigured(); const { shop } = await authenticate.webhook(request); await prisma.session.deleteMany({ where: { shop } }); return new Response(null, { status: 200 }); }
