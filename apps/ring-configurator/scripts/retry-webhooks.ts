import prisma from "../app/db.server";
import { processOrderReceipt } from "../app/services/orders.server";
import { unauthenticated } from '../app/shopify.server';
import { ORDER_TOPICS } from '../app/services/order-lifecycle';
const shop = process.env.PILOT_ALLOWED_SHOP;
if (!shop) throw new Error('PILOT_ALLOWED_SHOP_REQUIRED');
const { admin } = await unauthenticated.admin(shop);
const receipts = await prisma.webhookReceipt.findMany({ where: { shop, status: { in: ["pending", "failed"] }, nextAttemptAt: { lte: new Date() }, topic: { in: [...ORDER_TOPICS] } }, orderBy: { createdAt: "asc" }, take: 100, select: { id: true } });
let failures = 0;
for (const receipt of receipts) { try { await processOrderReceipt(receipt.id, admin); } catch { failures++; } }
console.log(`Order audit replay: ${receipts.length - failures} processed, ${failures} failed.`);
await prisma.$disconnect();
if (failures) process.exitCode = 1;
