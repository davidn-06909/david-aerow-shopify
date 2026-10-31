ALTER TABLE "WebhookReceipt" ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "leaseUntil" TIMESTAMP(3), ADD COLUMN "leaseToken" TEXT,
  ADD COLUMN "consecutiveFailures" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "WebhookReceipt_shop_status_nextAttemptAt_idx" ON "WebhookReceipt"("shop", "status", "nextAttemptAt");
CREATE TABLE "ConfiguredOrder" (
  "id" TEXT NOT NULL PRIMARY KEY, "shop" TEXT NOT NULL, "orderId" TEXT NOT NULL,
  "name" TEXT NOT NULL, "paymentState" TEXT NOT NULL, "cancelled" BOOLEAN NOT NULL DEFAULT false,
  "sourceUpdatedAt" TIMESTAMP(3) NOT NULL, "synchronizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verification" TEXT NOT NULL, "digest" TEXT NOT NULL, "version" INTEGER NOT NULL DEFAULT 1, "facts" JSONB NOT NULL,
  "settingIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
);
CREATE UNIQUE INDEX "ConfiguredOrder_shop_orderId_key" ON "ConfiguredOrder"("shop", "orderId");
CREATE INDEX "ConfiguredOrder_shop_synchronizedAt_idx" ON "ConfiguredOrder"("shop", "synchronizedAt");
CREATE INDEX "ConfiguredOrder_shop_verification_synchronizedAt_idx" ON "ConfiguredOrder"("shop", "verification", "synchronizedAt");
CREATE TABLE "OrderAuditRun" (
  "id" TEXT NOT NULL PRIMARY KEY, "configuredOrderId" TEXT NOT NULL REFERENCES "ConfiguredOrder"("id"),
  "source" TEXT NOT NULL, "version" INTEGER NOT NULL, "digest" TEXT NOT NULL, "verification" TEXT NOT NULL, "evidence" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "OrderAuditRun_configuredOrderId_createdAt_idx" ON "OrderAuditRun"("configuredOrderId", "createdAt");
CREATE UNIQUE INDEX "OrderAuditRun_configuredOrderId_version_key" ON "OrderAuditRun"("configuredOrderId", "version");
CREATE TABLE "OperationAction" (
  "id" TEXT NOT NULL PRIMARY KEY, "shop" TEXT NOT NULL, "requestId" TEXT NOT NULL,
  "actor" TEXT NOT NULL, "intent" TEXT NOT NULL, "target" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "OperationAction_shop_requestId_key" ON "OperationAction"("shop", "requestId");
CREATE INDEX "OperationAction_shop_createdAt_idx" ON "OperationAction"("shop", "createdAt");
CREATE TABLE "MerchantOrderAction" (
  "id" TEXT NOT NULL PRIMARY KEY, "shop" TEXT NOT NULL, "requestId" TEXT NOT NULL,
  "configuredOrderId" TEXT NOT NULL REFERENCES "ConfiguredOrder"("id"), "actor" TEXT NOT NULL,
  "auditId" TEXT NOT NULL, "decision" TEXT NOT NULL, "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "MerchantOrderAction_shop_requestId_key" ON "MerchantOrderAction"("shop", "requestId");
CREATE INDEX "MerchantOrderAction_configuredOrderId_createdAt_idx" ON "MerchantOrderAction"("configuredOrderId", "createdAt");
CREATE TABLE "JobCheckpoint" (
  "shop" TEXT NOT NULL, "kind" TEXT NOT NULL, "checkpoint" JSONB, "leaseUntil" TIMESTAMP(3),
  "leaseToken" TEXT, "lastSuccessAt" TIMESTAMP(3), "lastError" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("shop", "kind")
);
CREATE TABLE "ManagedComponent" ("shop" TEXT NOT NULL, "kind" TEXT NOT NULL, "referenceId" TEXT NOT NULL, PRIMARY KEY ("shop", "kind", "referenceId"));
CREATE TABLE "RequestBucket" (
  "shop" TEXT NOT NULL, "key" TEXT NOT NULL, "window" TIMESTAMP(3) NOT NULL, "count" INTEGER NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMP(3) NOT NULL, PRIMARY KEY ("shop", "key", "window")
);
CREATE INDEX "RequestBucket_expiresAt_idx" ON "RequestBucket"("expiresAt");
-- Membership only: no saved snapshot, preview or historical association is changed.
INSERT INTO "ManagedComponent" ("shop", "kind", "referenceId")
SELECT "shop", 'variant', regexp_replace(item->>'id', '^.*/', '')
FROM "Design", LATERAL jsonb_array_elements(COALESCE("snapshot"->'items', '[]'::jsonb)) item
WHERE item->>'id' IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO "ManagedComponent" ("shop", "kind", "referenceId")
SELECT "shop", 'product', regexp_replace("manifest"->>'settingProductId', '^.*/', '') FROM "CatalogRelease"
WHERE "manifest"->>'settingProductId' IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO "ManagedComponent" ("shop", "kind", "referenceId")
SELECT "shop", 'product', regexp_replace(setting->>'productId', '^.*/', '')
FROM "CatalogRelease", LATERAL jsonb_array_elements(COALESCE("manifest"->'settings', '[]'::jsonb)) setting
WHERE setting->>'productId' IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO "ManagedComponent" ("shop", "kind", "referenceId")
SELECT "shop", 'variant', regexp_replace(diamond->>'variantId', '^.*/', '')
FROM "CatalogRelease", LATERAL jsonb_array_elements(COALESCE("manifest"->'diamonds', '[]'::jsonb)) diamond
WHERE diamond->>'variantId' IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO "ManagedComponent" ("shop", "kind", "referenceId")
SELECT "shop", 'variant', regexp_replace("manifest"->>'engravingVariantId', '^.*/', '') FROM "CatalogRelease"
WHERE "manifest"->>'engravingVariantId' IS NOT NULL ON CONFLICT DO NOTHING;
