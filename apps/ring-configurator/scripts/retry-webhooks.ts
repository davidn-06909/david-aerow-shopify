import prisma from "../app/db.server";
import { processOrderReceipt } from "../app/services/orders.server";
const receipts = await prisma.webhookReceipt.findMany({ where: { status: { in: ["pending", "failed"] }, topic: "ORDERS_CREATE" }, orderBy: { createdAt: "asc" }, take: 100, select: { id: true } });
let failures = 0;
for (const receipt of receipts) { try { await processOrderReceipt(receipt.id); } catch { failures++; } }
console.log(`Order audit replay: ${receipts.length - failures} processed, ${failures} failed.`);
await prisma.$disconnect();
if (failures) process.exitCode = 1;
