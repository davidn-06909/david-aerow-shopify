import { PrismaClient } from "@prisma/client";
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
function connection() {
  const value = process.env.DATABASE_URL;
  if (!value) return undefined;
  const url = new URL(value);
  if (!url.searchParams.has('connect_timeout')) url.searchParams.set('connect_timeout', '30');
  if (!url.searchParams.has('pool_timeout')) url.searchParams.set('pool_timeout', '15');
  if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '2');
  return { db: { url: url.href } };
}
const prisma = globalForPrisma.prisma || new PrismaClient({ datasources: connection(), errorFormat: 'minimal' });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
export default prisma;
