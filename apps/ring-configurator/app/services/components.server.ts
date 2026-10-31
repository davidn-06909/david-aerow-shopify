import type { Prisma } from '@prisma/client';
import type { PilotManifest } from './manifest.server';
import { numericId, settingMappings } from './manifest.server';
export async function registerComponents(tx: Prisma.TransactionClient, shop: string, manifest: PilotManifest) {
  const data = [
    ...settingMappings(manifest).map(s => ({ shop, kind: 'product', referenceId: numericId(s.productId) })),
    ...[manifest.engravingVariantId, ...manifest.diamonds.map(d => d.variantId)].map(id => ({ shop, kind: 'variant', referenceId: numericId(id) })),
  ];
  await tx.managedComponent.createMany({ data, skipDuplicates: true });
}
