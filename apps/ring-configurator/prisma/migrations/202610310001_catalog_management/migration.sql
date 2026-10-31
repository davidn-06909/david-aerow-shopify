CREATE TABLE "CatalogState" (
  "shop" TEXT NOT NULL PRIMARY KEY,
  "draft" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "activeVersion" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "CatalogRelease" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shop" TEXT NOT NULL,
  "manifest" JSONB NOT NULL,
  "report" JSONB NOT NULL,
  "action" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "restoredFrom" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "CatalogRelease_shop_createdAt_idx" ON "CatalogRelease"("shop", "createdAt");
