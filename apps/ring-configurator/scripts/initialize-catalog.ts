import prisma from "../app/db.server";
import { initializeCatalog } from "../app/services/catalog-state.server";
try {
  const shop = process.env.PILOT_ALLOWED_SHOP;
  if (!shop) throw new Error("Configure PILOT_ALLOWED_SHOP before initializing its catalog.");
  const state = await initializeCatalog(shop, "configuration-import");
  console.log(JSON.stringify({ shop, revision: state.revision, activeVersion: state.activeVersion }));
} finally { await prisma.$disconnect(); }
