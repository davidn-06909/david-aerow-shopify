CREATE TABLE "FittingState" (
    "shop" TEXT NOT NULL,
    "draft" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "activeVersion" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FittingState_pkey" PRIMARY KEY ("shop")
);

CREATE TABLE "FittingRelease" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "report" JSONB NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FittingRelease_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FittingRelease_shop_createdAt_idx" ON "FittingRelease"("shop", "createdAt");

CREATE TABLE "ManufacturingDecision" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "configuredOrderId" TEXT NOT NULL,
    "configurationId" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "fitReleaseId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ManufacturingDecision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ManufacturingDecision_shop_requestId_key" ON "ManufacturingDecision"("shop", "requestId");
CREATE INDEX "ManufacturingDecision_configuredOrderId_configurationId_createdAt_idx" ON "ManufacturingDecision"("configuredOrderId", "configurationId", "createdAt");
ALTER TABLE "ManufacturingDecision" ADD CONSTRAINT "ManufacturingDecision_configuredOrderId_fkey" FOREIGN KEY ("configuredOrderId") REFERENCES "ConfiguredOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
