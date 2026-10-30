import "@shopify/shopify-app-react-router/adapters/node";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "../app/db.server";
import { requestClientCredentialsSession } from "../app/services/client-credentials.server";
try {
  const shop = process.env.PILOT_ALLOWED_SHOP;
  if (!shop) throw new Error("Set PILOT_ALLOWED_SHOP to the installed development store.");
  const session = await requestClientCredentialsSession(shop);
  await new PrismaSessionStorage(prisma).storeSession(session);
  console.log(`Installed app offline session stored for ${shop}. Token retained only server-side; expires ${session.expires?.toISOString()}.`);
} finally { await prisma.$disconnect(); }
