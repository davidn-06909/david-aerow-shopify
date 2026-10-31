import '@shopify/shopify-app-react-router/adapters/node';
import { PrismaSessionStorage } from '@shopify/shopify-app-session-storage-prisma';
import prisma from '../app/db.server';
import { requestClientCredentialsSession } from '../app/services/client-credentials.server';
import { installCheckoutGuard, checkoutGuardStatus } from '../app/services/checkout-guard.server';
import { unauthenticated } from '../app/shopify.server';

try {
  const shop = process.env.PILOT_ALLOWED_SHOP;
  if (!shop || shop !== 'aerow-qdbfzxwi.myshopify.com') throw new Error('This setup script is restricted to the approved Aerow development store.');
  const session = await requestClientCredentialsSession(shop);
  await new PrismaSessionStorage(prisma).storeSession(session);
  const { admin } = await unauthenticated.admin(shop);
  const created = await installCheckoutGuard(admin, shop);
  const verified = await checkoutGuardStatus(admin, shop);
  if (!verified.enabled || !verified.blockOnFailure || verified.id !== created.id) throw new Error('Shopify did not report the checkout guard active.');
  console.log(JSON.stringify({ guardId: created.id, enabled: verified.enabled, blockOnFailure: verified.blockOnFailure, products: created.products, variants: created.variants }));
} finally { await prisma.$disconnect(); }
