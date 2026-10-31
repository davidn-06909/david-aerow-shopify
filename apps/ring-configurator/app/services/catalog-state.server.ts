import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import prisma from "../db.server";
import { assertMapping, manifestSchema, readManifest, type PilotManifest } from "./manifest.server";
import { PilotError } from "./errors.server";
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export function parseManifest(input: unknown, shop: string): PilotManifest {
  const parsed = manifestSchema.safeParse(input);
  if (!parsed.success) throw new PilotError("INVALID_CATALOG", "Correct the highlighted catalog fields.", 422, Object.fromEntries(parsed.error.issues.map(i => [i.path.join("."), i.message])));
  assertMapping(parsed.data, shop);
  return parsed.data;
}
export async function activeManifest(shop: string) {
  const state = await prisma.catalogState.findUnique({ where: { shop } });
  if (!state) { const manifest = await readManifest(); assertMapping(manifest, shop); return { manifest, version: "legacy-pilot" }; }
  const release = await prisma.catalogRelease.findFirst({ where: { id: state.activeVersion, shop } });
  if (!release) throw new PilotError("CATALOG_VERSION", "The active catalog version is unavailable.", 503);
  return { manifest: parseManifest(release.manifest, shop), version: release.id };
}
export async function initializeCatalog(shop: string, actor = "setup") {
  const existing = await prisma.catalogState.findUnique({ where: { shop } });
  if (existing) return existing;
  const manifest = parseManifest(await readManifest(), shop);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${shop}))`;
    const prior = await tx.catalogState.findUnique({ where: { shop } });
    if (prior) return prior;
    const release = await tx.catalogRelease.create({ data: { id: randomUUID(), shop, manifest: json(manifest), report: json({ errors: [], warnings: ["Imported existing pilot configuration; validate before making changes."] }), action: "initialize", actor } });
    return tx.catalogState.create({ data: { shop, draft: json(manifest), revision: 1, activeVersion: release.id } });
  });
}
export async function saveCatalogDraft(shop: string, revision: number, input: unknown) {
  const manifest = parseManifest(input, shop);
  const result = await prisma.catalogState.updateMany({ where: { shop, revision }, data: { draft: json(manifest), revision: { increment: 1 } } });
  if (result.count !== 1) throw new PilotError("DRAFT_CONFLICT", "Another tab changed this draft. Your edits are retained below; reload the latest draft before saving again.", 409);
  return revision + 1;
}
export async function activateCatalog(shop: string, revision: number, manifest: PilotManifest, report: unknown, actor: string, restoredFrom?: string) {
  return prisma.$transaction(async tx => {
    // Compare-and-swap serializes publication with draft edits and other releases.
    const version = randomUUID();
    const changed = await tx.catalogState.updateMany({ where: { shop, revision }, data: { activeVersion: version, draft: json(manifest), revision: { increment: 1 } } });
    if (changed.count !== 1) throw new PilotError("DRAFT_CONFLICT", "The draft changed during validation. Reload and validate its latest revision.", 409);
    await tx.catalogRelease.create({ data: { id: version, shop, manifest: json(manifest), report: json(report), actor, action: restoredFrom ? "restore" : "publish", restoredFrom } });
    return version;
  });
}
